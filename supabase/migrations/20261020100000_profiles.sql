-- ============================================================
-- SAMORAI · Perfiles de usuario (Supabase Auth)
--
-- Una fila por usuario de auth.users. El registro es OPCIONAL: reservas y
-- pedidos funcionan sin cuenta (comprador invitado) y se vinculan después,
-- cuando el usuario demuestra que el email es suyo.
-- ============================================================

-- Helper compartido: mantiene updated_at al día.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  full_name          text check (char_length(full_name) <= 120),
  phone              text check (char_length(phone) <= 40),
  -- Separación de roles: solo el servidor (service_role) puede cambiarlo.
  role               text not null default 'customer' check (role in ('customer', 'admin')),
  -- Momento en que el usuario demostró controlar `email` abriendo un enlace
  -- enviado a ese buzón (alta, enlace mágico o recuperación). Es la condición
  -- para vincular compras hechas como invitado. Se borra si cambia el email.
  email_verified_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- El rol nunca puede cambiarse desde la API pública, aunque alguien
-- ampliara por error los permisos de columna.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.email_verified_at is distinct from old.email_verified_at then
      raise exception 'Columna protegida: solo el servidor puede modificarla'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Alta automática del perfil cuando se crea el usuario en Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Si el usuario cambia de email, el nuevo debe verificarse de nuevo antes
-- de poder vincular compras de invitado.
create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = coalesce(new.email, ''),
           email_verified_at = null
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_auth_user_email_change();

-- Usuarios que existieran antes de esta migración.
insert into public.profiles (id, email)
select u.id, coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;
