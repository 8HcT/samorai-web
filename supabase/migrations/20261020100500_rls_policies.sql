-- ============================================================
-- SAMORAI · Row Level Security y permisos
--
-- Modelo de acceso:
--   · anon (navegador sin sesión)   → sin acceso a ninguna tabla ni función.
--   · authenticated (cliente)       → SOLO lectura de sus propias filas
--                                     (panel «Mi cuenta») y edición de su
--                                     nombre/teléfono. Nunca escribe pedidos,
--                                     reservas, pagos ni stock.
--   · service_role (servidor)       → escrituras a través de las funciones
--                                     de 20261020100400 (salta RLS). La clave
--                                     solo existe en variables de entorno del
--                                     servidor.
-- El panel de administración comprueba el rol en el servidor y opera con la
-- service_role: ningún permiso de administrador viaja al navegador.
-- ============================================================

alter table public.profiles                 enable row level security;
alter table public.production_batches       enable row level security;
alter table public.production_batch_products enable row level security;
alter table public.production_batch_quotas  enable row level security;
alter table public.reservations             enable row level security;
alter table public.inventory_allocations    enable row level security;
alter table public.payments                 enable row level security;
alter table public.email_notifications      enable row level security;
alter table public.audit_events             enable row level security;
alter table public.stripe_events            enable row level security;
alter table public.orders                   enable row level security;
alter table public.order_items              enable row level security;

-- Defensa en profundidad: además de RLS, se retiran los privilegios que
-- Supabase concede por defecto a anon/authenticated sobre tablas nuevas.
revoke all on table
  public.profiles, public.production_batches, public.production_batch_products,
  public.production_batch_quotas, public.reservations, public.inventory_allocations,
  public.payments, public.email_notifications, public.audit_events, public.stripe_events,
  public.orders, public.order_items
from anon, authenticated;

grant select on table
  public.profiles, public.reservations, public.orders, public.order_items, public.payments
to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

grant all on table
  public.profiles, public.production_batches, public.production_batch_products,
  public.production_batch_quotas, public.reservations, public.inventory_allocations,
  public.payments, public.email_notifications, public.audit_events, public.stripe_events,
  public.orders, public.order_items
to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Políticas: cada usuario solo ve sus propios datos.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own on public.reservations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = (select auth.uid())
  ));

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (
    exists (select 1 from public.reservations r
            where r.id = payments.reservation_id and r.user_id = (select auth.uid()))
    or exists (select 1 from public.orders o
               where o.id = payments.order_id and o.user_id = (select auth.uid()))
  );

-- Funciones: solo el servidor (service_role) puede ejecutarlas.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'presale\_%'
           or p.proname like 'notification\_%'
           or p.proname like 'stripe\_event\_%'
           or p.proname in ('set_updated_at', 'guard_profile_privileged_columns', 'handle_new_auth_user',
                            'handle_auth_user_email_change', 'guard_reservation_snapshot',
                            'guard_inventory_allocation', 'guard_payment_amount'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
