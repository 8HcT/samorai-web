-- ============================================================
-- SAMORAI · Línea base: pedidos del carrito (ya aplicada en producción
-- el 2026-07-25 desde app/lib/orders/schema.sql).
--
-- Se versiona aquí para que un entorno nuevo (staging, tests) parta del
-- mismo esquema. Es idempotente: en la base de datos de producción no
-- cambia nada.
-- ============================================================

create table if not exists public.orders (
  id                        uuid primary key default gen_random_uuid(),
  stripe_session_id         text not null unique,
  stripe_payment_intent_id  text,
  amount_total_cents        integer,
  currency                  text not null default 'eur',
  customer_email            text,
  payment_status            text not null,
  created_at                timestamptz not null default now()
);

create table if not exists public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  variant_id        text not null,
  product_name      text not null,
  quantity          integer not null check (quantity > 0),
  unit_price_cents  integer not null
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
