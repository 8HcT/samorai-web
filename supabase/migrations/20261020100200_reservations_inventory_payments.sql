-- ============================================================
-- SAMORAI · Reservas, inventario, pagos y ampliación de pedidos
--
-- Modelo de stock: la capacidad de una tirada se consume con filas de
-- `inventory_allocations`. Ocupan plaza:
--   · held      → retención temporal durante el checkout (caduca SOLA por
--                 tiempo: solo cuenta mientras hold_expires_at > now()).
--   · reserved  → reserva con señal pagada.
--   · sold      → vendido (pedido pagado). Nunca vuelve a liberarse salvo
--                 cancelación explícita del pedido por el administrador.
--   · released  → liberada (no ocupa plaza).
-- disponible = capacity_sets − (held vigentes + reserved + sold)
-- Todas las operaciones que AUMENTAN la ocupación bloquean la fila de la
-- tirada (SELECT … FOR UPDATE) → no hay sobreventa con peticiones
-- simultáneas. Ver 20261020100400_presale_functions.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Reservas de preventa
-- ------------------------------------------------------------
create table if not exists public.reservations (
  id                                uuid primary key default gen_random_uuid(),
  -- Referencia pública legible (p. ej. "SR-7F3A9C21D0").
  code                              text not null unique
                                      default ('SR-' || upper(substr(md5(gen_random_uuid()::text), 1, 10))),
  batch_id                          uuid not null references public.production_batches(id) on delete restrict,
  user_id                           uuid references auth.users(id) on delete set null,

  -- Contacto (datos mínimos: RGPD).
  email                             text check (email is null or (char_length(email) <= 254 and email like '%_@_%')),
  customer_name                     text check (char_length(customer_name) <= 120),
  phone                             text check (char_length(phone) <= 40),
  vehicle_make                      text check (char_length(vehicle_make) <= 60),
  vehicle_model                     text check (char_length(vehicle_model) <= 80),
  vehicle_year                      smallint check (vehicle_year between 1950 and 2100),

  -- Instantánea INMUTABLE de la configuración elegida.
  product_slug                      text not null,
  product_name                      text not null,
  variant_id                        text not null,
  finish_id                         text not null,
  finish_name                       text not null,
  diameter                          numeric(4,1) not null check (diameter > 0),
  width                             numeric(4,1) not null check (width > 0),
  et                                integer not null,
  pcd                               text not null,
  center_bore                       numeric(5,1) not null,
  config_snapshot                   jsonb not null,
  quantity_sets                     integer not null check (quantity_sets between 1 and 20),
  units_per_set                     integer not null check (units_per_set between 1 and 8),

  -- Instantánea INMUTABLE de precios (céntimos de EUR, IVA incluido).
  currency                          text not null default 'eur' check (currency = 'eur'),
  unit_price_cents                  integer not null check (unit_price_cents > 0),
  subtotal_cents                    integer not null,  -- precio original
  discount_bps                      integer not null check (discount_bps between 0 and 5000),
  discount_cents                    integer not null,  -- descuento aplicado
  total_cents                       integer not null,  -- precio final comprometido
  deposit_cents                     integer not null check (deposit_cents > 0),  -- importe de la reserva
  balance_cents                     integer not null,  -- importe pendiente

  -- Condiciones aceptadas (copia literal de la tirada en ese momento).
  terms_snapshot                    jsonb not null,
  terms_accepted_at                 timestamptz not null,

  status                            text not null default 'pending_deposit'
                                      check (status in (
                                        'pending_deposit',     -- checkout de la señal abierto (retención)
                                        'deposit_processing',  -- pago diferido de la señal en curso
                                        'confirmed',           -- señal pagada, antes del lanzamiento
                                        'balance_due',         -- lanzamiento: plazo de pago abierto
                                        'balance_processing',  -- pago diferido del resto en curso
                                        'completed',           -- pagada por completo → pedido
                                        'expired',             -- caducada sin completar el pago
                                        'cancelled',           -- cancelada (cliente/admin/tirada)
                                        'abandoned',           -- checkout de la señal no completado
                                        'needs_review'         -- incoherencia que requiere revisión manual
                                      )),
  -- Estado de la señal: unpaid → paid → (applied | refund_pending → refunded | retained)
  deposit_status                    text not null default 'unpaid'
                                      check (deposit_status in ('unpaid', 'paid', 'applied', 'refund_pending', 'refunded', 'retained')),

  deposit_paid_at                   timestamptz,
  -- Fecha EXACTA (UTC) límite para pagar el resto. Se fija en el lanzamiento.
  balance_due_at                    timestamptz,
  balance_paid_at                   timestamptz,
  expired_at                        timestamptz,
  cancelled_at                      timestamptz,
  cancellation_reason               text check (char_length(cancellation_reason) <= 500),
  review_reason                     text check (char_length(review_reason) <= 500),

  -- Validación de configuración / compatibilidad por el equipo.
  config_review_status              text not null default 'pending'
                                      check (config_review_status in ('pending', 'approved', 'rejected')),
  config_review_note                text check (char_length(config_review_note) <= 1000),

  -- Referencias de Stripe (nunca datos de tarjeta).
  stripe_deposit_session_id         text unique,
  stripe_deposit_payment_intent_id  text,
  stripe_balance_session_id         text,
  stripe_balance_payment_intent_id  text,

  order_id                          uuid references public.orders(id) on delete set null,
  -- Versión de los enlaces seguros: incrementarla invalida los anteriores.
  access_version                    integer not null default 1 check (access_version > 0),
  locale                            text not null default 'es' check (locale in ('es', 'en')),
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),

  constraint reservations_pricing_chk check (
        subtotal_cents = unit_price_cents * units_per_set * quantity_sets
    and discount_cents between 0 and subtotal_cents
    and total_cents = subtotal_cents - discount_cents
    and balance_cents = total_cents - deposit_cents
    and balance_cents > 0
  ),
  constraint reservations_paid_needs_email_chk check (deposit_status = 'unpaid' or email is not null),
  constraint reservations_balance_due_chk check (status <> 'balance_due' or balance_due_at is not null)
);

create index if not exists reservations_batch_status_idx on public.reservations (batch_id, status);
create index if not exists reservations_status_due_idx on public.reservations (status, balance_due_at);
create index if not exists reservations_email_lower_idx on public.reservations (lower(email));
create index if not exists reservations_user_idx on public.reservations (user_id);
create index if not exists reservations_config_idx on public.reservations (product_slug, finish_id, width, et);
create index if not exists reservations_created_idx on public.reservations (created_at desc);

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- La configuración, los precios y las condiciones aceptadas son una
-- instantánea: ningún cambio posterior (catálogo, tirada o admin) puede
-- alterarlos. Para cambiar una configuración se cancela y se reserva de nuevo.
create or replace function public.guard_reservation_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.code, new.batch_id, new.product_slug, new.product_name, new.variant_id,
      new.finish_id, new.finish_name, new.diameter, new.width, new.et, new.pcd,
      new.center_bore, new.config_snapshot, new.quantity_sets, new.units_per_set,
      new.currency, new.unit_price_cents, new.subtotal_cents, new.discount_bps,
      new.discount_cents, new.total_cents, new.deposit_cents, new.balance_cents,
      new.terms_snapshot, new.terms_accepted_at, new.created_at)
     is distinct from
     (old.code, old.batch_id, old.product_slug, old.product_name, old.variant_id,
      old.finish_id, old.finish_name, old.diameter, old.width, old.et, old.pcd,
      old.center_bore, old.config_snapshot, old.quantity_sets, old.units_per_set,
      old.currency, old.unit_price_cents, old.subtotal_cents, old.discount_bps,
      old.discount_cents, old.total_cents, old.deposit_cents, old.balance_cents,
      old.terms_snapshot, old.terms_accepted_at, old.created_at)
  then
    raise exception 'La instantánea de la reserva % es inmutable', old.code
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_guard_snapshot on public.reservations;
create trigger reservations_guard_snapshot
  before update on public.reservations
  for each row execute function public.guard_reservation_snapshot();

-- ------------------------------------------------------------
-- Asignaciones de inventario (la única fuente del stock)
-- ------------------------------------------------------------
create table if not exists public.inventory_allocations (
  id                          uuid primary key default gen_random_uuid(),
  batch_id                    uuid not null references public.production_batches(id) on delete restrict,
  channel                     text not null check (channel in ('presale', 'direct')),
  status                      text not null check (status in ('held', 'reserved', 'sold', 'released')),
  quantity_sets               integer not null check (quantity_sets between 1 and 20),
  product_slug                text not null,
  finish_id                   text not null,
  variant_id                  text not null,
  -- Solo para `held`: la retención deja de ocupar plaza a partir de aquí.
  hold_expires_at             timestamptz,
  reservation_id              uuid references public.reservations(id) on delete restrict,
  order_id                    uuid references public.orders(id) on delete set null,
  user_id                     uuid references auth.users(id) on delete set null,
  -- Venta directa: instantánea de configuración y precio calculada por el
  -- servidor al crear la retención (el webhook nunca recalcula importes).
  snapshot                    jsonb,
  stripe_checkout_session_id  text unique,
  -- Hash (con secreto) del cliente para limitar acaparamiento de retenciones.
  client_fingerprint          text,
  release_reason              text check (release_reason in (
                                'hold_expired', 'checkout_expired', 'checkout_cancelled',
                                'payment_failed', 'stripe_error', 'reservation_expired',
                                'reservation_cancelled', 'order_cancelled', 'batch_cancelled'
                              )),
  released_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint inventory_allocations_hold_chk check (status <> 'held' or hold_expires_at is not null),
  constraint inventory_allocations_released_chk check ((status = 'released') = (released_at is not null)),
  constraint inventory_allocations_presale_chk check (channel <> 'presale' or reservation_id is not null),
  constraint inventory_allocations_direct_chk check (channel <> 'direct' or snapshot is not null)
);

-- Índice parcial para el cálculo de ocupación (solo filas que ocupan plaza).
create index if not exists inventory_allocations_batch_active_idx
  on public.inventory_allocations (batch_id, product_slug, finish_id, variant_id)
  where status in ('held', 'reserved', 'sold');
create index if not exists inventory_allocations_reservation_idx on public.inventory_allocations (reservation_id);
create index if not exists inventory_allocations_hold_expiry_idx
  on public.inventory_allocations (hold_expires_at) where status = 'held';
create index if not exists inventory_allocations_fingerprint_idx
  on public.inventory_allocations (client_fingerprint) where status = 'held';

drop trigger if exists inventory_allocations_set_updated_at on public.inventory_allocations;
create trigger inventory_allocations_set_updated_at
  before update on public.inventory_allocations
  for each row execute function public.set_updated_at();

-- Transiciones válidas y campos inmutables.
create or replace function public.guard_inventory_allocation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.batch_id, new.channel, new.quantity_sets, new.product_slug, new.finish_id, new.variant_id)
     is distinct from
     (old.batch_id, old.channel, old.quantity_sets, old.product_slug, old.finish_id, old.variant_id) then
    raise exception 'Los datos de una asignación de inventario son inmutables' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'held'     and new.status in ('reserved', 'sold', 'released'))
      or (old.status = 'reserved' and new.status in ('sold', 'released'))
      -- Una plaza vendida solo se libera al cancelar el pedido explícitamente.
      or (old.status = 'sold'     and new.status = 'released' and new.release_reason = 'order_cancelled')
      -- Pago confirmado con retraso: se recupera la plaza si sigue libre
      -- (comprobado bajo bloqueo de la tirada en las funciones de confirmación).
      or (old.status = 'released' and new.status in ('reserved', 'sold')
          and old.release_reason in ('hold_expired', 'checkout_expired', 'reservation_expired'))
    ) then
      raise exception 'Transición de inventario no permitida: % → %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_allocations_guard on public.inventory_allocations;
create trigger inventory_allocations_guard
  before update on public.inventory_allocations
  for each row execute function public.guard_inventory_allocation();

-- ------------------------------------------------------------
-- Ampliación de pedidos (tabla existente, compatible con las filas actuales)
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists kind               text not null default 'cart',
  add column if not exists code               text,
  add column if not exists user_id            uuid references auth.users(id) on delete set null,
  add column if not exists reservation_id     uuid references public.reservations(id) on delete restrict,
  add column if not exists batch_id           uuid references public.production_batches(id) on delete restrict,
  add column if not exists status             text not null default 'paid',
  add column if not exists customer_name      text,
  add column if not exists customer_phone     text,
  add column if not exists shipping_address   jsonb,
  add column if not exists billing_address    jsonb,
  add column if not exists subtotal_cents     integer,
  add column if not exists discount_cents     integer not null default 0,
  add column if not exists amount_paid_cents  integer,
  add column if not exists refunded_cents     integer not null default 0,
  add column if not exists review_reason      text,
  add column if not exists carrier            text,
  add column if not exists tracking_number    text,
  add column if not exists shipped_at         timestamptz,
  add column if not exists delivered_at       timestamptz,
  add column if not exists access_version     integer not null default 1,
  add column if not exists updated_at         timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_kind_chk') then
    alter table public.orders add constraint orders_kind_chk
      check (kind in ('cart', 'direct', 'presale'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_status_chk') then
    alter table public.orders add constraint orders_status_chk
      check (status in ('paid', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'refunded'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_presale_chk') then
    alter table public.orders add constraint orders_presale_chk
      check (kind <> 'presale' or reservation_id is not null);
  end if;
end $$;

create unique index if not exists orders_code_uidx on public.orders (code) where code is not null;
create unique index if not exists orders_reservation_uidx on public.orders (reservation_id) where reservation_id is not null;
create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_email_lower_idx on public.orders (lower(customer_email));
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_payment_intent_idx on public.orders (stripe_payment_intent_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.order_items
  add column if not exists finish_id        text,
  add column if not exists finish_name      text,
  add column if not exists diameter         numeric(4,1),
  add column if not exists width            numeric(4,1),
  add column if not exists et               integer,
  add column if not exists sets             integer,
  add column if not exists config_snapshot  jsonb;

-- ------------------------------------------------------------
-- Pagos (cada sesión de Stripe Checkout: señal, resto o compra directa)
-- ------------------------------------------------------------
create table if not exists public.payments (
  id                          uuid primary key default gen_random_uuid(),
  purpose                     text not null check (purpose in ('deposit', 'balance', 'direct')),
  reservation_id              uuid references public.reservations(id) on delete restrict,
  order_id                    uuid references public.orders(id) on delete set null,
  allocation_id               uuid references public.inventory_allocations(id) on delete restrict,
  stripe_checkout_session_id  text not null unique,
  stripe_payment_intent_id    text,
  amount_cents                integer not null check (amount_cents > 0),
  currency                    text not null default 'eur',
  status                      text not null default 'open'
                                check (status in ('open', 'processing', 'succeeded', 'failed', 'expired', 'refunded', 'partially_refunded')),
  refunded_cents              integer not null default 0,
  checkout_expires_at         timestamptz,
  paid_at                     timestamptz,
  livemode                    boolean,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint payments_refund_chk check (refunded_cents between 0 and amount_cents),
  constraint payments_links_chk check (
       (purpose in ('deposit', 'balance') and reservation_id is not null)
    or (purpose = 'direct' and allocation_id is not null)
  )
);

create index if not exists payments_reservation_idx on public.payments (reservation_id, purpose, status);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_payment_intent_idx on public.payments (stripe_payment_intent_id);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create or replace function public.guard_payment_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.amount_cents, new.purpose, new.stripe_checkout_session_id, new.currency)
     is distinct from (old.amount_cents, old.purpose, old.stripe_checkout_session_id, old.currency) then
    raise exception 'El importe y la referencia de un pago son inmutables' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_amount on public.payments;
create trigger payments_guard_amount
  before update on public.payments
  for each row execute function public.guard_payment_amount();
