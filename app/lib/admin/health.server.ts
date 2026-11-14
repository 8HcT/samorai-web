/**
 * Estado del sistema para /admin/estado: comprueba en vivo cada pieza de la
 * que depende una venta (configuración, base de datos, precios, Stripe,
 * webhook, correos, SEO) y el resultado de la última compra de prueba.
 *
 * Nunca muestra valores de variables ni claves: solo nombres y diagnóstico.
 * Cada comprobación tiene su propio límite de tiempo y sus errores se
 * convierten en un resultado «error» (la página nunca se cae por una).
 */
import { allowIndexing, configProblems, env, isProduction } from '~/lib/env.server';
import { loadPricing } from '~/lib/pricing.server';
import { adminRpc } from '~/lib/presale/rpc.server';
import { getStripe, isStripeConfigured } from '~/lib/stripe/stripe.server';
import { isStripePermissionError, stripeErrorMessage } from '~/lib/stripe/errors';
import { getSupabaseAdmin, isSupabaseConfigured } from '~/lib/supabase/server';
import { recipients } from '~/lib/email/email.server';
import { sitemapPaths } from '~/lib/sitemap';
import { supportedLocales } from '~/i18n/config';
import { TEST_ORDER_CODE_PREFIX, isTestOrder } from '~/lib/orders/test-purchase';

export type HealthStatus = 'ok' | 'warning' | 'error' | 'info';

export interface HealthCheck {
  id: string;
  title: string;
  status: HealthStatus;
  detail: string;
  /** Qué hacer para arreglarlo. */
  hint?: string;
  /** Fecha relevante (se muestra en hora local del navegador). */
  at?: string | null;
}

const TIMEOUT_MS = 8000;
const DAY = 86_400_000;

function withTimeout<T>(promise: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`sin respuesta en ${ms / 1000} s`)), ms)),
  ]);
}

function errorText(err: unknown): string {
  return stripeErrorMessage(err) ?? (err instanceof Error ? err.message : String(err));
}

async function safe(id: string, title: string, fn: () => Promise<HealthCheck>): Promise<HealthCheck> {
  try {
    return await withTimeout(fn());
  } catch (err) {
    return { id, title, status: 'error', detail: errorText(err) };
  }
}

const db = () => getSupabaseAdmin();
const stripeIsLive = () => /^(sk|rk)_live_/.test(env('STRIPE_SECRET_KEY') ?? '');

function checkConfig(): HealthCheck {
  const problems = configProblems();
  return problems.length === 0
    ? { id: 'config', title: 'Variables de entorno', status: 'ok', detail: 'Todas las imprescindibles están definidas y con el formato correcto.' }
    : {
        id: 'config',
        title: 'Variables de entorno',
        status: 'error',
        detail: problems.join(' · '),
        hint: 'Vercel → Settings → Environment Variables (Production) y vuelve a desplegar.',
      };
}

function checkDomain(request: Request): HealthCheck {
  const site = env('SITE_URL')?.replace(/\/$/, '');
  const here = new URL(request.url).origin;
  if (!site) {
    return {
      id: 'domain',
      title: 'Dominio (SITE_URL)',
      status: 'error',
      detail: 'Falta SITE_URL: los enlaces de los correos y la vuelta desde Stripe usarían la URL interna de Vercel.',
      hint: 'SITE_URL=https://www.samoraiwheels.com',
    };
  }
  if (isProduction() && site !== here) {
    return {
      id: 'domain',
      title: 'Dominio (SITE_URL)',
      status: 'warning',
      detail: `Estás en ${here} pero SITE_URL es ${site}. Los enlaces y el canonical apuntan a SITE_URL.`,
    };
  }
  return { id: 'domain', title: 'Dominio (SITE_URL)', status: 'ok', detail: `Enlaces, canonical y sitemap usan ${site}.` };
}

function checkIndexing(): HealthCheck {
  const urls = sitemapPaths().length * supportedLocales.length;
  if (!allowIndexing()) {
    return {
      id: 'seo',
      title: 'Indexación en Google',
      status: 'info',
      detail: 'Despliegue de previsualización: no indexable (correcto fuera de producción).',
    };
  }
  return {
    id: 'seo',
    title: 'Indexación en Google',
    status: 'ok',
    detail: `Web indexable. robots.txt publica el sitemap con ${urls} URLs (castellano e inglés, con hreflang).`,
    hint: 'Comprueba la cobertura en Google Search Console.',
  };
}

async function checkDatabase(): Promise<HealthCheck> {
  if (!isSupabaseConfigured()) {
    return { id: 'db', title: 'Base de datos', status: 'error', detail: 'Supabase sin configurar (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' };
  }
  const t0 = Date.now();
  const res = await db().from('orders').select('id', { count: 'exact', head: true });
  if (res.error) throw res.error;
  return { id: 'db', title: 'Base de datos', status: 'ok', detail: `Responde en ${Date.now() - t0} ms · ${res.count ?? 0} pedidos guardados.` };
}

async function checkPricing(now: Date): Promise<HealthCheck> {
  // rpc inyectada: lectura directa, sin la caché de las páginas.
  const snapshot = await loadPricing({ strict: true, rpc: adminRpc, now });
  const active = snapshot.promotions.filter((p) => new Date(p.startsAt) <= now && new Date(p.endsAt) > now);
  const stored = Object.keys(snapshot.prices).length;
  const promo = active.length
    ? `Promoción activa: ${active.map((p) => `${p.badge} −${p.percentOff} %`).join(', ')}.`
    : 'Sin promociones activas ahora.';
  return {
    id: 'pricing',
    title: 'Precios y promociones',
    status: 'ok',
    detail: `${stored} precios guardados en /admin/precios. ${promo}`,
    at: active[0]?.endsAt ?? null,
  };
}

async function checkStripeKey(): Promise<HealthCheck> {
  const title = 'Stripe · clave de pagos';
  if (!isStripeConfigured()) return { id: 'stripe', title, status: 'error', detail: 'Falta STRIPE_SECRET_KEY: no se puede cobrar.' };
  const live = stripeIsLive();
  try {
    await getStripe().checkout.sessions.list({ limit: 1 });
  } catch (err) {
    return {
      id: 'stripe',
      title,
      status: 'error',
      detail: errorText(err),
      hint: isStripePermissionError(err) ? 'La clave restringida necesita «Checkout Sessions: Write».' : undefined,
    };
  }
  if (isProduction() && !live) {
    return { id: 'stripe', title, status: 'error', detail: 'La clave es de TEST en producción: los pagos no son reales.' };
  }
  return { id: 'stripe', title, status: 'ok', detail: `Clave ${live ? 'LIVE (cobros reales)' : 'de test'} válida; puede crear pagos.` };
}

async function checkStripeRefunds(): Promise<HealthCheck> {
  const title = 'Stripe · devoluciones desde el panel';
  if (!isStripeConfigured()) return { id: 'refunds', title, status: 'warning', detail: 'Sin clave de Stripe.' };
  try {
    await getStripe().refunds.list({ limit: 1 });
    return { id: 'refunds', title, status: 'ok', detail: 'El botón «Devolver» de los pedidos funciona.' };
  } catch (err) {
    if (!isStripePermissionError(err)) throw err;
    return {
      id: 'refunds',
      title,
      status: 'warning',
      detail: 'La clave no tiene permiso de devoluciones: habría que devolver desde el dashboard de Stripe.',
      hint: 'Stripe → Developers → API keys → edita la clave restringida → «Refunds: Write».',
    };
  }
}

async function checkWebhook(now: Date): Promise<HealthCheck> {
  const title = 'Stripe · avisos de pago (webhook)';
  if (!env('STRIPE_WEBHOOK_SECRET')) {
    return { id: 'webhook', title, status: 'error', detail: 'Falta STRIPE_WEBHOOK_SECRET: los pagos no se registrarían como pedidos.' };
  }
  const [last, failed, stuck] = await Promise.all([
    db().from('stripe_events').select('id, type, livemode, status, received_at').order('received_at', { ascending: false }).limit(1).maybeSingle(),
    db()
      .from('stripe_events')
      .select('id, type, last_error, received_at')
      .eq('status', 'failed')
      .gte('received_at', new Date(now.getTime() - 30 * DAY).toISOString())
      .order('received_at', { ascending: false }),
    db()
      .from('stripe_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('received_at', new Date(now.getTime() - 15 * 60_000).toISOString()),
  ]);
  for (const r of [last, failed, stuck]) if (r.error) throw r.error;

  if (!last.data) {
    return {
      id: 'webhook',
      title,
      status: 'warning',
      detail: 'Todavía no ha llegado ningún aviso de Stripe.',
      hint: 'Haz la compra de prueba de abajo: si el pedido aparece, el webhook funciona.',
    };
  }
  const failedRows = (failed.data ?? []) as { type: string; last_error: string | null }[];
  if (failedRows.length > 0) {
    return {
      id: 'webhook',
      title,
      status: 'error',
      detail: `${failedRows.length} aviso(s) fallaron en los últimos 30 días (Stripe los reintenta). Último error: ${failedRows[0].last_error ?? '—'}`,
      at: last.data.received_at,
    };
  }
  if ((stuck.count ?? 0) > 0) {
    return { id: 'webhook', title, status: 'warning', detail: `${stuck.count} aviso(s) a medio procesar desde hace más de 15 minutos.`, at: last.data.received_at };
  }
  if (Boolean(last.data.livemode) !== stripeIsLive()) {
    return {
      id: 'webhook',
      title,
      status: 'warning',
      detail: `El último aviso llegó en modo ${last.data.livemode ? 'LIVE' : 'test'}, pero la clave es ${stripeIsLive() ? 'LIVE' : 'de test'}.`,
      hint: 'Revisa que el webhook y su signing secret sean del mismo modo que la clave.',
      at: last.data.received_at,
    };
  }
  return { id: 'webhook', title, status: 'ok', detail: `Último aviso recibido y procesado (${last.data.type}).`, at: last.data.received_at };
}

async function checkEmails(now: Date): Promise<HealthCheck> {
  const title = 'Correos (Resend)';
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM')) {
    return { id: 'email', title, status: 'error', detail: 'Faltan RESEND_API_KEY o EMAIL_FROM: no sale ningún correo.' };
  }
  if (/resend\.dev/i.test(env('EMAIL_FROM') ?? '')) {
    return { id: 'email', title, status: 'error', detail: 'EMAIL_FROM usa resend.dev: solo llega a tu propia dirección.', hint: 'Usa un remitente de samoraiwheels.com.' };
  }
  const since = new Date(now.getTime() - 30 * DAY).toISOString();
  const [logs, outbox] = await Promise.all([
    db().from('audit_events').select('data, created_at').eq('action', 'order_emails').gte('created_at', since).order('created_at', { ascending: false }).limit(200),
    db().from('email_notifications').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  if (logs.error) throw logs.error;
  const rows = (logs.data ?? []) as { data: { customer?: string; shop?: string }; created_at: string }[];
  const failures = rows.filter((r) => r.data?.customer === 'failed' || r.data?.shop === 'failed').length;
  const shopMissing = recipients('SHOP_ORDER_EMAIL').length === 0;
  if (failures > 0 || (outbox.count ?? 0) > 0) {
    return {
      id: 'email',
      title,
      status: 'error',
      detail: `${failures} pedido(s) con algún correo fallido en 30 días${outbox.count ? ` · ${outbox.count} en la cola con error` : ''}.`,
      hint: 'Abre el pedido: el historial dice qué correo falló y por qué.',
      at: rows[0]?.created_at ?? null,
    };
  }
  if (shopMissing) {
    return { id: 'email', title, status: 'warning', detail: 'Falta SHOP_ORDER_EMAIL: la tienda no recibe el aviso de cada venta.' };
  }
  return {
    id: 'email',
    title,
    status: 'ok',
    detail: rows.length > 0 ? 'Los últimos correos de pedido salieron bien.' : 'Configurado. Aún no hay correos de pedido en los últimos 30 días.',
    at: rows[0]?.created_at ?? null,
  };
}

async function checkOrders(now: Date): Promise<HealthCheck> {
  const title = 'Pedidos que requieren atención';
  const res = await db()
    .from('orders')
    .select('id, code, stripe_session_id, status, review_reason, created_at')
    .in('status', ['paid', 'in_production', 'ready_to_ship'])
    .order('created_at', { ascending: true })
    .limit(500);
  if (res.error) throw res.error;
  const open = (
    (res.data ?? []) as { code: string | null; stripe_session_id: string; status: string; review_reason: string | null; created_at: string }[]
  ).filter((o) => !isTestOrder(o));
  const review = open.filter((o) => o.review_reason);
  const stale = open.filter((o) => o.status === 'paid' && now.getTime() - new Date(o.created_at).getTime() > 7 * DAY);
  if (review.length > 0) {
    return { id: 'orders', title, status: 'error', detail: `${review.length} pedido(s) marcados para revisión.`, hint: 'Pedidos → busca el aviso ⚠.' };
  }
  if (stale.length > 0) {
    return {
      id: 'orders',
      title,
      status: 'warning',
      detail: `${stale.length} pedido(s) pagados hace más de 7 días siguen sin pasar a fabricación o envío.`,
      at: stale[0].created_at,
    };
  }
  return {
    id: 'orders',
    title,
    status: 'ok',
    detail: open.length > 0 ? `${open.length} pedido(s) en preparación, todos al día.` : 'No hay pedidos pendientes de enviar.',
  };
}

export interface TestPurchaseSummary {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  amountCents: number;
  refundedCents: number;
  emails: { customer?: string; shop?: string; errors?: string[] } | null;
}

/** Última compra de prueba (o la de una sesión concreta de Stripe). */
export async function loadTestPurchase(sessionId?: string | null): Promise<TestPurchaseSummary | null> {
  let query = db()
    .from('orders')
    .select('id, code, status, created_at, amount_total_cents, amount_paid_cents, refunded_cents')
    .like('code', `${TEST_ORDER_CODE_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  if (sessionId) query = query.eq('stripe_session_id', sessionId);
  const res = await query.maybeSingle();
  if (res.error) throw res.error;
  const o = res.data as {
    id: string; code: string; status: string; created_at: string;
    amount_total_cents: number | null; amount_paid_cents: number | null; refunded_cents: number;
  } | null;
  if (!o) return null;
  const log = await db()
    .from('audit_events')
    .select('data')
    .eq('entity_type', 'order')
    .eq('entity_id', o.id)
    .eq('action', 'order_emails')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    createdAt: o.created_at,
    amountCents: o.amount_paid_cents ?? o.amount_total_cents ?? 0,
    refundedCents: o.refunded_cents,
    emails: (log.data?.data as TestPurchaseSummary['emails']) ?? null,
  };
}

export interface TestProgress {
  sessionId: string;
  /** null = no se pudo consultar Stripe. */
  paid: boolean | null;
  stripeError: string | null;
  order: TestPurchaseSummary | null;
}

/** Seguimiento de una compra de prueba recién pagada (vuelta desde Stripe). */
export async function loadTestProgress(sessionId: string): Promise<TestProgress> {
  let paid: boolean | null = null;
  let stripeError: string | null = null;
  try {
    const session = await withTimeout(getStripe().checkout.sessions.retrieve(sessionId));
    paid = session.payment_status === 'paid';
  } catch (err) {
    stripeError = errorText(err);
  }
  const order = await loadTestPurchase(sessionId).catch(() => null);
  return { sessionId, paid, stripeError, order };
}

function checkTestPurchase(test: TestPurchaseSummary | null, now: Date): HealthCheck {
  const title = 'Compra de prueba';
  if (!test) {
    return {
      id: 'test',
      title,
      status: 'info',
      detail: 'Aún no se ha hecho ninguna. Es la forma de comprobar todo el circuito con un pago real de 1 €.',
    };
  }
  const emailsOk = test.emails?.customer === 'sent' && test.emails?.shop === 'sent';
  const refunded = test.refundedCents >= test.amountCents && test.amountCents > 0;
  if (test.emails && !emailsOk) {
    return {
      id: 'test',
      title,
      status: 'error',
      detail: `La última prueba (${test.code}) se cobró y se guardó, pero algún correo no salió: ${(test.emails.errors ?? []).join(' · ') || 'ver el pedido'}.`,
      at: test.createdAt,
    };
  }
  if (!refunded) {
    return { id: 'test', title, status: 'warning', detail: `Todo llegó bien en ${test.code}, pero falta devolver el euro.`, at: test.createdAt };
  }
  const old = now.getTime() - new Date(test.createdAt).getTime() > 30 * DAY;
  return {
    id: 'test',
    title,
    status: old ? 'info' : 'ok',
    detail: old
      ? `La última (${test.code}) salió bien, pero hace más de 30 días. Conviene repetirla antes de una campaña.`
      : `La última (${test.code}) salió bien: cobro, pedido, correos y devolución.`,
    at: test.createdAt,
  };
}

export async function runHealthChecks(request: Request, now: Date = new Date()) {
  const testPurchase = await loadTestPurchase().catch(() => null);
  const checks = await Promise.all([
    Promise.resolve(checkConfig()),
    Promise.resolve(checkDomain(request)),
    safe('db', 'Base de datos', checkDatabase),
    safe('pricing', 'Precios y promociones', () => checkPricing(now)),
    safe('stripe', 'Stripe · clave de pagos', checkStripeKey),
    safe('refunds', 'Stripe · devoluciones desde el panel', checkStripeRefunds),
    safe('webhook', 'Stripe · avisos de pago (webhook)', () => checkWebhook(now)),
    safe('email', 'Correos (Resend)', () => checkEmails(now)),
    safe('orders', 'Pedidos que requieren atención', () => checkOrders(now)),
    Promise.resolve(checkTestPurchase(testPurchase, now)),
    Promise.resolve(checkIndexing()),
  ]);
  return { checks, testPurchase };
}

/** Resumen para el panel principal. */
export function healthSummary(checks: HealthCheck[]) {
  return {
    errors: checks.filter((c) => c.status === 'error').length,
    warnings: checks.filter((c) => c.status === 'warning').length,
  };
}
