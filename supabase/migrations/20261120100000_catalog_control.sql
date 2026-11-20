-- ============================================================
-- Control del catálogo desde /admin/catalogo
--
--   · store_settings    ajustes de la tienda (umbral de «Últimas unidades»).
--   · catalog_finishes  por acabado: visible en la web, ocultar al agotarse
--                       y etiqueta manual (un CÓDIGO; el texto se traduce en
--                       la web: «Nuevo» / «New»…).
--   · catalog_variants  por referencia: stock (null = sin control, se vende
--                       sin límite como hasta ahora) y si está activa.
--   · stock_holds       stock apartado mientras el cliente paga en Stripe:
--                       evita vender dos veces las últimas unidades.
--   · promotions.badge_en  etiqueta de la promoción en inglés (opcional).
--
-- Sin filas, todo se comporta como antes: visible, sin etiqueta y sin
-- límite de stock. Solo el servidor (service_role) lee y escribe.
-- ============================================================

create table if not exists public.store_settings (
  key         text primary key check (key ~ '^[a-z_]{1,60}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

insert into public.store_settings (key, value)
values ('low_stock_threshold', '8'::jsonb)
on conflict (key) do nothing;

create table if not exists public.catalog_finishes (
  product_slug        text not null check (product_slug ~ '^[a-z0-9-]{1,80}$'),
  finish_id           text not null check (finish_id ~ '^[a-z0-9-]{1,80}$'),
  visible             boolean not null default true,
  hide_when_sold_out  boolean not null default false,
  label_code          text check (label_code is null or label_code ~ '^[a-z_]{1,40}$'),
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  primary key (product_slug, finish_id)
);

create table if not exists public.catalog_variants (
  variant_id  text primary key check (variant_id ~ '^[a-z0-9-]{1,120}$'),
  stock       integer check (stock is null or stock between 0 and 100000),
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table if not exists public.stock_holds (
  hold_key    text not null check (hold_key ~ '^[A-Za-z0-9_-]{8,120}$'),
  variant_id  text not null check (variant_id ~ '^[a-z0-9-]{1,120}$'),
  quantity    integer not null check (quantity between 1 and 10000),
  status      text not null default 'held' check (status in ('held', 'committed', 'released')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (hold_key, variant_id)
);

create index if not exists stock_holds_held_idx
  on public.stock_holds (variant_id, expires_at) where status = 'held';

alter table public.promotions
  add column if not exists badge_en text
  check (badge_en is null or char_length(btrim(badge_en)) between 1 and 40);

-- Auditoría: cambios del catálogo hechos desde el panel.
alter table public.audit_events drop constraint if exists audit_events_entity_type_check;
alter table public.audit_events add constraint audit_events_entity_type_check check (entity_type in (
  'batch', 'reservation', 'order', 'allocation', 'payment', 'notification', 'profile', 'system',
  'price', 'promotion', 'catalog'
));

-- ------------------------------------------------------------
-- Lectura pública (servidor): visibilidad, etiquetas y stock libre
-- ------------------------------------------------------------
create or replace function public.catalog_public_snapshot()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'low_stock_threshold',
      coalesce((select value from public.store_settings where key = 'low_stock_threshold'), '8'::jsonb),
    'finishes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_slug', product_slug,
               'finish_id', finish_id,
               'visible', visible,
               'hide_when_sold_out', hide_when_sold_out,
               'label_code', label_code
             ) order by product_slug, finish_id)
      from public.catalog_finishes
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'variant_id', v.variant_id,
               'stock', v.stock,
               'active', v.active,
               -- Apartado ahora mismo por pagos en curso.
               'held', (
                 select coalesce(sum(h.quantity), 0)
                 from public.stock_holds h
                 where h.variant_id = v.variant_id and h.status = 'held' and h.expires_at > now()
               )
             ) order by v.variant_id)
      from public.catalog_variants v
    ), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------
-- Administración
-- ------------------------------------------------------------
create or replace function public.catalog_admin_overview()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select public.catalog_public_snapshot() || jsonb_build_object(
    -- Unidades vendidas por referencia (pedidos cobrados y no anulados).
    'sold', coalesce((
      select jsonb_object_agg(variant_id, units)
      from (
        select i.variant_id, sum(i.quantity)::int as units
        from public.order_items i
        join public.orders o on o.id = i.order_id
        where o.status in ('paid', 'in_production', 'ready_to_ship', 'shipped', 'delivered')
        group by i.variant_id
      ) s
    ), '{}'::jsonb),
    'updated', coalesce((
      select jsonb_object_agg(variant_id, updated_at) from public.catalog_variants
    ), '{}'::jsonb)
  );
$$;

create or replace function public.catalog_admin_set_variant(
  p_variant_id text,
  p_stock      integer,
  p_active     boolean,
  p_actor      uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old    public.catalog_variants%rowtype;
  v_active boolean := coalesce(p_active, true);
begin
  if p_variant_id is null or p_variant_id !~ '^[a-z0-9-]{1,120}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;
  if p_stock is not null and (p_stock < 0 or p_stock > 100000) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_stock');
  end if;

  select * into v_old from public.catalog_variants where variant_id = p_variant_id for update;
  if (found and v_old.stock is not distinct from p_stock and v_old.active = v_active)
     or (not found and p_stock is null and v_active) then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  insert into public.catalog_variants (variant_id, stock, active, updated_at, updated_by)
  values (p_variant_id, p_stock, v_active, now(), p_actor)
  on conflict (variant_id) do update
    set stock = excluded.stock, active = excluded.active,
        updated_at = now(), updated_by = excluded.updated_by;

  insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
  values ('catalog', p_variant_id, 'variant_updated', 'admin', p_actor,
          jsonb_build_object(
            'from', case when v_old.variant_id is null then null
                         else jsonb_build_object('stock', v_old.stock, 'active', v_old.active) end,
            'to', jsonb_build_object('stock', p_stock, 'active', v_active)));

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

create or replace function public.catalog_admin_set_finish(
  p_product_slug        text,
  p_finish_id           text,
  p_visible             boolean,
  p_hide_when_sold_out  boolean,
  p_label_code          text,
  p_actor               uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old   public.catalog_finishes%rowtype;
  v_label text := nullif(btrim(coalesce(p_label_code, '')), '');
begin
  if p_product_slug is null or p_product_slug !~ '^[a-z0-9-]{1,80}$'
     or p_finish_id is null or p_finish_id !~ '^[a-z0-9-]{1,80}$'
     or (v_label is not null and v_label !~ '^[a-z_]{1,40}$') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;

  select * into v_old from public.catalog_finishes
   where product_slug = p_product_slug and finish_id = p_finish_id for update;

  insert into public.catalog_finishes (product_slug, finish_id, visible, hide_when_sold_out, label_code, updated_at, updated_by)
  values (p_product_slug, p_finish_id, coalesce(p_visible, true), coalesce(p_hide_when_sold_out, false), v_label, now(), p_actor)
  on conflict (product_slug, finish_id) do update
    set visible = excluded.visible, hide_when_sold_out = excluded.hide_when_sold_out,
        label_code = excluded.label_code, updated_at = now(), updated_by = excluded.updated_by;

  insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
  values ('catalog', p_product_slug || ':' || p_finish_id, 'finish_updated', 'admin', p_actor,
          jsonb_build_object(
            'from', case when v_old.product_slug is null then null
                         else jsonb_build_object('visible', v_old.visible, 'hide_when_sold_out', v_old.hide_when_sold_out, 'label_code', v_old.label_code) end,
            'to', jsonb_build_object('visible', coalesce(p_visible, true), 'hide_when_sold_out', coalesce(p_hide_when_sold_out, false), 'label_code', v_label)));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.catalog_admin_set_threshold(
  p_value integer,
  p_actor uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_value is null or p_value < 0 or p_value > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_threshold');
  end if;
  insert into public.store_settings (key, value, updated_at, updated_by)
  values ('low_stock_threshold', to_jsonb(p_value), now(), p_actor)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
  values ('catalog', 'low_stock_threshold', 'setting_updated', 'admin', p_actor, jsonb_build_object('to', p_value));
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- Stock durante la compra
--   reserve → (pago) → commit | release      ·      extend (pago diferido)
-- La clave (hold_key) la genera el servidor al crear el pago y viaja en los
-- metadatos de la sesión de Stripe.
-- ------------------------------------------------------------

-- Aparta el stock de un carrito. O se aparta todo o nada.
--   p_items: [{variant_id, quantity, product_slug, finish_id}]
create or replace function public.catalog_reserve(
  p_hold_key   text,
  p_items      jsonb,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r       record;
  v_row   public.catalog_variants%rowtype;
  v_fin   public.catalog_finishes%rowtype;
  v_held  integer;
  v_short jsonb := '[]'::jsonb;
begin
  if p_hold_key is null or p_hold_key !~ '^[A-Za-z0-9_-]{8,120}$'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or p_expires_at is null or p_expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;

  -- Orden fijo por referencia: dos pagos simultáneos no se bloquean entre sí.
  for r in
    select e->>'variant_id' as variant_id,
           sum((e->>'quantity')::int)::int as quantity,
           max(e->>'product_slug') as product_slug,
           max(e->>'finish_id') as finish_id
    from jsonb_array_elements(p_items) e
    group by e->>'variant_id'
    order by 1
  loop
    if r.variant_id is null or r.variant_id !~ '^[a-z0-9-]{1,120}$' or r.quantity is null or r.quantity < 1 then
      delete from public.stock_holds where hold_key = p_hold_key and status = 'held';
      return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
    end if;

    select * into v_fin from public.catalog_finishes
     where product_slug = r.product_slug and finish_id = r.finish_id;
    if found and not v_fin.visible then
      v_short := v_short || jsonb_build_array(jsonb_build_object('variant_id', r.variant_id, 'available', 0, 'reason', 'hidden'));
      continue;
    end if;

    select * into v_row from public.catalog_variants where variant_id = r.variant_id for update;
    if not found then
      continue; -- sin control: se vende como siempre
    end if;
    if not v_row.active then
      v_short := v_short || jsonb_build_array(jsonb_build_object('variant_id', r.variant_id, 'available', 0, 'reason', 'inactive'));
      continue;
    end if;
    if v_row.stock is null then
      continue;
    end if;

    select coalesce(sum(quantity), 0) into v_held
      from public.stock_holds
     where variant_id = r.variant_id and status = 'held' and expires_at > now() and hold_key <> p_hold_key;

    if v_row.stock - v_held < r.quantity then
      v_short := v_short || jsonb_build_array(jsonb_build_object(
        'variant_id', r.variant_id, 'available', greatest(v_row.stock - v_held, 0), 'reason', 'stock'));
      continue;
    end if;

    insert into public.stock_holds (hold_key, variant_id, quantity, expires_at)
    values (p_hold_key, r.variant_id, r.quantity, p_expires_at)
    on conflict (hold_key, variant_id) do update
      set quantity = excluded.quantity, expires_at = excluded.expires_at, status = 'held', updated_at = now();
  end loop;

  if jsonb_array_length(v_short) > 0 then
    delete from public.stock_holds where hold_key = p_hold_key and status = 'held';
    return jsonb_build_object('ok', false, 'reason', 'unavailable', 'short', v_short);
  end if;
  -- held = líneas con stock controlado que han quedado apartadas.
  return jsonb_build_object('ok', true, 'held', (
    select count(*) from public.stock_holds where hold_key = p_hold_key and status = 'held'));
end;
$$;

-- Venta cobrada: descuenta el stock. Idempotente por (clave, referencia):
-- un reintento del webhook no descuenta dos veces. Si ya no había stock
-- suficiente (caso raro: reserva caducada), lo devuelve en «oversold».
create or replace function public.catalog_commit(
  p_hold_key text,
  p_items    jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r          record;
  v_tracked  boolean;
  v_stock    integer;
  v_oversold jsonb := '[]'::jsonb;
  v_done     integer := 0;
begin
  if p_hold_key is null or p_hold_key !~ '^[A-Za-z0-9_-]{8,120}$'
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;

  for r in
    select e->>'variant_id' as variant_id, sum((e->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e
    where e->>'variant_id' ~ '^[a-z0-9-]{1,120}$'
    group by e->>'variant_id'
    order by 1
  loop
    if r.quantity is null or r.quantity < 1 then continue; end if;

    -- Primero el bloqueo de la referencia; después, la comprobación de
    -- «ya contabilizada» (así dos webhooks a la vez no descuentan dos veces).
    select stock into v_stock from public.catalog_variants where variant_id = r.variant_id for update;
    v_tracked := found and v_stock is not null;

    perform 1 from public.stock_holds
     where hold_key = p_hold_key and variant_id = r.variant_id and status = 'committed';
    if found then continue; end if;

    if v_tracked then
      if v_stock < r.quantity then
        v_oversold := v_oversold || jsonb_build_array(jsonb_build_object(
          'variant_id', r.variant_id, 'missing', r.quantity - v_stock));
      end if;
      update public.catalog_variants
         set stock = greatest(v_stock - r.quantity, 0), updated_at = now()
       where variant_id = r.variant_id;
      v_done := v_done + 1;
    end if;

    insert into public.stock_holds (hold_key, variant_id, quantity, status, expires_at)
    values (p_hold_key, r.variant_id, r.quantity, 'committed', now())
    on conflict (hold_key, variant_id) do update
      set status = 'committed', quantity = excluded.quantity, updated_at = now();
  end loop;

  return jsonb_build_object('ok', true, 'committed', v_done, 'oversold', v_oversold);
end;
$$;

-- Pago diferido (el banco aún confirma): la reserva se mantiene más tiempo.
create or replace function public.catalog_extend(
  p_hold_key   text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.stock_holds
     set expires_at = greatest(expires_at, p_expires_at), updated_at = now()
   where hold_key = p_hold_key and status = 'held';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'extended', v_n);
end;
$$;

-- Pago abandonado, caducado o fallido: se libera lo apartado.
create or replace function public.catalog_release(
  p_hold_key text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.stock_holds
     set status = 'released', updated_at = now()
   where hold_key = p_hold_key and status = 'held';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'released', v_n);
end;
$$;

-- ------------------------------------------------------------
-- Promociones: etiqueta en inglés
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
               'badge_en', badge_en,
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

create or replace function public.pricing_admin_set_promotion_badge_en(
  p_id       uuid,
  p_badge_en text,
  p_actor    uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_badge text := nullif(btrim(coalesce(p_badge_en, '')), '');
begin
  if v_badge is not null and char_length(v_badge) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  update public.promotions set badge_en = v_badge where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- Permisos: solo service_role (servidor)
-- ------------------------------------------------------------
alter table public.store_settings   enable row level security;
alter table public.catalog_finishes enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.stock_holds      enable row level security;

revoke all on table public.store_settings, public.catalog_finishes, public.catalog_variants, public.stock_holds
  from anon, authenticated;
grant all on table public.store_settings, public.catalog_finishes, public.catalog_variants, public.stock_holds
  to service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'catalog\_%' or p.proname like 'pricing\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
