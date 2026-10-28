/**
 * Procesamiento de eventos de Stripe ya verificados (firma comprobada en la
 * ruta). Enruta por `metadata.flow` de la sesión de Checkout:
 *   · presale_deposit  → señal de la reserva
 *   · presale_balance  → pago del importe restante
 *   · direct_sale      → compra directa
 *   · (sin flow)       → carrito anterior (comportamiento de siempre)
 *
 * Garantías:
 *   · Idempotencia por evento (`stripe_events`): un evento ya procesado no se
 *     vuelve a aplicar; uno que falló se reintenta cuando Stripe lo reenvía.
 *   · Idempotencia por transición en SQL: duplicados o eventos fuera de orden
 *     devuelven `already` sin efectos.
 *   · Si algo falla se lanza el error → la ruta responde 500 → Stripe
 *     reintenta (hasta 3 días) con backoff.
 */
import type Stripe from 'stripe';
import { dispatchNotifications } from '~/lib/email/outbox.server';
import { processCartSession, sessionAddresses } from '~/lib/orders/cart-webhook.server';
import { adminRpc, isPresaleDbConfigured, isSchemaMissingError, type Rpc } from './rpc.server';

export interface WebhookDeps {
  /** null cuando Supabase no está configurado (solo carrito sin BD). */
  rpc: Rpc | null;
  dispatch: (ids: string[]) => Promise<unknown>;
  cartSession: (session: Stripe.Checkout.Session) => Promise<void>;
}

export function defaultWebhookDeps(): WebhookDeps {
  return {
    rpc: isPresaleDbConfigured() ? adminRpc : null,
    dispatch: (ids) => dispatchNotifications({ ids }),
    cartSession: processCartSession,
  };
}

export type WebhookOutcome =
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: string }
  | { status: 'processed'; flow: string; result?: string };

const PRESALE_FLOWS = new Set(['presale_deposit', 'presale_balance', 'direct_sale']);

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}

function customerOf(session: Stripe.Checkout.Session) {
  const c = session.customer_details;
  return {
    email: c?.email ?? session.customer_email ?? null,
    name: c?.name ?? null,
    phone: c?.phone ?? null,
  };
}

interface ConfirmResult {
  result: string;
  notification_ids?: string[];
}

async function confirmSession(rpc: Rpc, flow: string, session: Stripe.Checkout.Session): Promise<ConfirmResult> {
  const paid = session.payment_status === 'paid';
  const common = {
    p_session_id: session.id,
    p_payment_intent_id: paymentIntentId(session),
    p_amount_cents: session.amount_total,
    p_currency: session.currency,
    p_paid: paid,
    p_customer: customerOf(session),
    p_livemode: session.livemode,
  };
  if (flow === 'presale_deposit') {
    return rpc<ConfirmResult>('presale_confirm_deposit', common);
  }
  const { shipping, billing } = sessionAddresses(session);
  const withAddresses = { ...common, p_shipping: shipping, p_billing: billing };
  if (flow === 'presale_balance') {
    return rpc<ConfirmResult>('presale_confirm_balance', withAddresses);
  }
  return rpc<ConfirmResult>('presale_confirm_direct', withAddresses);
}

async function route(event: Stripe.Event, deps: WebhookDeps): Promise<{ outcome: WebhookOutcome; notificationIds: string[] }> {
  const none: string[] = [];
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      const flow = session.metadata?.flow;
      if (!flow || !PRESALE_FLOWS.has(flow)) {
        await deps.cartSession(session);
        return { outcome: { status: 'processed', flow: 'cart' }, notificationIds: none };
      }
      if (!deps.rpc) throw new Error('Evento de preventa recibido sin Supabase configurado');
      const res = await confirmSession(deps.rpc, flow, session);
      if (res.result === 'not_found') {
        console.warn('[stripe][webhook] sesión de preventa desconocida', session.id, flow);
        return { outcome: { status: 'ignored', reason: 'unknown_session' }, notificationIds: none };
      }
      if (res.result === 'needs_review' || res.result === 'duplicate_payment') {
        console.warn('[stripe][webhook] pago que requiere revisión', session.id, flow, res);
      }
      return {
        outcome: { status: 'processed', flow, result: res.result },
        notificationIds: res.notification_ids ?? none,
      };
    }

    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const flow = session.metadata?.flow;
      if (!flow || !PRESALE_FLOWS.has(flow)) {
        return { outcome: { status: 'ignored', reason: 'not_presale' }, notificationIds: none };
      }
      if (!deps.rpc) throw new Error('Evento de preventa recibido sin Supabase configurado');
      const reason = event.type === 'checkout.session.expired' ? 'checkout_expired' : 'payment_failed';
      const res = await deps.rpc<{ ok: boolean; released?: boolean }>('presale_checkout_closed', {
        p_session_id: session.id,
        p_reason: reason,
      });
      return { outcome: { status: 'processed', flow, result: res.released ? 'released' : 'noop' }, notificationIds: none };
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (!pi || !deps.rpc) return { outcome: { status: 'ignored', reason: 'no_payment_intent' }, notificationIds: none };
      const res = await deps.rpc<ConfirmResult>('presale_record_refund', {
        p_payment_intent_id: pi,
        p_refunded_total_cents: charge.amount_refunded,
      });
      return {
        outcome: { status: 'processed', flow: 'refund', result: res.result },
        notificationIds: res.notification_ids ?? none,
      };
    }

    default:
      return { outcome: { status: 'ignored', reason: 'unhandled_type' }, notificationIds: none };
  }
}

/** Marca de inicio del evento; `false` si ya estaba procesado. */
async function beginEvent(rpc: Rpc | null, event: Stripe.Event): Promise<{ process: boolean; tracked: boolean }> {
  if (!rpc) return { process: true, tracked: false };
  try {
    const res = await rpc<{ process: boolean }>('stripe_event_begin', {
      p_event_id: event.id,
      p_type: event.type,
      p_livemode: event.livemode,
      p_created_at: new Date(event.created * 1000).toISOString(),
    });
    return { process: res.process, tracked: true };
  } catch (err) {
    // Migraciones aún sin aplicar: se procesa sin registro (flujo de carrito).
    if (isSchemaMissingError(err)) return { process: true, tracked: false };
    throw err;
  }
}

export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps = defaultWebhookDeps()): Promise<WebhookOutcome> {
  const begin = await beginEvent(deps.rpc, event);
  if (!begin.process) return { status: 'duplicate' };

  let outcome: WebhookOutcome;
  let notificationIds: string[] = [];
  try {
    ({ outcome, notificationIds } = await route(event, deps));
  } catch (err) {
    if (begin.tracked && deps.rpc) {
      await deps.rpc('stripe_event_finish', {
        p_event_id: event.id,
        p_status: 'failed',
        p_error: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    }
    throw err;
  }

  if (begin.tracked && deps.rpc) {
    await deps.rpc('stripe_event_finish', {
      p_event_id: event.id,
      p_status: outcome.status === 'ignored' ? 'ignored' : 'processed',
    });
  }

  // Correos: ya están en la cola (misma transacción). Se intenta el envío
  // inmediato; si falla, el despachador programado los reintenta.
  if (notificationIds.length > 0) {
    try {
      await deps.dispatch(notificationIds);
    } catch (err) {
      console.error('[stripe][webhook] envío inmediato de correos fallido (se reintentará)', err);
    }
  }

  return outcome;
}
