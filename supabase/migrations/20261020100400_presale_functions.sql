-- ============================================================
-- SAMORAI · Lógica transaccional de preventa, stock y pagos
--
-- Toda escritura crítica pasa por estas funciones (se invocan desde el
-- servidor con la service-role vía `supabase.rpc`). Reglas:
--
--   1. Cualquier operación que AUMENTA la ocupación de una tirada bloquea
--      antes su fila (SELECT … FOR UPDATE). Dos clientes que piden la última
--      plaza a la vez se serializan: uno la obtiene y el otro recibe
--      `insufficient_stock`. No hay contadores: la ocupación se calcula
--      siempre desde inventory_allocations dentro de la transacción.
--   2. Orden de bloqueo único para evitar interbloqueos:
--        tirada → reserva → asignación → pago → pedido
--   3. Las funciones son idempotentes y toleran eventos de Stripe
--      duplicados o fuera de orden: cada transición comprueba el estado
--      actual y, si ya se aplicó, devuelve `already` sin efectos.
--   4. Los correos se encolan en la misma transacción (outbox).
--   5. Todas aceptan `p_now` para poder probar plazos sin esperar días.
-- ============================================================

-- =========================================================
-- A · Helpers internos
-- =========================================================

create or replace function public.presale_audit(
  p_entity_type text,
  p_entity_id   text,
  p_action      text,
  p_actor_type  text default 'system',
  p_actor_id    uuid default null,
  p_data        jsonb default '{}'::jsonb
) returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.audit_events (entity_type, entity_id, action, actor_type, actor_id, data)
  values (p_entity_type, p_entity_id, p_action, p_actor_type, p_actor_id, coalesce(p_data, '{}'::jsonb));
$$;

-- Encola un correo. Devuelve el id, o null si ya existía (dedupe) o si el
-- destinatario cliente no tiene email.
create or replace function public.presale_enqueue(
  p_template       text,
  p_dedupe_key     text,
  p_audience       text,
  p_to_email       text,
  p_reservation_id uuid default null,
  p_order_id       uuid default null,
  p_batch_id       uuid default null,
  p_is_bulk        boolean default false,
  p_payload        jsonb default '{}'::jsonb,
  p_not_before     timestamptz default now()
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_audience = 'customer' and nullif(btrim(coalesce(p_to_email, '')), '') is null then
    return null;
  end if;

  insert into public.email_notifications (
    template, dedupe_key, audience, to_email, reservation_id, order_id, batch_id,
    is_bulk, payload, next_attempt_at
  ) values (
    p_template, p_dedupe_key, p_audience,
    case when p_audience = 'customer' then btrim(p_to_email) end,
    p_reservation_id, p_order_id, p_batch_id,
    coalesce(p_is_bulk, false), coalesce(p_payload, '{}'::jsonb), coalesce(p_not_before, now())
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- Plazas ocupadas de una tirada (retenciones vigentes + reservadas + vendidas).
create or replace function public.presale_occupied_sets(
  p_batch_id uuid,
  p_now      timestamptz,
  p_exclude  uuid default null
) returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(a.quantity_sets), 0)::integer
  from public.inventory_allocations a
  where a.batch_id = p_batch_id
    and (a.status in ('reserved', 'sold') or (a.status = 'held' and a.hold_expires_at > p_now))
    and (p_exclude is null or a.id <> p_exclude);
$$;

-- Lo que queda del cupo más restrictivo aplicable a una configuración
-- (null si no hay cupos que la afecten).
create or replace function public.presale_quota_remaining(
  p_batch_id     uuid,
  p_product_slug text,
  p_finish_id    text,
  p_variant_id   text,
  p_now          timestamptz,
  p_exclude      uuid default null
) returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select min(
           q.capacity_sets - (
             select coalesce(sum(a.quantity_sets), 0)
             from public.inventory_allocations a
             where a.batch_id = q.batch_id
               and a.product_slug = q.product_slug
               and (q.finish_id is null or a.finish_id = q.finish_id)
               and (q.variant_id is null or a.variant_id = q.variant_id)
               and (a.status in ('reserved', 'sold') or (a.status = 'held' and a.hold_expires_at > p_now))
               and (p_exclude is null or a.id <> p_exclude)
           )
         )::integer
  from public.production_batch_quotas q
  where q.batch_id = p_batch_id
    and q.product_slug = p_product_slug
    and (q.finish_id is null or q.finish_id = p_finish_id)
    and (q.variant_id is null or q.variant_id = p_variant_id);
$$;

-- Juegos disponibles para una configuración (capacidad y cupos). Para que
-- el resultado sea fiable, la tirada debe estar bloqueada por el llamante.
create or replace function public.presale_available_sets(
  p_batch_id     uuid,
  p_product_slug text,
  p_finish_id    text,
  p_variant_id   text,
  p_now          timestamptz,
  p_exclude      uuid default null
) returns integer
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_capacity integer;
  v_free     integer;
  v_quota    integer;
begin
  select capacity_sets into v_capacity from public.production_batches where id = p_batch_id;
  if v_capacity is null then
    return 0;
  end if;

  v_free := v_capacity - public.presale_occupied_sets(p_batch_id, p_now, p_exclude);

  if p_product_slug is not null then
    v_quota := public.presale_quota_remaining(p_batch_id, p_product_slug, p_finish_id, p_variant_id, p_now, p_exclude);
    if v_quota is not null then
      v_free := least(v_free, v_quota);
    end if;
  end if;

  return greatest(v_free, 0);
end;
$$;

create or replace function public.presale_new_order_code()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select 'SO-' || upper(substr(md5(gen_random_uuid()::text), 1, 10));
$$;

-- =========================================================
-- B · Lectura pública (ficha de producto)
-- =========================================================

-- Tiradas visibles (no borrador) que incluyen el producto, con stock real.
-- p_variants: [{"variant_id": "...", "finish_id": "..."}] desde el catálogo,
-- para devolver la disponibilidad de cada referencia (cupos incluidos).
create or replace function public.presale_public_offers(
  p_product_slug text,
  p_variants     jsonb default '[]'::jsonb,
  p_now          timestamptz default now()
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_result   jsonb := '[]'::jsonb;
  b          public.production_batches%rowtype;
  v_held     integer;
  v_reserved integer;
  v_sold     integer;
  v_variants jsonb;
begin
  for b in
    select pb.*
    from public.production_batches pb
    join public.production_batch_products bp
      on bp.batch_id = pb.id and bp.product_slug = p_product_slug
    where pb.status <> 'draft'
    order by pb.created_at
  loop
    select
      coalesce(sum(quantity_sets) filter (where status = 'held' and hold_expires_at > p_now), 0),
      coalesce(sum(quantity_sets) filter (where status = 'reserved'), 0),
      coalesce(sum(quantity_sets) filter (where status = 'sold'), 0)
    into v_held, v_reserved, v_sold
    from public.inventory_allocations
    where batch_id = b.id and status in ('held', 'reserved', 'sold');

    select coalesce(
             jsonb_object_agg(
               v ->> 'variant_id',
               public.presale_available_sets(b.id, p_product_slug, v ->> 'finish_id', v ->> 'variant_id', p_now)
             ),
             '{}'::jsonb
           )
    into v_variants
    from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) v;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', b.id,
      'code', b.code,
      'name', b.name,
      'description', b.description,
      'status', b.status,
      'capacity_sets', b.capacity_sets,
      'units_per_set', b.units_per_set,
      'max_sets_per_order', b.max_sets_per_order,
      'held_sets', v_held,
      'reserved_sets', v_reserved,
      'sold_sets', v_sold,
      'available_sets', greatest(b.capacity_sets - v_held - v_reserved - v_sold, 0),
      'variant_available', v_variants,
      'presale_opens_at', b.presale_opens_at,
      'presale_closes_at', b.presale_closes_at,
      'presale_window_open',
        b.status = 'presale_open'
        and (b.presale_opens_at is null or p_now >= b.presale_opens_at)
        and (b.presale_closes_at is null or p_now < b.presale_closes_at),
      'planned_launch_at', b.planned_launch_at,
      'launched_at', b.launched_at,
      'estimated_delivery_on', b.estimated_delivery_on,
      'estimated_delivery_note', b.estimated_delivery_note,
      'deposit_cents', b.deposit_cents,
      'discount_bps', case when b.presale_discount_enabled then b.presale_discount_bps else 0 end,
      'balance_window_days', b.balance_window_days,
      'reservation_terms', b.reservation_terms,
      'cancellation_policy', b.cancellation_policy,
      'refund_policy', b.refund_policy,
      'expiry_policy', b.expiry_policy
    ));
  end loop;

  return v_result;
end;
$$;

-- =========================================================
-- C · Retenciones durante el checkout
-- =========================================================

-- Crea la reserva (pending_deposit) y su retención temporal de forma atómica.
-- p_reservation trae la instantánea calculada por el servidor desde el
-- catálogo; aquí se comprueban todos los importes que dependen de la tirada
-- y la restricción reservations_pricing_chk valida la aritmética completa.
create or replace function public.presale_reserve_hold(
  p_batch_id           uuid,
  p_reservation        jsonb,
  p_hold_minutes       integer,
  p_client_fingerprint text default null,
  p_user_id            uuid default null,
  p_now                timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b              public.production_batches%rowtype;
  r              public.reservations%rowtype;
  v_sets         integer;
  v_discount_bps integer;
  v_subtotal     integer;
  v_email        text;
  v_available    integer;
  v_pending      integer;
  v_alloc_id     uuid;
  v_expires      timestamptz;
begin
  if p_hold_minutes is null or p_hold_minutes < 31 or p_hold_minutes > 180 then
    raise exception 'p_hold_minutes fuera de rango (31-180)' using errcode = '22023';
  end if;

  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;
  if b.status <> 'presale_open' then
    return jsonb_build_object('ok', false, 'reason', 'presale_not_open');
  end if;
  if (b.presale_opens_at is not null and p_now < b.presale_opens_at)
     or (b.presale_closes_at is not null and p_now >= b.presale_closes_at) then
    return jsonb_build_object('ok', false, 'reason', 'presale_window_closed');
  end if;
  if not exists (
    select 1 from public.production_batch_products
    where batch_id = b.id and product_slug = p_reservation ->> 'product_slug'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'product_not_in_batch');
  end if;

  v_sets := (p_reservation ->> 'quantity_sets')::integer;
  if v_sets is null or v_sets < 1 or v_sets > b.max_sets_per_order then
    return jsonb_build_object('ok', false, 'reason', 'invalid_quantity', 'max', b.max_sets_per_order);
  end if;

  v_discount_bps := case when b.presale_discount_enabled then b.presale_discount_bps else 0 end;
  v_subtotal := (p_reservation ->> 'subtotal_cents')::integer;
  if (p_reservation ->> 'units_per_set')::integer is distinct from b.units_per_set
     or (p_reservation ->> 'deposit_cents')::integer is distinct from b.deposit_cents * v_sets
     or (p_reservation ->> 'discount_bps')::integer is distinct from v_discount_bps
     or (p_reservation ->> 'discount_cents')::integer
          is distinct from round(v_subtotal::numeric * v_discount_bps / 10000)::integer
  then
    return jsonb_build_object('ok', false, 'reason', 'pricing_mismatch');
  end if;

  v_email := nullif(btrim(coalesce(p_reservation ->> 'email', '')), '');
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'email_required');
  end if;

  -- Anti-acaparamiento: nadie puede bloquear la tirada abriendo checkouts.
  select count(*) into v_pending
  from public.reservations res
  join public.inventory_allocations a on a.reservation_id = res.id
  where res.status = 'pending_deposit'
    and a.status = 'held' and a.hold_expires_at > p_now
    and lower(res.email) = lower(v_email);
  if v_pending >= 2 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_pending');
  end if;

  if p_client_fingerprint is not null then
    select count(*) into v_pending
    from public.inventory_allocations
    where client_fingerprint = p_client_fingerprint
      and status = 'held' and hold_expires_at > p_now;
    if v_pending >= 3 then
      return jsonb_build_object('ok', false, 'reason', 'too_many_pending');
    end if;
  end if;

  v_available := public.presale_available_sets(
    b.id, p_reservation ->> 'product_slug', p_reservation ->> 'finish_id', p_reservation ->> 'variant_id', p_now
  );
  if v_available < v_sets then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_stock', 'available', v_available);
  end if;

  insert into public.reservations (
    batch_id, user_id, email, customer_name, phone, vehicle_make, vehicle_model, vehicle_year,
    product_slug, product_name, variant_id, finish_id, finish_name, diameter, width, et, pcd,
    center_bore, config_snapshot, quantity_sets, units_per_set, unit_price_cents, subtotal_cents,
    discount_bps, discount_cents, total_cents, deposit_cents, balance_cents, terms_snapshot,
    terms_accepted_at, locale
  ) values (
    b.id,
    p_user_id,
    v_email,
    nullif(btrim(coalesce(p_reservation ->> 'customer_name', '')), ''),
    nullif(btrim(coalesce(p_reservation ->> 'phone', '')), ''),
    nullif(btrim(coalesce(p_reservation ->> 'vehicle_make', '')), ''),
    nullif(btrim(coalesce(p_reservation ->> 'vehicle_model', '')), ''),
    nullif(p_reservation ->> 'vehicle_year', '')::smallint,
    p_reservation ->> 'product_slug',
    p_reservation ->> 'product_name',
    p_reservation ->> 'variant_id',
    p_reservation ->> 'finish_id',
    p_reservation ->> 'finish_name',
    (p_reservation ->> 'diameter')::numeric,
    (p_reservation ->> 'width')::numeric,
    (p_reservation ->> 'et')::integer,
    p_reservation ->> 'pcd',
    (p_reservation ->> 'center_bore')::numeric,
    coalesce(p_reservation -> 'config_snapshot', '{}'::jsonb),
    v_sets,
    b.units_per_set,
    (p_reservation ->> 'unit_price_cents')::integer,
    v_subtotal,
    v_discount_bps,
    (p_reservation ->> 'discount_cents')::integer,
    (p_reservation ->> 'total_cents')::integer,
    b.deposit_cents * v_sets,
    (p_reservation ->> 'balance_cents')::integer,
    jsonb_build_object(
      'batch_code', b.code,
      'batch_name', b.name,
      'reservation_terms', b.reservation_terms,
      'cancellation_policy', b.cancellation_policy,
      'refund_policy', b.refund_policy,
      'expiry_policy', b.expiry_policy,
      'expiry_deposit_policy', b.expiry_deposit_policy,
      'policies_legally_validated', b.policies_legally_validated,
      'balance_window_days', b.balance_window_days,
      'deposit_cents_per_set', b.deposit_cents,
      'discount_bps', v_discount_bps,
      'planned_launch_at', b.planned_launch_at,
      'estimated_delivery_on', b.estimated_delivery_on,
      'estimated_delivery_note', b.estimated_delivery_note
    ),
    p_now,
    coalesce(nullif(p_reservation ->> 'locale', ''), 'es')
  )
  returning * into r;

  v_expires := p_now + make_interval(mins => p_hold_minutes);

  insert into public.inventory_allocations (
    batch_id, channel, status, quantity_sets, product_slug, finish_id, variant_id,
    hold_expires_at, reservation_id, user_id, client_fingerprint
  ) values (
    b.id, 'presale', 'held', v_sets, r.product_slug, r.finish_id, r.variant_id,
    v_expires, r.id, p_user_id, p_client_fingerprint
  )
  returning id into v_alloc_id;

  perform public.presale_audit('reservation', r.id::text, 'hold_created', 'customer', p_user_id,
    jsonb_build_object('code', r.code, 'batch', b.code, 'variant', r.variant_id, 'sets', v_sets,
                       'allocation_id', v_alloc_id, 'hold_expires_at', v_expires));

  return jsonb_build_object(
    'ok', true,
    'reservation_id', r.id,
    'reservation_code', r.code,
    'access_version', r.access_version,
    'allocation_id', v_alloc_id,
    'hold_expires_at', v_expires,
    'available_after', v_available - v_sets
  );
end;
$$;

-- Retención para compra directa (venta oficial). p_line: instantánea de
-- configuración y precio calculada por el servidor.
create or replace function public.presale_direct_hold(
  p_batch_id           uuid,
  p_line               jsonb,
  p_hold_minutes       integer,
  p_client_fingerprint text default null,
  p_user_id            uuid default null,
  p_now                timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b           public.production_batches%rowtype;
  v_sets      integer;
  v_unit      integer;
  v_available integer;
  v_pending   integer;
  v_alloc_id  uuid;
  v_expires   timestamptz;
begin
  if p_hold_minutes is null or p_hold_minutes < 31 or p_hold_minutes > 180 then
    raise exception 'p_hold_minutes fuera de rango (31-180)' using errcode = '22023';
  end if;

  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;
  if b.status not in ('launched', 'in_production', 'available') then
    return jsonb_build_object('ok', false, 'reason', 'direct_sale_not_open');
  end if;
  if not exists (
    select 1 from public.production_batch_products
    where batch_id = b.id and product_slug = p_line ->> 'product_slug'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'product_not_in_batch');
  end if;

  v_sets := (p_line ->> 'quantity_sets')::integer;
  if v_sets is null or v_sets < 1 or v_sets > b.max_sets_per_order then
    return jsonb_build_object('ok', false, 'reason', 'invalid_quantity', 'max', b.max_sets_per_order);
  end if;

  v_unit := (p_line ->> 'unit_price_cents')::integer;
  if v_unit is null or v_unit <= 0
     or (p_line ->> 'units_per_set')::integer is distinct from b.units_per_set
     or (p_line ->> 'subtotal_cents')::integer is distinct from v_unit * b.units_per_set * v_sets
     or (p_line ->> 'total_cents')::integer is distinct from v_unit * b.units_per_set * v_sets
  then
    return jsonb_build_object('ok', false, 'reason', 'pricing_mismatch');
  end if;

  if p_client_fingerprint is not null then
    select count(*) into v_pending
    from public.inventory_allocations
    where client_fingerprint = p_client_fingerprint
      and status = 'held' and hold_expires_at > p_now;
    if v_pending >= 3 then
      return jsonb_build_object('ok', false, 'reason', 'too_many_pending');
    end if;
  end if;

  v_available := public.presale_available_sets(
    b.id, p_line ->> 'product_slug', p_line ->> 'finish_id', p_line ->> 'variant_id', p_now
  );
  if v_available < v_sets then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_stock', 'available', v_available);
  end if;

  v_expires := p_now + make_interval(mins => p_hold_minutes);

  insert into public.inventory_allocations (
    batch_id, channel, status, quantity_sets, product_slug, finish_id, variant_id,
    hold_expires_at, user_id, snapshot, client_fingerprint
  ) values (
    b.id, 'direct', 'held', v_sets, p_line ->> 'product_slug', p_line ->> 'finish_id',
    p_line ->> 'variant_id', v_expires, p_user_id,
    p_line || jsonb_build_object('batch_code', b.code, 'batch_name', b.name),
    p_client_fingerprint
  )
  returning id into v_alloc_id;

  perform public.presale_audit('allocation', v_alloc_id::text, 'hold_created', 'customer', p_user_id,
    jsonb_build_object('channel', 'direct', 'batch', b.code, 'variant', p_line ->> 'variant_id',
                       'sets', v_sets, 'hold_expires_at', v_expires));

  return jsonb_build_object(
    'ok', true,
    'allocation_id', v_alloc_id,
    'hold_expires_at', v_expires,
    'available_after', v_available - v_sets
  );
end;
$$;

-- Asocia la sesión de Stripe Checkout recién creada a la retención y
-- registra el pago abierto. Si la retención ya no está vigente, el servidor
-- debe expirar la sesión en Stripe (devuelve ok=false).
create or replace function public.presale_attach_checkout(
  p_allocation_id uuid,
  p_session_id    text,
  p_amount_cents  integer,
  p_expires_at    timestamptz,
  p_livemode      boolean default null,
  p_now           timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  a        public.inventory_allocations%rowtype;
  v_res_id uuid;
  v_expect integer;
begin
  select reservation_id into v_res_id from public.inventory_allocations where id = p_allocation_id;
  if v_res_id is not null then
    perform 1 from public.reservations where id = v_res_id for update;
  end if;

  select * into a from public.inventory_allocations where id = p_allocation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if a.status <> 'held' or a.hold_expires_at <= p_now then
    return jsonb_build_object('ok', false, 'reason', 'hold_not_active');
  end if;
  if a.stripe_checkout_session_id is not null and a.stripe_checkout_session_id <> p_session_id then
    return jsonb_build_object('ok', false, 'reason', 'already_attached');
  end if;

  if a.channel = 'presale' then
    select deposit_cents into v_expect from public.reservations where id = a.reservation_id;
  else
    v_expect := (a.snapshot ->> 'total_cents')::integer;
  end if;
  if p_amount_cents is distinct from v_expect then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  update public.inventory_allocations set stripe_checkout_session_id = p_session_id where id = a.id;
  if a.channel = 'presale' then
    update public.reservations set stripe_deposit_session_id = p_session_id where id = a.reservation_id;
  end if;

  insert into public.payments (
    purpose, reservation_id, allocation_id, stripe_checkout_session_id, amount_cents,
    checkout_expires_at, livemode
  ) values (
    case when a.channel = 'presale' then 'deposit' else 'direct' end,
    a.reservation_id, a.id, p_session_id, p_amount_cents, p_expires_at, p_livemode
  )
  on conflict (stripe_checkout_session_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- Cierra un checkout sin cobro: sesión caducada, pago diferido fallido,
-- cancelación del cliente o error al crear la sesión. Libera la retención.
-- Idempotente y segura fuera de orden: si la plaza ya se confirmó, no hace nada.
create or replace function public.presale_checkout_closed(
  p_session_id    text,
  p_reason        text,
  p_allocation_id uuid default null,
  p_now           timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pmt          public.payments%rowtype;
  a            public.inventory_allocations%rowtype;
  v_alloc_id   uuid;
  v_res_id     uuid;
  v_pay_status text;
begin
  if p_reason not in ('checkout_expired', 'payment_failed', 'checkout_cancelled', 'stripe_error') then
    raise exception 'Motivo no válido: %', p_reason using errcode = '22023';
  end if;
  v_pay_status := case when p_reason = 'payment_failed' then 'failed' else 'expired' end;

  if p_session_id is not null then
    select * into pmt from public.payments where stripe_checkout_session_id = p_session_id;
  end if;

  -- Pago del importe restante: la reserva conserva su plaza.
  if pmt.id is not null and pmt.purpose = 'balance' then
    perform 1 from public.reservations where id = pmt.reservation_id for update;
    update public.payments set status = v_pay_status
      where id = pmt.id and status in ('open', 'processing');
    update public.reservations set status = 'balance_due'
      where id = pmt.reservation_id and status = 'balance_processing';
    perform public.presale_audit('payment', pmt.id::text, 'balance_checkout_closed', 'stripe', null,
      jsonb_build_object('reason', p_reason, 'session', p_session_id));
    return jsonb_build_object('ok', true, 'purpose', 'balance', 'released', false);
  end if;

  select id, reservation_id into v_alloc_id, v_res_id
  from public.inventory_allocations
  where (p_allocation_id is not null and id = p_allocation_id)
     or (p_session_id is not null and stripe_checkout_session_id = p_session_id)
  limit 1;

  if v_alloc_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_res_id is not null then
    perform 1 from public.reservations where id = v_res_id for update;
  end if;
  select * into a from public.inventory_allocations where id = v_alloc_id for update;

  if a.status <> 'held' then
    return jsonb_build_object('ok', true, 'released', false, 'status', a.status);
  end if;

  update public.inventory_allocations
     set status = 'released', release_reason = p_reason, released_at = p_now
   where id = a.id;

  if a.reservation_id is not null then
    update public.reservations set status = 'abandoned'
     where id = a.reservation_id and status in ('pending_deposit', 'deposit_processing');
  end if;

  update public.payments set status = v_pay_status
   where allocation_id = a.id and status in ('open', 'processing');

  perform public.presale_audit('allocation', a.id::text, 'hold_released', 'stripe', null,
    jsonb_build_object('reason', p_reason, 'session', p_session_id, 'reservation_id', a.reservation_id));

  return jsonb_build_object('ok', true, 'released', true, 'reservation_id', a.reservation_id);
end;
$$;

-- =========================================================
-- D · Confirmación de pagos (llamadas desde el webhook de Stripe)
-- =========================================================

-- Señal de 50 € pagada (o en proceso si el método es diferido).
create or replace function public.presale_confirm_deposit(
  p_session_id        text,
  p_payment_intent_id text,
  p_amount_cents      integer,
  p_currency          text,
  p_paid              boolean,
  p_customer          jsonb default '{}'::jsonb,
  p_livemode          boolean default null,
  p_now               timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b               public.production_batches%rowtype;
  r               public.reservations%rowtype;
  a               public.inventory_allocations%rowtype;
  v_res_id        uuid;
  v_batch_id      uuid;
  v_review        text;
  v_available     integer;
  v_new_status    text;
  v_id            uuid;
  v_notifications uuid[] := '{}';
begin
  select id, batch_id into v_res_id, v_batch_id
  from public.reservations where stripe_deposit_session_id = p_session_id;
  if v_res_id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into b from public.production_batches where id = v_batch_id for update;
  select * into r from public.reservations where id = v_res_id for update;
  select * into a from public.inventory_allocations
   where reservation_id = r.id order by created_at desc limit 1 for update;

  update public.payments
     set stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
         livemode = coalesce(p_livemode, livemode)
   where stripe_checkout_session_id = p_session_id;

  -- Ya procesado (evento duplicado o fuera de orden).
  if r.deposit_status <> 'unpaid' then
    return jsonb_build_object('result', 'already', 'reservation_id', r.id, 'status', r.status);
  end if;

  -- Método de pago diferido: se mantiene la plaza hasta el resultado final.
  if not coalesce(p_paid, false) then
    if r.status = 'pending_deposit' then
      update public.reservations set status = 'deposit_processing' where id = r.id;
      update public.inventory_allocations
         set hold_expires_at = greatest(hold_expires_at, p_now + interval '15 days')
       where id = a.id and status = 'held';
      update public.payments set status = 'processing'
       where stripe_checkout_session_id = p_session_id and status = 'open';
      perform public.presale_audit('reservation', r.id::text, 'deposit_processing', 'stripe', null,
        jsonb_build_object('session', p_session_id));
      return jsonb_build_object('result', 'processing', 'reservation_id', r.id);
    end if;
    return jsonb_build_object('result', 'already', 'reservation_id', r.id, 'status', r.status);
  end if;

  if p_amount_cents is distinct from r.deposit_cents or lower(coalesce(p_currency, '')) <> r.currency then
    v_review := 'amount_mismatch';
  end if;

  if a.id is null then
    v_review := coalesce(v_review, 'allocation_missing');
  elsif a.status = 'held' and a.hold_expires_at > p_now then
    update public.inventory_allocations set status = 'reserved' where id = a.id;
  elsif a.status = 'held'
        or (a.status = 'released' and a.release_reason in ('hold_expired', 'checkout_expired')) then
    -- Webhook recibido con retraso: la retención había caducado. Se recupera
    -- la plaza solo si sigue libre (tirada bloqueada → cálculo consistente).
    v_available := public.presale_available_sets(b.id, a.product_slug, a.finish_id, a.variant_id, p_now, a.id);
    if b.status not in ('cancelled', 'completed') and v_available >= a.quantity_sets then
      update public.inventory_allocations
         set status = 'reserved', release_reason = null, released_at = null
       where id = a.id;
      perform public.presale_audit('allocation', a.id::text, 'reacquired_after_late_payment', 'stripe', null,
        jsonb_build_object('reservation', r.code));
    else
      v_review := coalesce(v_review, 'paid_without_stock');
      if a.status = 'held' then
        update public.inventory_allocations
           set status = 'released', release_reason = 'hold_expired', released_at = p_now
         where id = a.id;
      end if;
    end if;
  else
    v_review := coalesce(v_review, 'paid_without_stock');
  end if;

  if v_review is not null then
    v_new_status := 'needs_review';
  elsif b.status in ('launched', 'in_production', 'available') then
    -- La tirada se lanzó mientras el cliente estaba en el checkout.
    v_new_status := 'balance_due';
  else
    v_new_status := 'confirmed';
  end if;

  update public.reservations set
    status = v_new_status,
    review_reason = v_review,
    deposit_status = 'paid',
    deposit_paid_at = p_now,
    stripe_deposit_payment_intent_id = coalesce(p_payment_intent_id, stripe_deposit_payment_intent_id),
    customer_name = coalesce(customer_name, nullif(btrim(coalesce(p_customer ->> 'name', '')), '')),
    phone = coalesce(phone, nullif(btrim(coalesce(p_customer ->> 'phone', '')), '')),
    balance_due_at = case
      when v_new_status = 'balance_due' then b.launched_at + make_interval(days => b.balance_window_days)
      else balance_due_at
    end
  where id = r.id
  returning * into r;

  update public.payments set status = 'succeeded', paid_at = p_now
   where stripe_checkout_session_id = p_session_id;
  if not found then
    insert into public.payments (purpose, reservation_id, allocation_id, stripe_checkout_session_id,
                                 stripe_payment_intent_id, amount_cents, status, paid_at, livemode)
    values ('deposit', r.id, a.id, p_session_id, p_payment_intent_id, coalesce(p_amount_cents, r.deposit_cents),
            'succeeded', p_now, p_livemode);
  end if;

  perform public.presale_audit('reservation', r.id::text, 'deposit_paid', 'stripe', null,
    jsonb_build_object('session', p_session_id, 'amount_cents', p_amount_cents, 'status', v_new_status,
                       'review_reason', v_review));

  v_id := public.presale_enqueue('deposit_receipt', 'deposit_receipt:' || r.id, 'customer', r.email, r.id, null, b.id);
  if v_id is not null then v_notifications := v_notifications || v_id; end if;

  if v_review is null then
    v_id := public.presale_enqueue('reservation_confirmed', 'reservation_confirmed:' || r.id, 'customer', r.email, r.id, null, b.id);
    if v_id is not null then v_notifications := v_notifications || v_id; end if;
    if v_new_status = 'balance_due' then
      v_id := public.presale_enqueue('balance_request', 'balance_request:' || r.id || ':initial', 'customer', r.email, r.id, null, b.id);
      if v_id is not null then v_notifications := v_notifications || v_id; end if;
    end if;
    v_id := public.presale_enqueue('shop_new_reservation', 'shop_new_reservation:' || r.id, 'shop', null, r.id, null, b.id);
    if v_id is not null then v_notifications := v_notifications || v_id; end if;
  else
    v_id := public.presale_enqueue('shop_review_needed', 'shop_review_needed:' || r.id || ':' || v_review, 'shop', null,
      r.id, null, b.id, false, jsonb_build_object('reason', v_review, 'session', p_session_id));
    if v_id is not null then v_notifications := v_notifications || v_id; end if;
  end if;

  return jsonb_build_object(
    'result', case when v_review is null then 'confirmed' else 'needs_review' end,
    'reservation_id', r.id,
    'status', r.status,
    'review_reason', v_review,
    'notification_ids', to_jsonb(v_notifications)
  );
end;
$$;

-- Compra directa pagada: la retención pasa a vendida y se crea el pedido.
create or replace function public.presale_confirm_direct(
  p_session_id        text,
  p_payment_intent_id text,
  p_amount_cents      integer,
  p_currency          text,
  p_paid              boolean,
  p_customer          jsonb default '{}'::jsonb,
  p_shipping          jsonb default null,
  p_billing           jsonb default null,
  p_livemode          boolean default null,
  p_now               timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b               public.production_batches%rowtype;
  a               public.inventory_allocations%rowtype;
  s               jsonb;
  v_alloc_id      uuid;
  v_batch_id      uuid;
  v_review        text;
  v_available     integer;
  v_order_id      uuid;
  v_email         text;
  v_id            uuid;
  v_notifications uuid[] := '{}';
begin
  select id, batch_id into v_alloc_id, v_batch_id
  from public.inventory_allocations
  where stripe_checkout_session_id = p_session_id and channel = 'direct';
  if v_alloc_id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into b from public.production_batches where id = v_batch_id for update;
  select * into a from public.inventory_allocations where id = v_alloc_id for update;

  update public.payments
     set stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
         livemode = coalesce(p_livemode, livemode)
   where stripe_checkout_session_id = p_session_id;

  if a.order_id is not null then
    return jsonb_build_object('result', 'already', 'order_id', a.order_id);
  end if;
  select id into v_order_id from public.orders where stripe_session_id = p_session_id;
  if v_order_id is not null then
    return jsonb_build_object('result', 'already', 'order_id', v_order_id);
  end if;

  if not coalesce(p_paid, false) then
    if a.status = 'held' then
      update public.inventory_allocations
         set hold_expires_at = greatest(hold_expires_at, p_now + interval '15 days')
       where id = a.id;
      update public.payments set status = 'processing'
       where stripe_checkout_session_id = p_session_id and status = 'open';
      return jsonb_build_object('result', 'processing', 'allocation_id', a.id);
    end if;
    return jsonb_build_object('result', 'already', 'allocation_id', a.id, 'status', a.status);
  end if;

  s := a.snapshot;
  if p_amount_cents is distinct from (s ->> 'total_cents')::integer or lower(coalesce(p_currency, '')) <> 'eur' then
    v_review := 'amount_mismatch';
  end if;

  if a.status = 'held' and a.hold_expires_at > p_now then
    update public.inventory_allocations set status = 'sold' where id = a.id;
  elsif a.status = 'held'
        or (a.status = 'released' and a.release_reason in ('hold_expired', 'checkout_expired')) then
    v_available := public.presale_available_sets(b.id, a.product_slug, a.finish_id, a.variant_id, p_now, a.id);
    if b.status not in ('cancelled', 'completed') and v_available >= a.quantity_sets then
      update public.inventory_allocations
         set status = 'sold', release_reason = null, released_at = null
       where id = a.id;
      perform public.presale_audit('allocation', a.id::text, 'reacquired_after_late_payment', 'stripe', null, '{}'::jsonb);
    else
      v_review := coalesce(v_review, 'paid_without_stock');
      if a.status = 'held' then
        update public.inventory_allocations
           set status = 'released', release_reason = 'hold_expired', released_at = p_now
         where id = a.id;
      end if;
    end if;
  elsif a.status <> 'sold' then
    v_review := coalesce(v_review, 'paid_without_stock');
  end if;

  v_email := nullif(btrim(coalesce(p_customer ->> 'email', '')), '');

  insert into public.orders (
    stripe_session_id, stripe_payment_intent_id, amount_total_cents, currency, customer_email,
    payment_status, kind, code, user_id, batch_id, status, customer_name, customer_phone,
    shipping_address, billing_address, subtotal_cents, discount_cents, amount_paid_cents, review_reason
  ) values (
    p_session_id, p_payment_intent_id, p_amount_cents, lower(coalesce(p_currency, 'eur')), v_email,
    'paid', 'direct', public.presale_new_order_code(), a.user_id, b.id, 'paid',
    nullif(btrim(coalesce(p_shipping ->> 'name', p_customer ->> 'name', '')), ''),
    nullif(btrim(coalesce(p_customer ->> 'phone', '')), ''),
    p_shipping, p_billing, (s ->> 'subtotal_cents')::integer, 0, p_amount_cents, v_review
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, variant_id, product_name, quantity, unit_price_cents, finish_id, finish_name,
    diameter, width, et, sets, config_snapshot
  ) values (
    v_order_id, a.variant_id, s ->> 'product_name',
    a.quantity_sets * (s ->> 'units_per_set')::integer,
    (s ->> 'unit_price_cents')::integer, a.finish_id, s ->> 'finish_name',
    (s ->> 'diameter')::numeric, (s ->> 'width')::numeric, (s ->> 'et')::integer,
    a.quantity_sets, s -> 'config_snapshot'
  );

  update public.inventory_allocations set order_id = v_order_id where id = a.id;
  update public.payments set status = 'succeeded', paid_at = p_now, order_id = v_order_id
   where stripe_checkout_session_id = p_session_id;
  if not found then
    insert into public.payments (purpose, allocation_id, order_id, stripe_checkout_session_id,
                                 stripe_payment_intent_id, amount_cents, status, paid_at, livemode)
    values ('direct', a.id, v_order_id, p_session_id, p_payment_intent_id, p_amount_cents,
            'succeeded', p_now, p_livemode);
  end if;

  perform public.presale_audit('order', v_order_id::text, 'direct_sale_paid', 'stripe', null,
    jsonb_build_object('session', p_session_id, 'amount_cents', p_amount_cents, 'allocation_id', a.id,
                       'review_reason', v_review));

  v_id := public.presale_enqueue('direct_purchase', 'direct_purchase:' || v_order_id, 'customer', v_email, null, v_order_id, b.id);
  if v_id is not null then v_notifications := v_notifications || v_id; end if;
  v_id := public.presale_enqueue('shop_direct_sale', 'shop_direct_sale:' || v_order_id, 'shop', null, null, v_order_id, b.id);
  if v_id is not null then v_notifications := v_notifications || v_id; end if;
  if v_review is not null then
    v_id := public.presale_enqueue('shop_review_needed', 'shop_review_needed:order:' || v_order_id, 'shop', null,
      null, v_order_id, b.id, false, jsonb_build_object('reason', v_review, 'session', p_session_id));
    if v_id is not null then v_notifications := v_notifications || v_id; end if;
  end if;

  return jsonb_build_object(
    'result', case when v_review is null then 'confirmed' else 'needs_review' end,
    'order_id', v_order_id,
    'review_reason', v_review,
    'notification_ids', to_jsonb(v_notifications)
  );
end;
$$;

-- Comprueba si una reserva admite ahora el pago restante y si hay una sesión
-- abierta reutilizable (evita cobros dobles con varias pestañas).
create or replace function public.presale_balance_checkout_begin(
  p_reservation_id uuid,
  p_now            timestamptz default now()
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r          public.reservations%rowtype;
  v_session  text;
  v_expires  timestamptz;
  v_attempts integer;
begin
  select * into r from public.reservations where id = p_reservation_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if r.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'already_paid');
  end if;
  if r.status = 'balance_processing' then
    return jsonb_build_object('ok', false, 'reason', 'payment_processing');
  end if;
  if r.status <> 'balance_due' then
    return jsonb_build_object('ok', false, 'reason', 'not_payable', 'status', r.status);
  end if;
  if r.balance_due_at <= p_now then
    return jsonb_build_object('ok', false, 'reason', 'deadline_passed');
  end if;

  select stripe_checkout_session_id, checkout_expires_at into v_session, v_expires
  from public.payments
  where reservation_id = r.id and purpose = 'balance' and status = 'open'
    and checkout_expires_at > p_now + interval '10 minutes'
  order by created_at desc
  limit 1;

  select count(*) into v_attempts
  from public.payments where reservation_id = r.id and purpose = 'balance';

  return jsonb_build_object(
    'ok', true,
    'reservation_id', r.id,
    'code', r.code,
    'email', r.email,
    'balance_cents', r.balance_cents,
    'balance_due_at', r.balance_due_at,
    'open_session_id', v_session,
    'open_session_expires_at', v_expires,
    'attempt', v_attempts,
    'reservation', jsonb_build_object(
      'access_version', r.access_version,
      'product_name', r.product_name,
      'finish_name', r.finish_name,
      'diameter', r.diameter,
      'width', r.width,
      'et', r.et,
      'quantity_sets', r.quantity_sets,
      'units_per_set', r.units_per_set,
      'subtotal_cents', r.subtotal_cents,
      'discount_cents', r.discount_cents,
      'total_cents', r.total_cents,
      'deposit_cents', r.deposit_cents
    )
  );
end;
$$;

create or replace function public.presale_attach_balance_checkout(
  p_reservation_id uuid,
  p_session_id     text,
  p_amount_cents   integer,
  p_expires_at     timestamptz,
  p_livemode       boolean default null,
  p_now            timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if r.status <> 'balance_due' then
    return jsonb_build_object('ok', false, 'reason', 'not_payable', 'status', r.status);
  end if;
  if r.balance_due_at <= p_now then
    return jsonb_build_object('ok', false, 'reason', 'deadline_passed');
  end if;
  if p_amount_cents is distinct from r.balance_cents then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  insert into public.payments (purpose, reservation_id, stripe_checkout_session_id, amount_cents,
                               checkout_expires_at, livemode)
  values ('balance', r.id, p_session_id, p_amount_cents, p_expires_at, p_livemode)
  on conflict (stripe_checkout_session_id) do nothing;

  update public.reservations set stripe_balance_session_id = p_session_id where id = r.id;

  perform public.presale_audit('reservation', r.id::text, 'balance_checkout_created', 'customer', r.user_id,
    jsonb_build_object('session', p_session_id, 'expires_at', p_expires_at));

  return jsonb_build_object('ok', true);
end;
$$;

-- Importe restante pagado: reserva completada, plaza vendida y pedido creado.
create or replace function public.presale_confirm_balance(
  p_session_id        text,
  p_payment_intent_id text,
  p_amount_cents      integer,
  p_currency          text,
  p_paid              boolean,
  p_customer          jsonb default '{}'::jsonb,
  p_shipping          jsonb default null,
  p_billing           jsonb default null,
  p_livemode          boolean default null,
  p_now               timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b               public.production_batches%rowtype;
  r               public.reservations%rowtype;
  a               public.inventory_allocations%rowtype;
  pmt             public.payments%rowtype;
  v_res_id        uuid;
  v_batch_id      uuid;
  v_review        text;
  v_available     integer;
  v_order_id      uuid;
  v_id            uuid;
  v_notifications uuid[] := '{}';
begin
  select p.reservation_id, res.batch_id into v_res_id, v_batch_id
  from public.payments p
  join public.reservations res on res.id = p.reservation_id
  where p.stripe_checkout_session_id = p_session_id and p.purpose = 'balance';
  if v_res_id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into b from public.production_batches where id = v_batch_id for update;
  select * into r from public.reservations where id = v_res_id for update;
  select * into a from public.inventory_allocations
   where reservation_id = r.id order by created_at desc limit 1 for update;
  select * into pmt from public.payments where stripe_checkout_session_id = p_session_id for update;

  update public.payments
     set stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
         livemode = coalesce(p_livemode, livemode)
   where id = pmt.id;

  if pmt.status in ('succeeded', 'refunded', 'partially_refunded') then
    return jsonb_build_object('result', 'already', 'reservation_id', r.id, 'order_id', r.order_id);
  end if;

  if not coalesce(p_paid, false) then
    update public.payments set status = 'processing' where id = pmt.id and status = 'open';
    if r.status = 'balance_due' then
      update public.reservations set status = 'balance_processing' where id = r.id;
    end if;
    perform public.presale_audit('reservation', r.id::text, 'balance_processing', 'stripe', null,
      jsonb_build_object('session', p_session_id));
    return jsonb_build_object('result', 'processing', 'reservation_id', r.id);
  end if;

  update public.payments set status = 'succeeded', paid_at = p_now where id = pmt.id;

  -- Otra sesión ya completó la reserva: cobro duplicado → revisión y reembolso.
  if r.status = 'completed' then
    perform public.presale_audit('reservation', r.id::text, 'duplicate_balance_payment', 'stripe', null,
      jsonb_build_object('session', p_session_id, 'amount_cents', p_amount_cents));
    v_id := public.presale_enqueue('shop_review_needed', 'shop_review_needed:duplicate:' || pmt.id, 'shop', null,
      r.id, r.order_id, b.id, false,
      jsonb_build_object('reason', 'duplicate_balance_payment', 'session', p_session_id, 'amount_cents', p_amount_cents));
    if v_id is not null then v_notifications := v_notifications || v_id; end if;
    return jsonb_build_object('result', 'duplicate_payment', 'reservation_id', r.id,
                              'notification_ids', to_jsonb(v_notifications));
  end if;

  if p_amount_cents is distinct from r.balance_cents or lower(coalesce(p_currency, '')) <> r.currency then
    v_review := 'amount_mismatch';
  end if;

  if r.status in ('balance_due', 'balance_processing') then
    if a.status = 'reserved' then
      update public.inventory_allocations set status = 'sold' where id = a.id;
    else
      v_review := coalesce(v_review, 'allocation_not_reserved');
    end if;
  elsif r.status = 'expired' then
    -- Pagó en una sesión abierta antes del vencimiento, procesada después.
    if a.status = 'released' and a.release_reason = 'reservation_expired' then
      v_available := public.presale_available_sets(b.id, a.product_slug, a.finish_id, a.variant_id, p_now, a.id);
      if b.status not in ('cancelled', 'completed') and v_available >= a.quantity_sets then
        update public.inventory_allocations
           set status = 'sold', release_reason = null, released_at = null
         where id = a.id;
        perform public.presale_audit('allocation', a.id::text, 'reacquired_after_late_payment', 'stripe', null,
          jsonb_build_object('reservation', r.code));
      else
        v_review := coalesce(v_review, 'paid_after_expiry_without_stock');
      end if;
    elsif a.status = 'reserved' then
      update public.inventory_allocations set status = 'sold' where id = a.id;
    else
      v_review := coalesce(v_review, 'paid_after_expiry_without_stock');
    end if;
  else
    v_review := coalesce(v_review, 'paid_in_status_' || r.status);
  end if;

  if v_review is not null then
    update public.reservations set
      status = 'needs_review',
      review_reason = v_review,
      stripe_balance_session_id = p_session_id,
      stripe_balance_payment_intent_id = coalesce(p_payment_intent_id, stripe_balance_payment_intent_id)
    where id = r.id;
    perform public.presale_audit('reservation', r.id::text, 'balance_paid_needs_review', 'stripe', null,
      jsonb_build_object('session', p_session_id, 'amount_cents', p_amount_cents, 'reason', v_review));
    v_id := public.presale_enqueue('shop_review_needed', 'shop_review_needed:' || r.id || ':balance:' || v_review, 'shop', null,
      r.id, null, b.id, false, jsonb_build_object('reason', v_review, 'session', p_session_id));
    if v_id is not null then v_notifications := v_notifications || v_id; end if;
    return jsonb_build_object('result', 'needs_review', 'reservation_id', r.id, 'review_reason', v_review,
                              'notification_ids', to_jsonb(v_notifications));
  end if;

  insert into public.orders (
    stripe_session_id, stripe_payment_intent_id, amount_total_cents, currency, customer_email,
    payment_status, kind, code, user_id, reservation_id, batch_id, status, customer_name,
    customer_phone, shipping_address, billing_address, subtotal_cents, discount_cents, amount_paid_cents
  ) values (
    p_session_id, p_payment_intent_id, r.total_cents, r.currency,
    coalesce(r.email, nullif(btrim(coalesce(p_customer ->> 'email', '')), '')),
    'paid', 'presale', public.presale_new_order_code(), r.user_id, r.id, b.id, 'paid',
    coalesce(nullif(btrim(coalesce(p_shipping ->> 'name', '')), ''), r.customer_name,
             nullif(btrim(coalesce(p_customer ->> 'name', '')), '')),
    coalesce(nullif(btrim(coalesce(p_customer ->> 'phone', '')), ''), r.phone),
    p_shipping, p_billing, r.subtotal_cents, r.discount_cents, r.deposit_cents + p_amount_cents
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, variant_id, product_name, quantity, unit_price_cents, finish_id, finish_name,
    diameter, width, et, sets, config_snapshot
  ) values (
    v_order_id, r.variant_id, r.product_name, r.quantity_sets * r.units_per_set, r.unit_price_cents,
    r.finish_id, r.finish_name, r.diameter, r.width, r.et, r.quantity_sets, r.config_snapshot
  );

  update public.reservations set
    status = 'completed',
    deposit_status = 'applied',
    balance_paid_at = p_now,
    order_id = v_order_id,
    stripe_balance_session_id = p_session_id,
    stripe_balance_payment_intent_id = coalesce(p_payment_intent_id, stripe_balance_payment_intent_id),
    phone = coalesce(phone, nullif(btrim(coalesce(p_customer ->> 'phone', '')), '')),
    customer_name = coalesce(customer_name, nullif(btrim(coalesce(p_customer ->> 'name', '')), ''))
  where id = r.id
  returning * into r;

  update public.inventory_allocations set order_id = v_order_id where id = a.id;
  update public.payments set order_id = v_order_id where reservation_id = r.id;

  perform public.presale_audit('reservation', r.id::text, 'balance_paid', 'stripe', null,
    jsonb_build_object('session', p_session_id, 'amount_cents', p_amount_cents, 'order_id', v_order_id));

  v_id := public.presale_enqueue('balance_paid', 'balance_paid:' || r.id, 'customer', r.email, r.id, v_order_id, b.id);
  if v_id is not null then v_notifications := v_notifications || v_id; end if;
  v_id := public.presale_enqueue('shop_balance_paid', 'shop_balance_paid:' || r.id, 'shop', null, r.id, v_order_id, b.id);
  if v_id is not null then v_notifications := v_notifications || v_id; end if;

  return jsonb_build_object(
    'result', 'completed',
    'reservation_id', r.id,
    'order_id', v_order_id,
    'notification_ids', to_jsonb(v_notifications)
  );
end;
$$;

-- Reembolso registrado (desde el panel o detectado por webhook charge.refunded).
-- p_refunded_total_cents es el ACUMULADO devuelto de ese pago (monótono:
-- un evento antiguo que llegue tarde no puede reducirlo).
create or replace function public.presale_record_refund(
  p_payment_intent_id    text,
  p_refunded_total_cents integer,
  p_now                  timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pmt         public.payments%rowtype;
  v_new       integer;
  v_prev      integer;
  v_email     text;
  v_order_id  uuid;
  v_refunded  integer;
  v_paid      integer;
  v_id        uuid;
  v_pmt_id    uuid;
  v_res_id    uuid;
  v_notifications uuid[] := '{}';
begin
  select id, reservation_id into v_pmt_id, v_res_id from public.payments
   where stripe_payment_intent_id = p_payment_intent_id
   order by created_at desc limit 1;

  -- Orden de bloqueo: reserva → pago → pedido.
  if v_res_id is not null then
    perform 1 from public.reservations where id = v_res_id for update;
  end if;
  if v_pmt_id is not null then
    select * into pmt from public.payments where id = v_pmt_id for update;
  end if;

  if v_pmt_id is null then
    -- Pedido del carrito anterior al sistema de preventa (sin fila en payments).
    update public.orders
       set refunded_cents = greatest(refunded_cents, coalesce(p_refunded_total_cents, 0)),
           status = case
             when greatest(refunded_cents, coalesce(p_refunded_total_cents, 0)) >= coalesce(amount_total_cents, 0)
               then 'refunded' else status end
     where stripe_payment_intent_id = p_payment_intent_id
     returning id into v_order_id;
    if v_order_id is null then
      return jsonb_build_object('result', 'not_found');
    end if;
    perform public.presale_audit('order', v_order_id::text, 'refund_recorded', 'stripe', null,
      jsonb_build_object('refunded_total_cents', p_refunded_total_cents));
    return jsonb_build_object('result', 'legacy_order', 'order_id', v_order_id);
  end if;

  v_prev := pmt.refunded_cents;
  v_new := least(greatest(pmt.refunded_cents, coalesce(p_refunded_total_cents, 0)), pmt.amount_cents);
  if v_new = v_prev then
    return jsonb_build_object('result', 'already', 'payment_id', pmt.id);
  end if;

  update public.payments
     set refunded_cents = v_new,
         status = case when v_new >= amount_cents then 'refunded' else 'partially_refunded' end
   where id = pmt.id;

  if pmt.purpose = 'deposit' and v_new >= pmt.amount_cents then
    update public.reservations set deposit_status = 'refunded'
     where id = pmt.reservation_id and deposit_status in ('paid', 'refund_pending', 'retained');
  end if;

  v_order_id := pmt.order_id;
  if v_order_id is not null then
    select coalesce(sum(refunded_cents), 0) into v_refunded from public.payments where order_id = v_order_id;
    select amount_paid_cents into v_paid from public.orders where id = v_order_id;
    update public.orders
       set refunded_cents = v_refunded,
           status = case when v_refunded >= coalesce(v_paid, amount_total_cents, 0) then 'refunded' else status end
     where id = v_order_id;
  end if;

  select coalesce(
           (select email from public.reservations where id = pmt.reservation_id),
           (select customer_email from public.orders where id = v_order_id)
         ) into v_email;

  perform public.presale_audit('payment', pmt.id::text, 'refund_recorded', 'stripe', null,
    jsonb_build_object('purpose', pmt.purpose, 'refunded_total_cents', v_new, 'refunded_now_cents', v_new - v_prev));

  v_id := public.presale_enqueue('refund_issued', 'refund_issued:' || pmt.id || ':' || v_new, 'customer', v_email,
    pmt.reservation_id, v_order_id, null, false,
    jsonb_build_object('purpose', pmt.purpose, 'amount_cents', v_new - v_prev, 'refunded_total_cents', v_new,
                       'payment_amount_cents', pmt.amount_cents));
  if v_id is not null then v_notifications := v_notifications || v_id; end if;

  return jsonb_build_object('result', 'recorded', 'payment_id', pmt.id, 'refunded_total_cents', v_new,
                            'notification_ids', to_jsonb(v_notifications));
end;
$$;

-- =========================================================
-- E · Ciclo de vida de la tirada
-- =========================================================

-- Lanzamiento oficial (lo confirma el administrador): fija la fecha efectiva,
-- abre el plazo de pago de cada reserva y habilita la venta directa.
create or replace function public.presale_launch_batch(
  p_batch_id uuid,
  p_actor    uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b       public.production_batches%rowtype;
  r       record;
  v_due   timestamptz;
  v_count integer := 0;
begin
  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;
  if b.status not in ('draft', 'presale_open', 'presale_closed') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'status', b.status);
  end if;
  if b.capacity_sets <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_capacity');
  end if;
  if not exists (select 1 from public.production_batch_products where batch_id = b.id) then
    return jsonb_build_object('ok', false, 'reason', 'no_products');
  end if;

  update public.production_batches set status = 'launched', launched_at = p_now where id = b.id;
  v_due := p_now + make_interval(days => b.balance_window_days);

  for r in
    select id, email from public.reservations
    where batch_id = b.id and status = 'confirmed'
    order by created_at
    for update
  loop
    update public.reservations set status = 'balance_due', balance_due_at = v_due where id = r.id;
    perform public.presale_enqueue('launch_announcement', 'launch_announcement:' || r.id, 'customer', r.email,
      r.id, null, b.id, true);
    v_count := v_count + 1;
  end loop;

  perform public.presale_audit('batch', b.id::text, 'launched', 'admin', p_actor,
    jsonb_build_object('from', b.status, 'launched_at', p_now, 'balance_due_at', v_due, 'reservations', v_count));

  return jsonb_build_object('ok', true, 'launched_at', p_now, 'balance_due_at', v_due, 'reservations', v_count);
end;
$$;

-- Resto de hitos confirmados por el administrador.
create or replace function public.presale_set_batch_status(
  p_batch_id uuid,
  p_status   text,
  p_actor    uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b public.production_batches%rowtype;
begin
  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;

  if not (
       (b.status = 'draft'          and p_status = 'presale_open')
    or (b.status = 'presale_open'   and p_status = 'presale_closed')
    or (b.status = 'presale_closed' and p_status = 'presale_open')
    or (b.status = 'launched'       and p_status in ('in_production', 'available'))
    or (b.status = 'in_production'  and p_status = 'available')
    or (b.status = 'available'      and p_status = 'completed')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', b.status, 'to', p_status);
  end if;

  if p_status = 'presale_open' then
    if b.capacity_sets <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'no_capacity');
    end if;
    if not exists (select 1 from public.production_batch_products where batch_id = b.id) then
      return jsonb_build_object('ok', false, 'reason', 'no_products');
    end if;
    if nullif(btrim(coalesce(b.reservation_terms, '')), '') is null
       or nullif(btrim(coalesce(b.cancellation_policy, '')), '') is null
       or nullif(btrim(coalesce(b.refund_policy, '')), '') is null
       or nullif(btrim(coalesce(b.expiry_policy, '')), '') is null then
      return jsonb_build_object('ok', false, 'reason', 'terms_missing');
    end if;
    if b.presale_closes_at is not null and b.presale_closes_at <= p_now then
      return jsonb_build_object('ok', false, 'reason', 'presale_close_date_passed');
    end if;
  end if;

  if p_status = 'completed' and exists (
    select 1 from public.reservations
    where batch_id = b.id
      and status in ('pending_deposit', 'deposit_processing', 'confirmed', 'balance_due', 'balance_processing', 'needs_review')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'open_reservations');
  end if;

  update public.production_batches set status = p_status where id = b.id;
  perform public.presale_audit('batch', b.id::text, 'status_changed', 'admin', p_actor,
    jsonb_build_object('from', b.status, 'to', p_status));

  return jsonb_build_object('ok', true, 'from', b.status, 'to', p_status);
end;
$$;

-- Cancelación de la tirada: libera retenciones y cancela las reservas. Las
-- señales quedan marcadas para devolver (el reembolso lo ejecuta el admin).
create or replace function public.presale_cancel_batch(
  p_batch_id uuid,
  p_reason   text,
  p_actor    uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b             public.production_batches%rowtype;
  r             record;
  v_cancelled   integer := 0;
  v_abandoned   integer := 0;
  v_paid_orders integer := 0;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;
  if b.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'status', b.status);
  end if;

  update public.production_batches set status = 'cancelled' where id = b.id;

  for r in
    select id, email, status, deposit_status from public.reservations
    where batch_id = b.id
      and status in ('pending_deposit', 'deposit_processing', 'confirmed', 'balance_due', 'balance_processing')
    order by created_at
    for update
  loop
    if r.status = 'pending_deposit' then
      update public.reservations set status = 'abandoned' where id = r.id;
      v_abandoned := v_abandoned + 1;
    else
      -- deposit_processing / balance_processing: el pago en curso, si llega a
      -- cobrarse, quedará en revisión (reserva cancelada) para devolverlo.
      update public.reservations set
        status = 'cancelled',
        cancelled_at = p_now,
        cancellation_reason = left('Tirada cancelada: ' || p_reason, 500),
        deposit_status = case when deposit_status = 'paid' then 'refund_pending' else deposit_status end
      where id = r.id;
      if r.deposit_status = 'paid' then
        perform public.presale_enqueue('reservation_cancelled', 'reservation_cancelled:' || r.id, 'customer', r.email,
          r.id, null, b.id, true, jsonb_build_object('by', 'batch_cancelled'));
      end if;
      v_cancelled := v_cancelled + 1;
    end if;
  end loop;

  update public.inventory_allocations
     set status = 'released', release_reason = 'batch_cancelled', released_at = p_now
   where batch_id = b.id and status in ('held', 'reserved');

  select count(*) into v_paid_orders
  from public.orders where batch_id = b.id and status not in ('cancelled', 'refunded');

  perform public.presale_audit('batch', b.id::text, 'cancelled', 'admin', p_actor,
    jsonb_build_object('from', b.status, 'reason', p_reason, 'reservations_cancelled', v_cancelled,
                       'checkouts_abandoned', v_abandoned, 'paid_orders_to_review', v_paid_orders));

  return jsonb_build_object('ok', true, 'reservations_cancelled', v_cancelled,
                            'checkouts_abandoned', v_abandoned, 'paid_orders_to_review', v_paid_orders);
end;
$$;

-- Tareas programadas (pg_cron cada 5 minutos). No depende de visitas a la web.
create or replace function public.presale_run_maintenance(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  rec         record;
  v_holds     integer := 0;
  v_expired   integer := 0;
  v_reminders integer := 0;
  v_warnings  integer := 0;
  v_closed    integer := 0;
  v_stuck     integer := 0;
  v_purged    integer := 0;
begin
  -- 1 · Retenciones caducadas (ya no ocupaban plaza: aquí solo se ordenan).
  --     Reserva y asignación se bloquean juntas con SKIP LOCKED: si un webhook
  --     las está confirmando en este momento, se dejan para la próxima pasada.
  for rec in
    select a.id as allocation_id, a.reservation_id
    from public.inventory_allocations a
    join public.reservations res on res.id = a.reservation_id
    where a.status = 'held' and a.hold_expires_at <= p_now
    for update of res, a skip locked
  loop
    update public.inventory_allocations
       set status = 'released', release_reason = 'hold_expired', released_at = p_now
     where id = rec.allocation_id and status = 'held';
    update public.reservations set status = 'abandoned'
     where id = rec.reservation_id and status in ('pending_deposit', 'deposit_processing');
    update public.payments set status = 'expired'
     where allocation_id = rec.allocation_id and status in ('open', 'processing');
    v_holds := v_holds + 1;
  end loop;

  for rec in
    select a.id as allocation_id
    from public.inventory_allocations a
    where a.status = 'held' and a.reservation_id is null and a.hold_expires_at <= p_now
    for update skip locked
  loop
    update public.inventory_allocations
       set status = 'released', release_reason = 'hold_expired', released_at = p_now
     where id = rec.allocation_id and status = 'held';
    update public.payments set status = 'expired'
     where allocation_id = rec.allocation_id and status in ('open', 'processing');
    v_holds := v_holds + 1;
  end loop;

  -- 2 · Reservas caducadas: plazo vencido, sin pago completado y sin un
  --     checkout del importe restante que todavía pueda cobrarse.
  -- La política aplicable es la que el cliente ACEPTÓ (instantánea), no la
  -- configuración actual de la tirada.
  for rec in
    select res.id, res.email, res.batch_id,
           coalesce(res.terms_snapshot ->> 'expiry_deposit_policy', 'manual_review') as expiry_deposit_policy,
           coalesce((res.terms_snapshot ->> 'policies_legally_validated')::boolean, false) as policies_legally_validated
    from public.reservations res
    where res.status = 'balance_due'
      and res.balance_due_at <= p_now
      and not exists (
        select 1 from public.payments p
        where p.reservation_id = res.id and p.purpose = 'balance'
          and (p.status = 'processing' or (p.status = 'open' and p.checkout_expires_at > p_now))
      )
    for update of res skip locked
  loop
    update public.reservations set
      status = 'expired',
      expired_at = p_now,
      -- La señal NUNCA se pierde por defecto (manual_review → sigue 'paid').
      deposit_status = case
        when deposit_status <> 'paid' then deposit_status
        when rec.expiry_deposit_policy = 'refund' then 'refund_pending'
        when rec.expiry_deposit_policy = 'retain' and rec.policies_legally_validated then 'retained'
        else 'paid'
      end
    where id = rec.id;

    update public.inventory_allocations
       set status = 'released', release_reason = 'reservation_expired', released_at = p_now
     where reservation_id = rec.id and status in ('reserved', 'held');

    update public.payments set status = 'expired'
     where reservation_id = rec.id and purpose = 'balance' and status = 'open';

    perform public.presale_audit('reservation', rec.id::text, 'expired', 'cron', null,
      jsonb_build_object('deposit_policy', rec.expiry_deposit_policy));
    perform public.presale_enqueue('reservation_expired', 'reservation_expired:' || rec.id, 'customer', rec.email,
      rec.id, null, rec.batch_id, true);
    v_expired := v_expired + 1;
  end loop;

  -- 3 · Recordatorios relativos a la fecha límite (día 15 y día 25 con el
  --     plazo por defecto de 30 días). Si coinciden, solo sale el último.
  for rec in
    select res.id, res.email, res.batch_id, res.balance_due_at,
           pb.balance_window_days, pb.first_reminder_day, pb.final_reminder_day
    from public.reservations res
    join public.production_batches pb on pb.id = res.batch_id
    where res.status = 'balance_due' and res.balance_due_at > p_now
  loop
    if p_now >= rec.balance_due_at - make_interval(days => rec.balance_window_days - rec.final_reminder_day) then
      if public.presale_enqueue('expiry_warning', 'expiry_warning:' || rec.id, 'customer', rec.email,
                                rec.id, null, rec.batch_id, true) is not null then
        v_warnings := v_warnings + 1;
      end if;
    elsif p_now >= rec.balance_due_at - make_interval(days => rec.balance_window_days - rec.first_reminder_day) then
      if public.presale_enqueue('balance_reminder', 'balance_reminder:' || rec.id, 'customer', rec.email,
                                rec.id, null, rec.batch_id, true) is not null then
        v_reminders := v_reminders + 1;
      end if;
    end if;
  end loop;

  -- 4 · Cierre automático de la preventa al llegar su fecha de cierre.
  for rec in
    select id from public.production_batches
    where status = 'presale_open' and presale_closes_at is not null and presale_closes_at <= p_now
    for update skip locked
  loop
    update public.production_batches set status = 'presale_closed' where id = rec.id;
    perform public.presale_audit('batch', rec.id::text, 'presale_auto_closed', 'cron', null,
      jsonb_build_object('at', p_now));
    v_closed := v_closed + 1;
  end loop;

  -- 5 · Correos que se quedaron "enviando" (proceso interrumpido) → reintento.
  update public.email_notifications
     set status = 'failed',
         last_error = left(coalesce(last_error || ' · ', '') || 'envío interrumpido', 1000),
         next_attempt_at = p_now
   where status = 'sending' and updated_at < p_now - interval '15 minutes';
  get diagnostics v_stuck = row_count;

  -- 6 · RGPD (minimización): checkouts abandonados sin pago → se borran los
  --     datos de contacto a los 30 días (se conservan datos de demanda).
  update public.reservations
     set email = null, customer_name = null, phone = null
   where status = 'abandoned' and deposit_status = 'unpaid'
     and (email is not null or customer_name is not null or phone is not null)
     and updated_at < p_now - interval '30 days';
  get diagnostics v_purged = row_count;

  return jsonb_build_object(
    'ran_at', p_now,
    'holds_released', v_holds,
    'reservations_expired', v_expired,
    'reminders_enqueued', v_reminders,
    'warnings_enqueued', v_warnings,
    'presales_closed', v_closed,
    'stuck_emails_requeued', v_stuck,
    'abandoned_contacts_purged', v_purged
  );
end;
$$;

-- =========================================================
-- F · Administración
-- =========================================================

create or replace function public.presale_admin_create_batch(
  p_fields jsonb,
  p_actor  uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.production_batches (
    code, name, description, capacity_sets, max_sets_per_order, presale_opens_at, presale_closes_at,
    planned_launch_at, estimated_delivery_on, estimated_delivery_note, deposit_cents,
    presale_discount_enabled, presale_discount_bps, balance_window_days, first_reminder_day,
    final_reminder_day, expiry_deposit_policy, policies_legally_validated, reservation_terms,
    cancellation_policy, refund_policy, expiry_policy
  ) values (
    lower(btrim(p_fields ->> 'code')),
    btrim(p_fields ->> 'name'),
    nullif(btrim(coalesce(p_fields ->> 'description', '')), ''),
    coalesce((p_fields ->> 'capacity_sets')::integer, 0),
    coalesce((p_fields ->> 'max_sets_per_order')::integer, 2),
    nullif(p_fields ->> 'presale_opens_at', '')::timestamptz,
    nullif(p_fields ->> 'presale_closes_at', '')::timestamptz,
    nullif(p_fields ->> 'planned_launch_at', '')::timestamptz,
    nullif(p_fields ->> 'estimated_delivery_on', '')::date,
    nullif(btrim(coalesce(p_fields ->> 'estimated_delivery_note', '')), ''),
    coalesce((p_fields ->> 'deposit_cents')::integer, 5000),
    coalesce((p_fields ->> 'presale_discount_enabled')::boolean, true),
    coalesce((p_fields ->> 'presale_discount_bps')::integer, 500),
    coalesce((p_fields ->> 'balance_window_days')::integer, 30),
    coalesce((p_fields ->> 'first_reminder_day')::integer, 15),
    coalesce((p_fields ->> 'final_reminder_day')::integer, 25),
    coalesce(nullif(p_fields ->> 'expiry_deposit_policy', ''), 'manual_review'),
    coalesce((p_fields ->> 'policies_legally_validated')::boolean, false),
    nullif(btrim(coalesce(p_fields ->> 'reservation_terms', '')), ''),
    nullif(btrim(coalesce(p_fields ->> 'cancellation_policy', '')), ''),
    nullif(btrim(coalesce(p_fields ->> 'refund_policy', '')), ''),
    nullif(btrim(coalesce(p_fields ->> 'expiry_policy', '')), '')
  )
  returning id into v_id;

  perform public.presale_audit('batch', v_id::text, 'created', 'admin', p_actor, p_fields - array[
    'reservation_terms', 'cancellation_policy', 'refund_policy', 'expiry_policy']);

  return jsonb_build_object('ok', true, 'batch_id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'code_taken');
  when check_violation or not_null_violation or invalid_text_representation
       or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields', 'detail', sqlerrm);
end;
$$;

-- Edición de una tirada. Los cambios de precio de reserva, descuento o
-- condiciones solo afectan a reservas NUEVAS (las existentes guardan su
-- instantánea). La capacidad nunca puede bajar de lo ya comprometido.
create or replace function public.presale_admin_update_batch(
  p_batch_id uuid,
  p_fields   jsonb,
  p_actor    uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b           public.production_batches%rowtype;
  v_new       public.production_batches%rowtype;
  v_committed integer;
  v_capacity  integer;
  v_changes   jsonb;
begin
  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;
  if b.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'batch_closed');
  end if;

  if p_fields ? 'capacity_sets' then
    v_capacity := (p_fields ->> 'capacity_sets')::integer;
    v_committed := public.presale_occupied_sets(b.id, p_now);
    if v_capacity is null or v_capacity < v_committed then
      return jsonb_build_object('ok', false, 'reason', 'capacity_below_committed', 'committed', v_committed);
    end if;
  end if;
  if p_fields ? 'code' and lower(btrim(p_fields ->> 'code')) <> b.code and b.status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'code_locked');
  end if;
  if b.status not in ('draft', 'presale_open', 'presale_closed')
     and (   (p_fields ? 'balance_window_days' and (p_fields ->> 'balance_window_days')::integer <> b.balance_window_days)
          or (p_fields ? 'first_reminder_day' and (p_fields ->> 'first_reminder_day')::integer <> b.first_reminder_day)
          or (p_fields ? 'final_reminder_day' and (p_fields ->> 'final_reminder_day')::integer <> b.final_reminder_day)) then
    return jsonb_build_object('ok', false, 'reason', 'window_locked');
  end if;

  update public.production_batches set
    code                       = case when p_fields ? 'code' then lower(btrim(p_fields ->> 'code')) else code end,
    name                       = case when p_fields ? 'name' then btrim(p_fields ->> 'name') else name end,
    description                = case when p_fields ? 'description' then nullif(btrim(coalesce(p_fields ->> 'description', '')), '') else description end,
    capacity_sets              = case when p_fields ? 'capacity_sets' then v_capacity else capacity_sets end,
    max_sets_per_order         = case when p_fields ? 'max_sets_per_order' then (p_fields ->> 'max_sets_per_order')::integer else max_sets_per_order end,
    presale_opens_at           = case when p_fields ? 'presale_opens_at' then nullif(p_fields ->> 'presale_opens_at', '')::timestamptz else presale_opens_at end,
    presale_closes_at          = case when p_fields ? 'presale_closes_at' then nullif(p_fields ->> 'presale_closes_at', '')::timestamptz else presale_closes_at end,
    planned_launch_at          = case when p_fields ? 'planned_launch_at' then nullif(p_fields ->> 'planned_launch_at', '')::timestamptz else planned_launch_at end,
    estimated_delivery_on      = case when p_fields ? 'estimated_delivery_on' then nullif(p_fields ->> 'estimated_delivery_on', '')::date else estimated_delivery_on end,
    estimated_delivery_note    = case when p_fields ? 'estimated_delivery_note' then nullif(btrim(coalesce(p_fields ->> 'estimated_delivery_note', '')), '') else estimated_delivery_note end,
    deposit_cents              = case when p_fields ? 'deposit_cents' then (p_fields ->> 'deposit_cents')::integer else deposit_cents end,
    presale_discount_enabled   = case when p_fields ? 'presale_discount_enabled' then (p_fields ->> 'presale_discount_enabled')::boolean else presale_discount_enabled end,
    presale_discount_bps       = case when p_fields ? 'presale_discount_bps' then (p_fields ->> 'presale_discount_bps')::integer else presale_discount_bps end,
    balance_window_days        = case when p_fields ? 'balance_window_days' then (p_fields ->> 'balance_window_days')::integer else balance_window_days end,
    first_reminder_day         = case when p_fields ? 'first_reminder_day' then (p_fields ->> 'first_reminder_day')::integer else first_reminder_day end,
    final_reminder_day         = case when p_fields ? 'final_reminder_day' then (p_fields ->> 'final_reminder_day')::integer else final_reminder_day end,
    expiry_deposit_policy      = case when p_fields ? 'expiry_deposit_policy' then p_fields ->> 'expiry_deposit_policy' else expiry_deposit_policy end,
    policies_legally_validated = case when p_fields ? 'policies_legally_validated' then (p_fields ->> 'policies_legally_validated')::boolean else policies_legally_validated end,
    reservation_terms          = case when p_fields ? 'reservation_terms' then nullif(btrim(coalesce(p_fields ->> 'reservation_terms', '')), '') else reservation_terms end,
    cancellation_policy        = case when p_fields ? 'cancellation_policy' then nullif(btrim(coalesce(p_fields ->> 'cancellation_policy', '')), '') else cancellation_policy end,
    refund_policy              = case when p_fields ? 'refund_policy' then nullif(btrim(coalesce(p_fields ->> 'refund_policy', '')), '') else refund_policy end,
    expiry_policy              = case when p_fields ? 'expiry_policy' then nullif(btrim(coalesce(p_fields ->> 'expiry_policy', '')), '') else expiry_policy end
  where id = b.id
  returning * into v_new;

  -- Con la preventa abierta no puede quedarse sin condiciones publicadas.
  if v_new.status = 'presale_open' and (
       nullif(btrim(coalesce(v_new.reservation_terms, '')), '') is null
    or nullif(btrim(coalesce(v_new.cancellation_policy, '')), '') is null
    or nullif(btrim(coalesce(v_new.refund_policy, '')), '') is null
    or nullif(btrim(coalesce(v_new.expiry_policy, '')), '') is null) then
    raise exception 'terms_missing' using errcode = '23514';
  end if;

  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(b)) o
  join jsonb_each(to_jsonb(v_new)) n using (key)
  where o.value is distinct from n.value and o.key <> 'updated_at';

  if v_changes <> '{}'::jsonb then
    perform public.presale_audit('batch', b.id::text, 'updated', 'admin', p_actor, jsonb_build_object('changes', v_changes));
  end if;

  return jsonb_build_object('ok', true, 'changes', v_changes);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'code_taken');
  when check_violation or not_null_violation or invalid_text_representation
       or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'reason',
      case when sqlerrm = 'terms_missing' then 'terms_missing' else 'invalid_fields' end, 'detail', sqlerrm);
end;
$$;

create or replace function public.presale_admin_set_batch_products(
  p_batch_id      uuid,
  p_product_slugs jsonb,
  p_actor         uuid default null,
  p_now           timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b      public.production_batches%rowtype;
  v_old  jsonb;
  v_new  jsonb;
begin
  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;
  if b.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'batch_closed');
  end if;
  if jsonb_typeof(p_product_slugs) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;

  -- No se puede quitar un modelo que ya tiene plazas comprometidas.
  if exists (
    select 1 from public.inventory_allocations a
    where a.batch_id = b.id
      and (a.status in ('reserved', 'sold') or (a.status = 'held' and a.hold_expires_at > p_now))
      and a.product_slug not in (select jsonb_array_elements_text(p_product_slugs))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'product_in_use');
  end if;

  select coalesce(jsonb_agg(product_slug order by product_slug), '[]'::jsonb) into v_old
  from public.production_batch_products where batch_id = b.id;

  delete from public.production_batch_products
   where batch_id = b.id
     and product_slug not in (select jsonb_array_elements_text(p_product_slugs));

  insert into public.production_batch_products (batch_id, product_slug)
  select b.id, s from jsonb_array_elements_text(p_product_slugs) s
  on conflict do nothing;

  select coalesce(jsonb_agg(product_slug order by product_slug), '[]'::jsonb) into v_new
  from public.production_batch_products where batch_id = b.id;

  if v_old <> v_new then
    perform public.presale_audit('batch', b.id::text, 'products_changed', 'admin', p_actor,
      jsonb_build_object('from', v_old, 'to', v_new));
  end if;

  return jsonb_build_object('ok', true, 'products', v_new);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields', 'detail', sqlerrm);
end;
$$;

create or replace function public.presale_admin_upsert_quota(
  p_batch_id uuid,
  p_quota    jsonb,
  p_actor    uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  b          public.production_batches%rowtype;
  v_product  text := p_quota ->> 'product_slug';
  v_finish   text := nullif(p_quota ->> 'finish_id', '');
  v_variant  text := nullif(p_quota ->> 'variant_id', '');
  v_capacity integer := (p_quota ->> 'capacity_sets')::integer;
  v_used     integer;
  v_id       uuid;
begin
  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;
  if b.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'batch_closed');
  end if;
  if v_capacity is null or v_capacity < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;

  select coalesce(sum(a.quantity_sets), 0) into v_used
  from public.inventory_allocations a
  where a.batch_id = b.id and a.product_slug = v_product
    and (v_finish is null or a.finish_id = v_finish)
    and (v_variant is null or a.variant_id = v_variant)
    and (a.status in ('reserved', 'sold') or (a.status = 'held' and a.hold_expires_at > p_now));
  if v_capacity < v_used then
    return jsonb_build_object('ok', false, 'reason', 'quota_below_committed', 'committed', v_used);
  end if;

  insert into public.production_batch_quotas (batch_id, product_slug, finish_id, variant_id, capacity_sets, note)
  values (b.id, v_product, v_finish, v_variant, v_capacity, nullif(btrim(coalesce(p_quota ->> 'note', '')), ''))
  on conflict (batch_id, product_slug, coalesce(finish_id, ''), coalesce(variant_id, ''))
  do update set capacity_sets = excluded.capacity_sets, note = excluded.note
  returning id into v_id;

  perform public.presale_audit('batch', b.id::text, 'quota_set', 'admin', p_actor,
    jsonb_build_object('quota_id', v_id, 'product', v_product, 'finish', v_finish, 'variant', v_variant,
                       'capacity_sets', v_capacity));

  return jsonb_build_object('ok', true, 'quota_id', v_id);
exception
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'reason', 'product_not_in_batch');
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields', 'detail', sqlerrm);
end;
$$;

create or replace function public.presale_admin_delete_quota(
  p_quota_id uuid,
  p_actor    uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q public.production_batch_quotas%rowtype;
begin
  delete from public.production_batch_quotas where id = p_quota_id returning * into q;
  if q.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform public.presale_audit('batch', q.batch_id::text, 'quota_deleted', 'admin', p_actor, to_jsonb(q));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.presale_admin_cancel_reservation(
  p_reservation_id uuid,
  p_reason         text,
  p_refund_deposit boolean,
  p_actor          uuid default null,
  p_now            timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r          public.reservations%rowtype;
  v_batch_id uuid;
  v_session  text;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  select batch_id into v_batch_id from public.reservations where id = p_reservation_id;
  if v_batch_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform 1 from public.production_batches where id = v_batch_id for update;
  select * into r from public.reservations where id = p_reservation_id for update;

  if r.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'use_order_cancellation');
  end if;
  if r.status in ('cancelled', 'expired', 'abandoned') then
    return jsonb_build_object('ok', false, 'reason', 'already_closed', 'status', r.status);
  end if;
  if r.status in ('deposit_processing', 'balance_processing') then
    return jsonb_build_object('ok', false, 'reason', 'payment_in_progress');
  end if;

  update public.reservations set
    status = case when r.status = 'pending_deposit' then 'abandoned' else 'cancelled' end,
    cancelled_at = p_now,
    cancellation_reason = left(p_reason, 500),
    deposit_status = case when deposit_status = 'paid' and p_refund_deposit then 'refund_pending' else deposit_status end
  where id = r.id
  returning * into r;

  update public.inventory_allocations
     set status = 'released',
         release_reason = case when status = 'held' then 'checkout_cancelled' else 'reservation_cancelled' end,
         released_at = p_now
   where reservation_id = r.id and status in ('held', 'reserved');

  select stripe_checkout_session_id into v_session
  from public.payments
  where reservation_id = r.id and status = 'open'
  order by created_at desc limit 1;

  update public.payments set status = 'expired' where reservation_id = r.id and status = 'open';

  perform public.presale_audit('reservation', r.id::text, 'cancelled', 'admin', p_actor,
    jsonb_build_object('reason', p_reason, 'refund_deposit', p_refund_deposit, 'deposit_status', r.deposit_status));

  if r.deposit_status <> 'unpaid' then
    perform public.presale_enqueue('reservation_cancelled', 'reservation_cancelled:' || r.id, 'customer', r.email,
      r.id, null, r.batch_id, false, jsonb_build_object('by', 'admin'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', r.status,
    'deposit_status', r.deposit_status,
    'deposit_payment_intent_id', r.stripe_deposit_payment_intent_id,
    'open_session_id', v_session
  );
end;
$$;

-- Decisión manual sobre la señal de una reserva caducada/cancelada.
create or replace function public.presale_admin_set_deposit_disposition(
  p_reservation_id uuid,
  p_disposition    text,
  p_note           text default null,
  p_actor          uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r public.reservations%rowtype;
begin
  if p_disposition not in ('retained', 'refund_pending') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if r.status not in ('expired', 'cancelled', 'needs_review') or r.deposit_status not in ('paid', 'refund_pending') then
    return jsonb_build_object('ok', false, 'reason', 'not_applicable', 'status', r.status, 'deposit_status', r.deposit_status);
  end if;
  -- Retener la señal solo es posible si las condiciones que aceptó el
  -- cliente estaban validadas legalmente en el momento de reservar.
  if p_disposition = 'retained'
     and not coalesce((r.terms_snapshot ->> 'policies_legally_validated')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'policy_not_validated');
  end if;

  update public.reservations set deposit_status = p_disposition where id = r.id;
  perform public.presale_audit('reservation', r.id::text, 'deposit_disposition', 'admin', p_actor,
    jsonb_build_object('from', r.deposit_status, 'to', p_disposition, 'note', p_note));
  return jsonb_build_object('ok', true, 'deposit_status', p_disposition,
                            'deposit_payment_intent_id', r.stripe_deposit_payment_intent_id);
end;
$$;

create or replace function public.presale_admin_review_config(
  p_reservation_id uuid,
  p_status         text,
  p_note           text default null,
  p_actor          uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if p_status not in ('pending', 'approved', 'rejected') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;
  select config_review_status into v_old from public.reservations where id = p_reservation_id for update;
  if v_old is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  update public.reservations
     set config_review_status = p_status,
         config_review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_reservation_id;
  perform public.presale_audit('reservation', p_reservation_id::text, 'config_reviewed', 'admin', p_actor,
    jsonb_build_object('from', v_old, 'to', p_status, 'note', p_note));
  return jsonb_build_object('ok', true);
end;
$$;

-- Fabricación y envío del pedido (preparado para notificar al cliente).
create or replace function public.presale_admin_update_order(
  p_order_id uuid,
  p_status   text,
  p_carrier  text default null,
  p_tracking text default null,
  p_notify   boolean default true,
  p_actor    uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o       public.orders%rowtype;
  v_rank  integer;
  v_new   integer;
  v_order text[] := array['paid', 'in_production', 'ready_to_ship', 'shipped', 'delivered'];
  v_id    uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  v_rank := array_position(v_order, o.status);
  v_new := array_position(v_order, p_status);
  if v_rank is null or v_new is null or v_new < v_rank then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', o.status, 'to', p_status);
  end if;

  update public.orders set
    status = p_status,
    carrier = coalesce(nullif(btrim(coalesce(p_carrier, '')), ''), carrier),
    tracking_number = coalesce(nullif(btrim(coalesce(p_tracking, '')), ''), tracking_number),
    shipped_at = case when p_status in ('shipped', 'delivered') then coalesce(shipped_at, p_now) else shipped_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, p_now) else delivered_at end
  where id = o.id;

  perform public.presale_audit('order', o.id::text, 'status_changed', 'admin', p_actor,
    jsonb_build_object('from', o.status, 'to', p_status, 'carrier', p_carrier, 'tracking', p_tracking));

  if p_notify and p_status in ('in_production', 'shipped', 'delivered') and p_status <> o.status then
    v_id := public.presale_enqueue('order_status_update', 'order_status_update:' || o.id || ':' || p_status,
      'customer', o.customer_email, o.reservation_id, o.id, o.batch_id, false, jsonb_build_object('status', p_status));
  end if;

  return jsonb_build_object('ok', true, 'notification_id', v_id);
end;
$$;

create or replace function public.presale_admin_cancel_order(
  p_order_id      uuid,
  p_reason        text,
  p_release_stock boolean,
  p_actor         uuid default null,
  p_now           timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o          public.orders%rowtype;
  v_released integer := 0;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;
  select * into o from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if o.batch_id is not null then
    perform 1 from public.production_batches where id = o.batch_id for update;
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.status in ('cancelled', 'refunded') then
    return jsonb_build_object('ok', false, 'reason', 'already_closed');
  end if;
  if p_release_stock and o.status in ('shipped', 'delivered') then
    return jsonb_build_object('ok', false, 'reason', 'already_shipped');
  end if;

  update public.orders set status = 'cancelled', review_reason = left(p_reason, 500) where id = o.id;

  if p_release_stock then
    update public.inventory_allocations
       set status = 'released', release_reason = 'order_cancelled', released_at = p_now
     where order_id = o.id and status = 'sold';
    get diagnostics v_released = row_count;
  end if;

  perform public.presale_audit('order', o.id::text, 'cancelled', 'admin', p_actor,
    jsonb_build_object('reason', p_reason, 'release_stock', p_release_stock, 'allocations_released', v_released));

  return jsonb_build_object('ok', true, 'allocations_released', v_released);
end;
$$;

-- Invalida los enlaces seguros enviados hasta ahora (p. ej. un correo
-- reenviado a quien no debía).
create or replace function public.presale_admin_rotate_access(
  p_kind  text,
  p_id    uuid,
  p_actor uuid default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_version integer;
begin
  if p_kind = 'reservation' then
    update public.reservations set access_version = access_version + 1 where id = p_id returning access_version into v_version;
  elsif p_kind = 'order' then
    update public.orders set access_version = access_version + 1 where id = p_id returning access_version into v_version;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid_fields');
  end if;
  if v_version is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform public.presale_audit(p_kind, p_id::text, 'access_links_rotated', 'admin', p_actor,
    jsonb_build_object('access_version', v_version));
  return jsonb_build_object('ok', true, 'access_version', v_version);
end;
$$;

-- Desglose de stock de una tirada (panel de fabricación).
create or replace function public.presale_admin_batch_inventory(
  p_batch_id uuid,
  p_now      timestamptz default now()
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'capacity_sets', b.capacity_sets,
    'held_sets', coalesce(sum(a.quantity_sets) filter (where a.status = 'held' and a.hold_expires_at > p_now), 0),
    'reserved_sets', coalesce(sum(a.quantity_sets) filter (where a.status = 'reserved'), 0),
    'sold_sets', coalesce(sum(a.quantity_sets) filter (where a.status = 'sold'), 0),
    'sold_direct_sets', coalesce(sum(a.quantity_sets) filter (where a.status = 'sold' and a.channel = 'direct'), 0),
    'sold_presale_sets', coalesce(sum(a.quantity_sets) filter (where a.status = 'sold' and a.channel = 'presale'), 0),
    'available_sets', greatest(b.capacity_sets - coalesce(sum(a.quantity_sets) filter (
                        where a.status in ('reserved', 'sold') or (a.status = 'held' and a.hold_expires_at > p_now)), 0), 0),
    'released', (
      select coalesce(jsonb_object_agg(x.release_reason, x.sets), '{}'::jsonb)
      from (
        select release_reason, sum(quantity_sets) as sets
        from public.inventory_allocations
        where batch_id = b.id and status = 'released'
        group by release_reason
      ) x
    ),
    'quotas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'product_slug', q.product_slug, 'finish_id', q.finish_id, 'variant_id', q.variant_id,
        'capacity_sets', q.capacity_sets, 'note', q.note,
        'remaining', public.presale_quota_remaining(q.batch_id, q.product_slug, q.finish_id, q.variant_id, p_now)
      ) order by q.product_slug, q.finish_id nulls first, q.variant_id nulls first), '[]'::jsonb)
      from public.production_batch_quotas q where q.batch_id = b.id
    )
  )
  from public.production_batches b
  left join public.inventory_allocations a on a.batch_id = b.id
  where b.id = p_batch_id
  group by b.id, b.capacity_sets;
$$;

-- Estadísticas (globales o de una tirada). Separa con claridad lo COBRADO
-- (pagos confirmados menos reembolsos) de lo POTENCIAL (reservas activas).
create or replace function public.presale_admin_stats(
  p_batch_id uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with res as (
    select * from public.reservations where p_batch_id is null or batch_id = p_batch_id
  ),
  paid_res as (
    select * from res where deposit_status <> 'unpaid'
  ),
  pay as (
    select p.*
    from public.payments p
    left join public.reservations r on r.id = p.reservation_id
    left join public.inventory_allocations a on a.id = p.allocation_id
    where p_batch_id is null or r.batch_id = p_batch_id or a.batch_id = p_batch_id
  ),
  ord as (
    select * from public.orders
    where kind in ('direct', 'presale') and (p_batch_id is null or batch_id = p_batch_id)
  ),
  -- Demanda = reservas con señal pagada (salvo canceladas) + ventas directas.
  demand as (
    select product_slug, product_name, variant_id, finish_name, diameter, width, et, quantity_sets as sets,
           vehicle_make, vehicle_model
    from paid_res
    where status <> 'cancelled'
    union all
    select a.product_slug, a.snapshot ->> 'product_name', a.variant_id, a.snapshot ->> 'finish_name',
           (a.snapshot ->> 'diameter')::numeric, (a.snapshot ->> 'width')::numeric, (a.snapshot ->> 'et')::integer,
           a.quantity_sets, null, null
    from public.inventory_allocations a
    where a.channel = 'direct' and a.status = 'sold' and (p_batch_id is null or a.batch_id = p_batch_id)
  )
  select jsonb_build_object(
    'generated_at', p_now,
    'reservations_total', (select count(*) from paid_res),
    'reservations_active', (select count(*) from res where status in ('confirmed', 'balance_due', 'balance_processing')),
    'reservations_expired', (select count(*) from res where status = 'expired'),
    'reservations_completed', (select count(*) from res where status = 'completed'),
    'reservations_cancelled', (select count(*) from paid_res where status = 'cancelled'),
    'reservations_needs_review', (select count(*) from res where status = 'needs_review'),
    'checkouts_pending', (select count(*) from res where status in ('pending_deposit', 'deposit_processing')),
    'checkouts_abandoned', (select count(*) from res where status = 'abandoned'),
    'sets_reserved_active', (select coalesce(sum(quantity_sets), 0) from res where status in ('confirmed', 'balance_due', 'balance_processing')),
    'deposits_collected_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from pay
                                  where purpose = 'deposit' and status in ('succeeded', 'partially_refunded', 'refunded')),
    'deposits_refunded_cents', (select coalesce(sum(refunded_cents), 0) from pay where purpose = 'deposit'),
    'deposits_pending_decision', (select count(*) from res
                                   where status in ('expired', 'cancelled', 'needs_review') and deposit_status in ('paid', 'refund_pending')),
    'potential_revenue_cents', (select coalesce(sum(total_cents), 0) from res where status in ('confirmed', 'balance_due', 'balance_processing')),
    'potential_pending_cents', (select coalesce(sum(balance_cents), 0) from res where status in ('confirmed', 'balance_due', 'balance_processing')),
    'collected_total_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from pay
                               where status in ('succeeded', 'partially_refunded', 'refunded')),
    'refunded_total_cents', (select coalesce(sum(refunded_cents), 0) from pay),
    'sales_completed_count', (select count(*) from ord where status not in ('cancelled', 'refunded')),
    'sales_completed_cents', (select coalesce(sum(coalesce(amount_paid_cents, amount_total_cents, 0) - refunded_cents), 0)
                               from ord where status not in ('cancelled', 'refunded')),
    'direct_sales_count', (select count(*) from ord where kind = 'direct' and status not in ('cancelled', 'refunded')),
    'presale_sales_count', (select count(*) from ord where kind = 'presale' and status not in ('cancelled', 'refunded')),
    -- Conversión = completadas / (completadas + caducadas): solo reservas con
    -- resultado ya decidido tras el lanzamiento.
    'conversion_rate', (select case when count(*) filter (where status in ('completed', 'expired')) = 0 then null
                                    else round(count(*) filter (where status = 'completed')::numeric
                                               / count(*) filter (where status in ('completed', 'expired')), 4) end
                        from paid_res),
    'top_models', (select coalesce(jsonb_agg(x order by (x ->> 'sets')::int desc, x ->> 'label'), '[]'::jsonb) from (
                     select jsonb_build_object('label', product_name, 'sets', sum(sets), 'count', count(*)) as x
                     from demand group by product_name order by sum(sets) desc limit 10) t),
    'top_finishes', (select coalesce(jsonb_agg(x order by (x ->> 'sets')::int desc, x ->> 'label'), '[]'::jsonb) from (
                     select jsonb_build_object('label', finish_name, 'sets', sum(sets), 'count', count(*)) as x
                     from demand group by finish_name order by sum(sets) desc limit 10) t),
    'top_sizes', (select coalesce(jsonb_agg(x order by (x ->> 'sets')::int desc), '[]'::jsonb) from (
                     select jsonb_build_object('diameter', diameter, 'width', width, 'sets', sum(sets), 'count', count(*)) as x
                     from demand group by diameter, width order by sum(sets) desc limit 10) t),
    'top_ets', (select coalesce(jsonb_agg(x order by (x ->> 'sets')::int desc), '[]'::jsonb) from (
                     select jsonb_build_object('et', et, 'sets', sum(sets), 'count', count(*)) as x
                     from demand group by et order by sum(sets) desc limit 10) t),
    'top_configs', (select coalesce(jsonb_agg(x order by (x ->> 'sets')::int desc), '[]'::jsonb) from (
                     select jsonb_build_object('variant_id', variant_id, 'product', product_name, 'finish', finish_name,
                                               'diameter', diameter, 'width', width, 'et', et,
                                               'sets', sum(sets), 'count', count(*)) as x
                     from demand group by variant_id, product_name, finish_name, diameter, width, et
                     order by sum(sets) desc limit 15) t),
    -- Agrupa sin distinguir mayúsculas y muestra la grafía más frecuente
    -- (así «BMW» no se convierte en «Bmw»).
    'top_vehicles', (select coalesce(jsonb_agg(x order by (x ->> 'count')::int desc), '[]'::jsonb) from (
                     select jsonb_build_object('make', mode() within group (order by btrim(vehicle_make)),
                                               'model', mode() within group (order by btrim(coalesce(vehicle_model, ''))),
                                               'count', count(*), 'sets', sum(sets)) as x
                     from demand
                     where nullif(btrim(coalesce(vehicle_make, '')), '') is not null
                     group by lower(btrim(vehicle_make)), lower(btrim(coalesce(vehicle_model, '')))
                     order by count(*) desc limit 15) t)
  );
$$;

-- =========================================================
-- G · Cuentas de cliente
-- =========================================================

-- Marca el email como verificado (tras abrir un enlace enviado a ese buzón).
create or replace function public.presale_mark_email_verified(
  p_user_id uuid,
  p_email   text,
  p_now     timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set email_verified_at = coalesce(email_verified_at, p_now)
   where id = p_user_id and lower(email) = lower(btrim(p_email));
  return jsonb_build_object('ok', found);
end;
$$;

-- Vincula al usuario las reservas y pedidos hechos como invitado con su
-- email, solo si ha demostrado que el email es suyo.
create or replace function public.presale_claim_guest_records(
  p_user_id uuid,
  p_email   text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_res integer := 0;
  v_ord integer := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and email_verified_at is not null and lower(email) = lower(btrim(p_email))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_not_verified');
  end if;

  update public.reservations set user_id = p_user_id
   where user_id is null and lower(email) = lower(btrim(p_email));
  get diagnostics v_res = row_count;

  update public.orders set user_id = p_user_id
   where user_id is null and lower(customer_email) = lower(btrim(p_email));
  get diagnostics v_ord = row_count;

  if v_res + v_ord > 0 then
    perform public.presale_audit('profile', p_user_id::text, 'guest_records_claimed', 'customer', p_user_id,
      jsonb_build_object('reservations', v_res, 'orders', v_ord));
  end if;

  return jsonb_build_object('ok', true, 'reservations', v_res, 'orders', v_ord);
end;
$$;

-- =========================================================
-- H · Idempotencia del webhook de Stripe
-- =========================================================

create or replace function public.stripe_event_begin(
  p_event_id   text,
  p_type       text,
  p_livemode   boolean,
  p_created_at timestamptz
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from public.stripe_events where id = p_event_id for update;
  if found then
    if v_status in ('processed', 'ignored') then
      return jsonb_build_object('process', false, 'status', v_status);
    end if;
    update public.stripe_events set attempts = attempts + 1, status = 'processing' where id = p_event_id;
    return jsonb_build_object('process', true, 'retry', true);
  end if;

  insert into public.stripe_events (id, type, livemode, stripe_created_at)
  values (p_event_id, p_type, p_livemode, p_created_at);
  return jsonb_build_object('process', true, 'retry', false);
exception
  when unique_violation then
    -- Entrega simultánea del mismo evento: los handlers son idempotentes.
    return jsonb_build_object('process', true, 'retry', true);
end;
$$;

create or replace function public.stripe_event_finish(
  p_event_id text,
  p_status   text,
  p_error    text default null
) returns void
language sql
set search_path = public, pg_temp
as $$
  update public.stripe_events
     set status = p_status,
         last_error = left(p_error, 2000),
         processed_at = case when p_status in ('processed', 'ignored') then now() else processed_at end
   where id = p_event_id;
$$;

-- =========================================================
-- I · Cola de correos
-- =========================================================

-- Reclama correos pendientes (SKIP LOCKED: varios despachadores a la vez no
-- envían el mismo correo dos veces).
create or replace function public.notification_claim(
  p_ids          jsonb default null,
  p_limit        integer default 20,
  p_include_bulk boolean default true,
  p_now          timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  -- Envíos masivos sin activar: quedan retenidos (visibles en el panel) sin
  -- consumir intentos.
  if not coalesce(p_include_bulk, true) then
    update public.email_notifications
       set status = 'held'
     where status = 'pending' and is_bulk;
  end if;

  with picked as (
    select n.id
    from public.email_notifications n
    where n.status in ('pending', 'failed')
      and n.attempts < n.max_attempts
      and n.next_attempt_at <= p_now
      and (coalesce(p_include_bulk, true) or not n.is_bulk)
      and (p_ids is null or n.id in (select (jsonb_array_elements_text(p_ids))::uuid))
    order by n.next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  ),
  upd as (
    update public.email_notifications n
       set status = 'sending', attempts = n.attempts + 1
      from picked
     where n.id = picked.id
    returning n.*
  )
  select coalesce(jsonb_agg(to_jsonb(upd) order by upd.next_attempt_at), '[]'::jsonb) into v_rows from upd;
  return v_rows;
end;
$$;

create or replace function public.notification_complete(
  p_id          uuid,
  p_status      text,
  p_error       text default null,
  p_provider_id text default null,
  p_retry_at    timestamptz default null,
  p_now         timestamptz default now()
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('sent', 'failed', 'held', 'cancelled') then
    raise exception 'Estado de notificación no válido: %', p_status using errcode = '22023';
  end if;
  update public.email_notifications
     set status = p_status,
         last_error = case when p_status = 'sent' then null else left(coalesce(p_error, last_error), 1000) end,
         provider_message_id = coalesce(p_provider_id, provider_message_id),
         sent_at = case when p_status = 'sent' then p_now else sent_at end,
         next_attempt_at = coalesce(p_retry_at, next_attempt_at)
   where id = p_id;
  if p_status = 'failed' then
    perform public.presale_audit('notification', p_id::text, 'send_failed', 'system', null,
      jsonb_build_object('error', left(p_error, 500)));
  end if;
end;
$$;

-- Datos necesarios para renderizar un correo.
create or replace function public.notification_context(p_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with n as (select * from public.email_notifications where id = p_id),
  o as (
    select o.* from public.orders o, n
    where o.id = n.order_id or (n.order_id is null and n.reservation_id is not null and o.reservation_id = n.reservation_id)
    limit 1
  )
  select jsonb_build_object(
    'notification', (select to_jsonb(n) from n),
    'reservation', (select to_jsonb(r) from public.reservations r, n where r.id = n.reservation_id),
    'order', (select to_jsonb(o) from o),
    'order_items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.order_items i where i.order_id = (select id from o)),
    'batch', (select to_jsonb(b) from public.production_batches b, n
              where b.id = coalesce(n.batch_id,
                                    (select r.batch_id from public.reservations r where r.id = n.reservation_id),
                                    (select o.batch_id from o))),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb)
                 from public.payments p, n
                 where (n.reservation_id is not null and p.reservation_id = n.reservation_id)
                    or (n.order_id is not null and p.order_id = n.order_id))
  );
$$;

-- Libera los correos automáticos retenidos (cuando se activen los envíos).
create or replace function public.notification_release_held(
  p_batch_id uuid default null,
  p_actor    uuid default null,
  p_now      timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.email_notifications
     set status = 'pending', next_attempt_at = p_now
   where status = 'held' and (p_batch_id is null or batch_id = p_batch_id);
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform public.presale_audit('system', null, 'held_emails_released', 'admin', p_actor,
      jsonb_build_object('batch_id', p_batch_id, 'count', v_count));
  end if;
  return jsonb_build_object('ok', true, 'released', v_count);
end;
$$;

-- Reintento manual de un correo fallido o cancelado.
create or replace function public.notification_requeue(
  p_id    uuid,
  p_actor uuid default null,
  p_now   timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.email_notifications
     set status = 'pending',
         next_attempt_at = p_now,
         max_attempts = greatest(max_attempts, attempts + 3)
   where id = p_id and status in ('failed', 'cancelled');
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_requeueable');
  end if;
  perform public.presale_audit('notification', p_id::text, 'requeued', 'admin', p_actor, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- Reenvío manual de un correo de cliente desde el panel.
create or replace function public.presale_enqueue_manual(
  p_template       text,
  p_reservation_id uuid default null,
  p_order_id       uuid default null,
  p_actor          uuid default null,
  p_now            timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_batch uuid;
  v_id    uuid;
begin
  if p_reservation_id is not null then
    select email, batch_id into v_email, v_batch from public.reservations where id = p_reservation_id;
  elsif p_order_id is not null then
    select customer_email, batch_id into v_email, v_batch from public.orders where id = p_order_id;
  end if;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'no_recipient');
  end if;

  v_id := public.presale_enqueue(
    p_template,
    p_template || ':' || coalesce(p_reservation_id, p_order_id)::text || ':manual:' || extract(epoch from p_now)::bigint,
    'customer', v_email, p_reservation_id, p_order_id, v_batch, false, jsonb_build_object('manual', true), p_now
  );
  perform public.presale_audit(case when p_reservation_id is not null then 'reservation' else 'order' end,
    coalesce(p_reservation_id, p_order_id)::text, 'email_resent', 'admin', p_actor,
    jsonb_build_object('template', p_template, 'notification_id', v_id));
  return jsonb_build_object('ok', v_id is not null, 'notification_id', v_id);
end;
$$;
