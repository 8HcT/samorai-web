-- ============================================================
-- SAMORAI · Correos (outbox), auditoría y eventos de Stripe
-- ============================================================

-- ------------------------------------------------------------
-- Cola de correos transaccionales (patrón outbox)
--
-- Cada correo se encola en la MISMA transacción que el cambio que lo
-- provoca (confirmación de pago, lanzamiento, caducidad…), así nunca se
-- pierde aunque el servidor caiga justo después. `dedupe_key` impide
-- duplicados; el despachador (app/lib/email/outbox.server.ts) reintenta con
-- espera creciente y registra cada intento.
-- ------------------------------------------------------------
create table if not exists public.email_notifications (
  id                   uuid primary key default gen_random_uuid(),
  template             text not null check (template ~ '^[a-z][a-z0-9_]{2,60}$'),
  dedupe_key           text not null unique,
  audience             text not null default 'customer' check (audience in ('customer', 'shop')),
  -- Destinatario del cliente. Para `shop` se resuelve al enviar (SHOP_ORDER_EMAIL).
  to_email             text,
  reservation_id       uuid references public.reservations(id) on delete set null,
  order_id             uuid references public.orders(id) on delete set null,
  batch_id             uuid references public.production_batches(id) on delete set null,
  -- Envíos automáticos o masivos (lanzamiento, recordatorios, caducidad…).
  -- Quedan RETENIDOS hasta activar PRESALE_BULK_EMAILS_ENABLED=true.
  is_bulk              boolean not null default false,
  status               text not null default 'pending'
                         check (status in ('pending', 'sending', 'sent', 'failed', 'held', 'cancelled')),
  attempts             integer not null default 0,
  max_attempts         integer not null default 6 check (max_attempts between 1 and 20),
  next_attempt_at      timestamptz not null default now(),
  last_error           text,
  provider_message_id  text,
  payload              jsonb not null default '{}'::jsonb,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint email_notifications_recipient_chk check (audience = 'shop' or to_email is not null)
);

create index if not exists email_notifications_due_idx
  on public.email_notifications (next_attempt_at)
  where status in ('pending', 'failed');
create index if not exists email_notifications_reservation_idx on public.email_notifications (reservation_id);
create index if not exists email_notifications_order_idx on public.email_notifications (order_id);
create index if not exists email_notifications_status_idx on public.email_notifications (status, created_at desc);

drop trigger if exists email_notifications_set_updated_at on public.email_notifications;
create trigger email_notifications_set_updated_at
  before update on public.email_notifications
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Registro de auditoría (cambios importantes, quién y cuándo)
-- ------------------------------------------------------------
create table if not exists public.audit_events (
  id           bigint generated always as identity primary key,
  entity_type  text not null check (entity_type in (
                 'batch', 'reservation', 'order', 'allocation', 'payment', 'notification', 'profile', 'system'
               )),
  entity_id    text,
  action       text not null,
  actor_type   text not null check (actor_type in ('system', 'admin', 'customer', 'stripe', 'cron')),
  actor_id     uuid,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);

-- ------------------------------------------------------------
-- Eventos de Stripe recibidos (idempotencia del webhook)
-- ------------------------------------------------------------
create table if not exists public.stripe_events (
  id                 text primary key,            -- evt_…
  type               text not null,
  livemode           boolean not null,
  stripe_created_at  timestamptz not null,
  status             text not null default 'processing'
                       check (status in ('processing', 'processed', 'failed', 'ignored')),
  attempts           integer not null default 1,
  last_error         text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz
);

create index if not exists stripe_events_status_idx on public.stripe_events (status, received_at desc);
