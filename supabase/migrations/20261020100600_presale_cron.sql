-- ============================================================
-- SAMORAI · Tareas programadas en Supabase (pg_cron + pg_net)
--
-- Dos tareas cada 5 minutos, ejecutadas por la base de datos (no dependen de
-- que nadie visite la web):
--   1. presale-maintenance → SQL puro: caduca retenciones y reservas, libera
--      stock, encola recordatorios y cierra preventas vencidas.
--   2. presale-dispatch    → llama por HTTPS al endpoint del servidor
--      (/api/cron/presale), que envía los correos pendientes con Resend.
--
-- REQUISITOS (una vez, desde el dashboard de Supabase):
--   · Database → Extensions → activar `pg_cron` y `pg_net`.
--   · Guardar en Vault la URL y el secreto del endpoint (ver PRESALE.md):
--       select vault.create_secret('https://www.samoraiwheels.com/api/cron/presale', 'presale_cron_url');
--       select vault.create_secret('<mismo valor que CRON_SECRET>', 'presale_cron_secret');
-- Si las extensiones no están activas, esta migración no falla: solo avisa.
-- Para (re)programar después basta con volver a ejecutar este archivo.
-- ============================================================

-- Llama al endpoint de envío con el secreto guardado en Vault.
create or replace function public.presale_trigger_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'presale_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'presale_cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'presale_trigger_dispatch: faltan los secretos presale_cron_url / presale_cron_secret en Vault';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.presale_trigger_dispatch() from public, anon, authenticated;
grant execute on function public.presale_trigger_dispatch() to service_role;

do $outer$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron no está activado: activa pg_cron y pg_net y vuelve a ejecutar esta migración';
    return;
  end if;

  perform cron.schedule(
    'presale-maintenance',
    '*/5 * * * *',
    $cmd$ select public.presale_run_maintenance(); $cmd$
  );

  if exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule(
      'presale-dispatch',
      '*/5 * * * *',
      $cmd$ select public.presale_trigger_dispatch(); $cmd$
    );
  else
    raise notice 'pg_net no está activado: el envío de correos no se programará hasta activarlo';
  end if;
end
$outer$;
