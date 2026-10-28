-- ============================================================
-- SAMORAI · Tiradas de fabricación (production batches)
--
-- Una tirada es una fabricación limitada con capacidad en JUEGOS (4 llantas
-- por juego, configurable). Las reservas de preventa y las compras directas
-- consumen la misma capacidad (ver inventory_allocations).
--
-- El catálogo (modelos, acabados, referencias y precios) sigue viviendo en
-- el código (app/data/products.ts); aquí se referencia por `product_slug` y
-- el servidor valida cada referencia contra el catálogo antes de escribir.
-- ============================================================

create table if not exists public.production_batches (
  id                         uuid primary key default gen_random_uuid(),
  -- Identificador estable y legible (p. ej. "victoria-run-01").
  code                       text not null unique
                               check (code ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  -- Nombre visible (p. ej. "First Production Run").
  name                       text not null check (char_length(name) between 2 and 80),
  description                text check (char_length(description) <= 2000),

  status                     text not null default 'draft'
                               check (status in (
                                 'draft',           -- borrador (no visible)
                                 'presale_open',    -- preventa abierta
                                 'presale_closed',  -- preventa cerrada
                                 'launched',        -- lanzamiento oficial (pago restante + venta directa)
                                 'in_production',   -- en producción
                                 'available',       -- disponible / en stock
                                 'completed',       -- finalizada
                                 'cancelled'        -- cancelada
                               )),

  -- Capacidad total de la tirada, en juegos. Nunca puede bajar de lo ya
  -- comprometido (lo garantiza presale_admin_update_batch).
  capacity_sets              integer not null check (capacity_sets >= 0),
  units_per_set              integer not null default 4 check (units_per_set between 1 and 8),
  max_sets_per_order         integer not null default 2 check (max_sets_per_order between 1 and 20),

  presale_opens_at           timestamptz,
  presale_closes_at          timestamptz,
  -- Fecha prevista del lanzamiento oficial (informativa).
  planned_launch_at          timestamptz,
  -- Fecha EFECTIVA del lanzamiento: la fija el administrador al activarlo.
  launched_at                timestamptz,
  estimated_delivery_on      date,
  estimated_delivery_note    text check (char_length(estimated_delivery_note) <= 200),

  -- Condiciones económicas de la preventa (se copian en cada reserva).
  deposit_cents              integer not null default 5000 check (deposit_cents between 100 and 100000),
  presale_discount_enabled   boolean not null default true,
  -- Puntos básicos: 500 = 5,00 %.
  presale_discount_bps       integer not null default 500 check (presale_discount_bps between 0 and 5000),
  -- Plazo para completar el pago desde el lanzamiento (días naturales).
  balance_window_days        integer not null default 30 check (balance_window_days between 3 and 365),
  first_reminder_day         integer not null default 15,
  final_reminder_day         integer not null default 25,

  -- Qué hacer con la señal si la reserva caduca. Por defecto NUNCA se pierde
  -- automáticamente: queda pendiente de decisión del administrador.
  --   manual_review → el administrador decide caso a caso
  --   refund        → se marca para devolver (el reembolso lo ejecuta el admin)
  --   retain        → se conserva; solo si las condiciones están validadas
  expiry_deposit_policy      text not null default 'manual_review'
                               check (expiry_deposit_policy in ('manual_review', 'refund', 'retain')),
  -- El administrador confirma que los textos han pasado revisión legal.
  policies_legally_validated boolean not null default false,

  -- Textos que acepta el cliente (los redacta/valida el negocio; el código
  -- no inventa condiciones). Sin ellos la preventa no se puede abrir.
  reservation_terms          text check (char_length(reservation_terms) <= 10000),
  cancellation_policy        text check (char_length(cancellation_policy) <= 10000),
  refund_policy              text check (char_length(refund_policy) <= 10000),
  expiry_policy              text check (char_length(expiry_policy) <= 10000),

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint production_batches_presale_window_chk
    check (presale_closes_at is null or presale_opens_at is null or presale_closes_at > presale_opens_at),
  constraint production_batches_reminders_chk
    check (first_reminder_day > 0
           and first_reminder_day < final_reminder_day
           and final_reminder_day < balance_window_days),
  constraint production_batches_retain_requires_validation_chk
    check (expiry_deposit_policy <> 'retain' or policies_legally_validated),
  constraint production_batches_launched_at_chk
    check (status in ('draft', 'presale_open', 'presale_closed', 'cancelled') or launched_at is not null)
);

create index if not exists production_batches_status_idx on public.production_batches (status);

drop trigger if exists production_batches_set_updated_at on public.production_batches;
create trigger production_batches_set_updated_at
  before update on public.production_batches
  for each row execute function public.set_updated_at();

-- Modelos incluidos en la tirada.
create table if not exists public.production_batch_products (
  batch_id      uuid not null references public.production_batches(id) on delete cascade,
  product_slug  text not null check (product_slug ~ '^[a-z0-9][a-z0-9-]*$'),
  created_at    timestamptz not null default now(),
  primary key (batch_id, product_slug)
);

create index if not exists production_batch_products_slug_idx
  on public.production_batch_products (product_slug);

-- Cupos opcionales dentro de la tirada (por modelo, por acabado/color o por
-- referencia exacta). Un cupo de 0 bloquea esa configuración (p. ej. una
-- combinación que no puede fabricarse en esta tirada).
create table if not exists public.production_batch_quotas (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.production_batches(id) on delete cascade,
  product_slug   text not null,
  finish_id      text,
  variant_id     text,
  capacity_sets  integer not null check (capacity_sets >= 0),
  note           text check (char_length(note) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (batch_id, product_slug)
    references public.production_batch_products (batch_id, product_slug) on delete cascade
);

create unique index if not exists production_batch_quotas_scope_uidx
  on public.production_batch_quotas (batch_id, product_slug, coalesce(finish_id, ''), coalesce(variant_id, ''));

drop trigger if exists production_batch_quotas_set_updated_at on public.production_batch_quotas;
create trigger production_batch_quotas_set_updated_at
  before update on public.production_batch_quotas
  for each row execute function public.set_updated_at();
