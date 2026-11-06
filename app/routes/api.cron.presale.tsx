import type { Route } from './+types/api.cron.presale';
import { timingSafeEqual } from 'node:crypto';
import { dispatchNotifications } from '~/lib/email/outbox.server';
import { cronSecret, presaleEnabled } from '~/lib/presale/config.server';
import { adminRpc, isPresaleDbConfigured } from '~/lib/presale/rpc.server';

/**
 * Tareas programadas de la preventa. Lo invoca Supabase (pg_cron + pg_net,
 * ver supabase/migrations/20261020100600_presale_cron.sql) cada 5 minutos con
 * `Authorization: Bearer <CRON_SECRET>`. También sirve para Vercel Cron o una
 * ejecución manual.
 *
 *   1. Mantenimiento (idempotente; pg_cron ya lo ejecuta en la propia BD).
 *   2. Envío de los correos pendientes con Resend.
 */
function authorized(request: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const header = request.headers.get('Authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function run(request: Request) {
  if (!authorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!presaleEnabled()) {
    return Response.json({ ok: true, skipped: 'presale_disabled' });
  }
  if (!isPresaleDbConfigured()) {
    return Response.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 });
  }
  try {
    const maintenance = await adminRpc('presale_run_maintenance');
    const emails = await dispatchNotifications({ limit: 40 });
    return Response.json({ ok: true, maintenance, emails });
  } catch (err) {
    console.error('[cron][presale] error', err);
    return Response.json({ ok: false, error: 'cron_failed' }, { status: 500 });
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}

export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
