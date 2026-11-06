-- ============================================================
-- SAMORAI · Precios editables y promociones (descuentos por fechas)
--
--   · product_prices: precio unitario FINAL (IVA incluido) por modelo y ancho.
--     Sustituye a la regla fija de app/lib/pricing.ts (que queda como valor
--     por defecto si la base de datos no está disponible).
--   · promotions: descuento porcentual con inicio/fin, aplicable a toda la
--     tienda o a modelos / acabados concretos. Si varias coinciden sobre la
--     misma referencia, se aplica la de mayor porcentaje (no se acumulan).
--
-- Solo el servidor (service_role) lee y escribe; el panel /admin comprueba
-- el rol de administrador antes de llamar a estas funciones.
-- ============================================================

create table if not exists public.product_prices (
  product_slug      text not null check (product_slug ~ '^[a-z0-9-]{1,80}$'),
  width             numeric(4, 1) not null check (width > 0 and width < 20),
  unit_price_cents  integer not null check (unit_price_cents between 100 and 10000000),
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  primary key (product_slug, width)
);

-- Precios vigentes al crear la tabla (los mismos de app/lib/pricing.ts).
insert into public.product_prices (product_slug, width, unit_price_cents) values
  ('victoria', 8.5, 27500),
  ('victoria', 9.0, 30000),
  ('victoria', 9.5, 30000)
on conflict do nothing;

create table if not exists public.promotions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  -- Texto de la etiqueta visible en la web (p. ej. «Black Friday»).
  badge          text not null check (char_length(btrim(badge)) between 1 and 40),
  percent_off    integer not null check (percent_off between 1 and 90),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  -- Vacío = todos los modelos / todos los acabados.
  product_slugs  text[] not null default '{}',
  finish_ids     text[] not null default '{}',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  constraint promotions_dates_check check (ends_at > starts_at)
);

create index if not exists promotions_window_idx on public.promotions (starts_at, ends_at) where active;

drop trigger if exists promotions_set_updated_at on public.promotions;
create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

-- Auditoría: nuevos tipos de entidad.
alter table public.audit_events drop constraint if exists audit_events_entity_type_check;
alter table public.audit_events add constraint audit_events_entity_type_check check (entity_type in (
  'batch', 'reservation', 'order', 'allocation', 'payment', 'notification', 'profile', 'system',
  'price', 'promotion'
));

-- ------------------------------------------------------------
-- Lectura pública (servidor): precios + promociones vigentes en p_now
-- ------------------------------------------------------------
create or replace function public.pricing_public_snapshot(
  p_now timestamptz default now()
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_slug', product_slug,
               'width', width,
               'unit_price_cents', unit_price_cents
             ) order by product_slug, width)
      from public.product_prices
    ), '[]'::jsonb),
    'promotions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id,
               'name', name,
               'badge', badge,
               'percent_off', percent_off,
               'starts_at', starts_at,
               'ends_at', ends_at,
               'product_slugs', to_jsonb(product_slugs),
               'finish_ids', to_jsonb(finish_ids)
             ) order by percent_off desc, starts_at desc)
      from public.promotions
      where active and starts_at <= p_now and ends_at > p_now
    ), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------
-- Administración
-- ------------------------------------------------------------
create or replace function public.pricing_admin_overview()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_slug', product_slug,
               'width', width,
               'unit_price_cents', unit_price_cents,
               'updated_at', updated_at
             ) order by product_slug, width)
      from public.product_prices
    ), '[]'::jsonb),
    'promotions', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.starts_at desc)
      from public.promotions p
    ), '[]'::jsonb)
  );
$$;

create or replace function public.pricing_admin_set_price(
  p_product_slug     text,
  p_width            numeric,
  p_unit_price_cents integer,
  p_actor            uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old integer;
begin
  if p_product_slug is null or p_product_slug !~ '^[a-z0-9-]{1,80}$'
     or p_width is null or p_width <= 0 or p_width >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;
  if p_unit_price_cents is null or p_unit_price_cents < 100 or p_unit_price_cents > 10000000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_price');
  end if;

  select unit_price_cents into v_old
  from public.product_prices
  where product_slug = p_product_slug and width = p_width
  for update;

  if v_old is not distinct from p_unit_price_cents then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  insert into public.product_prices (product_slug, width, unit_price_cents, updated_at, updated_by)
  values (p_product_slug, p_width, p_unit_price_cents, now(), p_actor)
  on conflict (product_slug, width) do update
    set unit_price_cents = excluded.unit_price_cents,
        updated_at = now(),
        updated_by = excluded.updated_by;

  insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
  values ('price', p_product_slug || ':' || p_width::text, 'updated', 'admin', p_actor,
          jsonb_build_object('from', v_old, 'to', p_unit_price_cents));

  return jsonb_build_object('ok', true, 'changed', true, 'from', v_old, 'to', p_unit_price_cents);
end;
$$;

/**
 * Crea (p_id null) o actualiza una promoción. p_fields:
 *   name, badge, percent_off, starts_at, ends_at, product_slugs[], finish_ids[], active
 */
create or replace function public.pricing_admin_save_promotion(
  p_id     uuid,
  p_fields jsonb,
  p_actor  uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name     text;
  v_badge    text;
  v_percent  integer;
  v_starts   timestamptz;
  v_ends     timestamptz;
  v_products text[];
  v_finishes text[];
  v_active   boolean;
  v_id       uuid;
  v_old      jsonb;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;

  begin
    v_name    := btrim(p_fields->>'name');
    v_badge   := btrim(coalesce(nullif(p_fields->>'badge', ''), p_fields->>'name'));
    v_percent := (p_fields->>'percent_off')::integer;
    v_starts  := (p_fields->>'starts_at')::timestamptz;
    v_ends    := (p_fields->>'ends_at')::timestamptz;
    v_active  := coalesce((p_fields->>'active')::boolean, true);
    select coalesce(array_agg(x), '{}') into v_products
      from jsonb_array_elements_text(coalesce(p_fields->'product_slugs', '[]'::jsonb)) x;
    select coalesce(array_agg(x), '{}') into v_finishes
      from jsonb_array_elements_text(coalesce(p_fields->'finish_ids', '[]'::jsonb)) x;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end;

  if v_name is null or char_length(v_name) not between 1 and 80
     or v_badge is null or char_length(v_badge) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  if v_percent is null or v_percent not between 1 and 90 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_percent');
  end if;
  if v_starts is null or v_ends is null or v_ends <= v_starts then
    return jsonb_build_object('ok', false, 'reason', 'invalid_dates');
  end if;

  if p_id is null then
    insert into public.promotions (name, badge, percent_off, starts_at, ends_at, product_slugs, finish_ids, active, created_by)
    values (v_name, v_badge, v_percent, v_starts, v_ends, v_products, v_finishes, v_active, p_actor)
    returning id into v_id;

    insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
    values ('promotion', v_id::text, 'created', 'admin', p_actor, p_fields);
  else
    select to_jsonb(p) into v_old from public.promotions p where id = p_id for update;
    if v_old is null then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;

    update public.promotions
       set name = v_name, badge = v_badge, percent_off = v_percent,
           starts_at = v_starts, ends_at = v_ends,
           product_slugs = v_products, finish_ids = v_finishes, active = v_active
     where id = p_id;
    v_id := p_id;

    insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
    values ('promotion', v_id::text, 'updated', 'admin', p_actor,
            jsonb_build_object('before', v_old, 'after', p_fields));
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.pricing_admin_set_promotion_active(
  p_id     uuid,
  p_active boolean,
  p_actor  uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.promotions set active = p_active where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
  values ('promotion', p_id::text, case when p_active then 'activated' else 'deactivated' end, 'admin', p_actor, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pricing_admin_delete_promotion(
  p_id    uuid,
  p_actor uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
begin
  delete from public.promotions p where p.id = p_id returning to_jsonb(p) into v_old;
  if v_old is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
  values ('promotion', p_id::text, 'deleted', 'admin', p_actor, v_old);
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- Permisos: solo service_role (servidor)
-- ------------------------------------------------------------
alter table public.product_prices enable row level security;
alter table public.promotions     enable row level security;

revoke all on table public.product_prices, public.promotions from anon, authenticated;
grant all on table public.product_prices, public.promotions to service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pricing\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
