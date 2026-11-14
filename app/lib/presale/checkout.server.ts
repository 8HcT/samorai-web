/**
 * Flujos de pago con Stripe Checkout para la preventa (solo servidor).
 *
 * Patrón común: 1) retención atómica en PostgreSQL → 2) sesión de Stripe con
 * el importe calculado en el servidor → 3) se adjunta la sesión a la
 * retención. Si algo falla entre medias, la plaza se libera y la sesión se
 * expira. El pago SOLO se da por bueno cuando llega el webhook firmado.
 * Nunca se guardan datos de tarjeta: Stripe aloja el formulario de pago.
 */
import type Stripe from 'stripe';
import type { Product } from '~/types/product';
import { CURRENCY, formatPrice } from '~/lib/money';
import { formatEt, formatSize } from '~/lib/format';
import { siteUrl } from '~/lib/env.server';
import { getStripe } from '~/lib/stripe/stripe.server';
import { shippingCheckoutParams } from '~/lib/stripe/checkout-options.server';
import { getSupabaseAdmin } from '~/lib/supabase/server';
import { buildDirectLine, buildReservationPayload, resolveConfiguration, type ReservationContact } from './catalog';
import {
  CHECKOUT_SESSION_MINUTES,
  HOLD_MINUTES,
  isAccessLinkSecretConfigured,
  presalePaymentsAllowed,
} from './config.server';
import { checkoutCancelLink, reservationLink } from './access.server';
import { getProductOffer } from './offers.server';
import { adminRpc, type Rpc } from './rpc.server';

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string; available?: number; max?: number };

export interface CheckoutDeps {
  rpc: Rpc;
  stripe: () => Stripe;
  now: () => Date;
}

const defaultDeps: CheckoutDeps = { rpc: adminRpc, stripe: getStripe, now: () => new Date() };

interface HoldResponse {
  ok: boolean;
  reason?: string;
  available?: number;
  max?: number;
  reservation_id?: string;
  reservation_code?: string;
  access_version?: number;
  allocation_id?: string;
  hold_expires_at?: string;
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** Libera la retención y expira la sesión si se llegó a crear. */
async function abortCheckout(deps: CheckoutDeps, allocationId: string, sessionId: string | null, reason: 'stripe_error' | 'checkout_cancelled') {
  if (sessionId) {
    try {
      await deps.stripe().checkout.sessions.expire(sessionId);
    } catch (err) {
      console.error('[presale][checkout] no se pudo expirar la sesión', sessionId, err);
    }
  }
  try {
    await deps.rpc('presale_checkout_closed', {
      p_session_id: sessionId,
      p_reason: reason,
      p_allocation_id: allocationId,
    });
  } catch (err) {
    // La retención caducará sola por tiempo; no se bloquea al cliente.
    console.error('[presale][checkout] no se pudo liberar la retención', allocationId, err);
  }
}

// ------------------------------------------------------------------
// Reserva (señal de 50 € por juego)
// ------------------------------------------------------------------

export interface ReservationCheckoutInput {
  product: Product;
  variantId: string;
  sets: number;
  contact: ReservationContact;
  acceptedTerms: boolean;
  userId: string | null;
  clientFingerprint: string | null;
}

export async function startReservationCheckout(
  input: ReservationCheckoutInput,
  deps: CheckoutDeps = defaultDeps
): Promise<CheckoutResult> {
  if (!presalePaymentsAllowed()) return { ok: false, error: 'payments_disabled' };
  if (!isAccessLinkSecretConfigured()) return { ok: false, error: 'not_configured' };

  const cfg = resolveConfiguration(input.variantId, input.product.slug);
  if (!cfg) return { ok: false, error: 'invalid_configuration' };
  if (!input.acceptedTerms) return { ok: false, error: 'terms_required' };

  const offer = await getProductOffer(input.product, deps.rpc);
  if (offer.mode !== 'presale') {
    return { ok: false, error: offer.mode === 'sold_out' ? 'insufficient_stock' : 'presale_not_open' };
  }
  const batch = offer.batch;
  if (!Number.isInteger(input.sets) || input.sets < 1 || input.sets > batch.maxSetsPerOrder) {
    return { ok: false, error: 'invalid_quantity', max: batch.maxSetsPerOrder };
  }

  const { payload, quote } = buildReservationPayload(
    cfg,
    input.sets,
    { unitsPerSet: batch.unitsPerSet, discountBps: batch.discountBps, depositPerSetCents: batch.depositCents },
    input.contact
  );

  const hold = await deps.rpc<HoldResponse>('presale_reserve_hold', {
    p_batch_id: batch.id,
    p_reservation: payload,
    p_hold_minutes: HOLD_MINUTES,
    p_client_fingerprint: input.clientFingerprint,
    p_user_id: input.userId,
  });
  if (!hold.ok || !hold.reservation_id || !hold.allocation_id) {
    return { ok: false, error: hold.reason ?? 'unavailable', available: hold.available, max: hold.max };
  }

  const base = siteUrl();
  const size = formatSize(cfg.variant.diameter, cfg.variant.width);
  const et = formatEt(cfg.variant.et);
  const expiresAt = new Date(deps.now().getTime() + CHECKOUT_SESSION_MINUTES * 60_000);
  let session: Stripe.Checkout.Session;
  try {
    session = await deps.stripe().checkout.sessions.create(
      {
        mode: 'payment',
        locale: 'es',
        submit_type: 'book',
        customer_email: input.contact.email,
        client_reference_id: hold.reservation_id,
        line_items: [
          {
            quantity: input.sets,
            price_data: {
              currency: CURRENCY,
              unit_amount: batch.depositCents,
              product_data: {
                name: `Reserva ${batch.name} · ${cfg.product.name} ${cfg.finishName}`,
                description:
                  `Señal por juego de ${batch.unitsPerSet} llantas ${size} ${et}. ` +
                  `Se descuenta del precio final (${formatPrice(quote.totalCents)} IVA incluido).`,
              },
            },
          },
        ],
        expires_at: epochSeconds(expiresAt),
        success_url: `${base}/reserva/confirmada?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: checkoutCancelLink('reservation', hold.reservation_id, base),
        automatic_tax: { enabled: false },
        custom_text: {
          submit: {
            message:
              `Pagas ahora la reserva (${formatPrice(quote.depositCents)}). El resto ` +
              `(${formatPrice(quote.balanceCents)}) se paga cuando se lance oficialmente la tirada.`,
          },
        },
        metadata: {
          flow: 'presale_deposit',
          reservation_id: hold.reservation_id,
          reservation_code: hold.reservation_code ?? '',
          allocation_id: hold.allocation_id,
          batch_id: batch.id,
        },
        payment_intent_data: {
          description: `Reserva ${hold.reservation_code} · ${cfg.product.name} ${cfg.finishName} ${size} ${et} ×${input.sets}`,
          metadata: {
            flow: 'presale_deposit',
            reservation_id: hold.reservation_id,
            reservation_code: hold.reservation_code ?? '',
          },
        },
      },
      { idempotencyKey: `presale-deposit-${hold.reservation_id}` }
    );
  } catch (err) {
    console.error('[presale][checkout] error creando la sesión de reserva', err);
    await abortCheckout(deps, hold.allocation_id, null, 'stripe_error');
    return { ok: false, error: 'stripe_error' };
  }

  const attached = await deps.rpc<{ ok: boolean; reason?: string }>('presale_attach_checkout', {
    p_allocation_id: hold.allocation_id,
    p_session_id: session.id,
    p_amount_cents: quote.depositCents,
    p_expires_at: expiresAt.toISOString(),
    p_livemode: session.livemode,
  });
  if (!attached.ok || !session.url) {
    await abortCheckout(deps, hold.allocation_id, session.id, 'stripe_error');
    return { ok: false, error: attached.reason ?? 'stripe_error' };
  }

  return { ok: true, url: session.url };
}

// ------------------------------------------------------------------
// Compra directa (venta oficial)
// ------------------------------------------------------------------

export interface DirectCheckoutInput {
  product: Product;
  variantId: string;
  sets: number;
  email: string | null;
  userId: string | null;
  clientFingerprint: string | null;
}

export async function startDirectCheckout(
  input: DirectCheckoutInput,
  deps: CheckoutDeps = defaultDeps
): Promise<CheckoutResult> {
  if (!presalePaymentsAllowed()) return { ok: false, error: 'payments_disabled' };
  if (!isAccessLinkSecretConfigured()) return { ok: false, error: 'not_configured' };

  const cfg = resolveConfiguration(input.variantId, input.product.slug);
  if (!cfg) return { ok: false, error: 'invalid_configuration' };

  const offer = await getProductOffer(input.product, deps.rpc);
  if (offer.mode !== 'direct') {
    return { ok: false, error: offer.mode === 'sold_out' ? 'insufficient_stock' : 'direct_sale_not_open' };
  }
  const batch = offer.batch;
  if (!Number.isInteger(input.sets) || input.sets < 1 || input.sets > batch.maxSetsPerOrder) {
    return { ok: false, error: 'invalid_quantity', max: batch.maxSetsPerOrder };
  }

  const { line, quote } = buildDirectLine(cfg, input.sets, batch.unitsPerSet);
  const hold = await deps.rpc<HoldResponse>('presale_direct_hold', {
    p_batch_id: batch.id,
    p_line: line,
    p_hold_minutes: HOLD_MINUTES,
    p_client_fingerprint: input.clientFingerprint,
    p_user_id: input.userId,
  });
  if (!hold.ok || !hold.allocation_id) {
    return { ok: false, error: hold.reason ?? 'unavailable', available: hold.available, max: hold.max };
  }

  const base = siteUrl();
  const size = formatSize(cfg.variant.diameter, cfg.variant.width);
  const et = formatEt(cfg.variant.et);
  const expiresAt = new Date(deps.now().getTime() + CHECKOUT_SESSION_MINUTES * 60_000);
  // Importe calculado por el servidor; el webhook comprueba el total cobrado
  // contra la instantánea.
  let session: Stripe.Checkout.Session;
  try {
    session = await deps.stripe().checkout.sessions.create(
      {
        mode: 'payment',
        locale: 'es',
        ...(input.email ? { customer_email: input.email } : {}),
        client_reference_id: hold.allocation_id,
        line_items: [
          {
            quantity: quote.units,
            price_data: {
              currency: CURRENCY,
              unit_amount: quote.unitPriceCents,
              product_data: {
                name: `${cfg.product.name} · ${cfg.finishName} · ${size} ${et}`,
                metadata: { variantId: cfg.variant.id, taxIncluded: 'true' },
              },
            },
          },
        ],
        ...shippingCheckoutParams(),
        expires_at: epochSeconds(expiresAt),
        success_url: `${base}/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: checkoutCancelLink('allocation', hold.allocation_id, base),
        automatic_tax: { enabled: false },
        metadata: {
          flow: 'direct_sale',
          allocation_id: hold.allocation_id,
          batch_id: batch.id,
          variant_id: cfg.variant.id,
          sets: String(input.sets),
        },
        payment_intent_data: {
          description: `${batch.name} · ${cfg.product.name} ${cfg.finishName} ${size} ${et} · ${input.sets} juego(s)`,
          metadata: { flow: 'direct_sale', allocation_id: hold.allocation_id },
        },
      },
      { idempotencyKey: `presale-direct-${hold.allocation_id}` }
    );
  } catch (err) {
    console.error('[presale][checkout] error creando la sesión de compra directa', err);
    await abortCheckout(deps, hold.allocation_id, null, 'stripe_error');
    return { ok: false, error: 'stripe_error' };
  }

  const attached = await deps.rpc<{ ok: boolean; reason?: string }>('presale_attach_checkout', {
    p_allocation_id: hold.allocation_id,
    p_session_id: session.id,
    p_amount_cents: quote.totalCents,
    p_expires_at: expiresAt.toISOString(),
    p_livemode: session.livemode,
  });
  if (!attached.ok || !session.url) {
    await abortCheckout(deps, hold.allocation_id, session.id, 'stripe_error');
    return { ok: false, error: attached.reason ?? 'stripe_error' };
  }

  return { ok: true, url: session.url };
}

// ------------------------------------------------------------------
// Pago del importe restante (tras el lanzamiento)
// ------------------------------------------------------------------

interface BalanceBegin {
  ok: boolean;
  reason?: string;
  reservation_id: string;
  code: string;
  email: string;
  balance_cents: number;
  balance_due_at: string;
  open_session_id: string | null;
  attempt: number;
  reservation: {
    access_version: number;
    product_name: string;
    finish_name: string;
    diameter: number;
    width: number;
    et: number;
    quantity_sets: number;
    units_per_set: number;
    subtotal_cents: number;
    discount_cents: number;
    total_cents: number;
    deposit_cents: number;
  };
}

/**
 * Caducidad de la sesión del pago restante: como mucho la fecha límite (o 31
 * minutos si falta menos: un pago empezado antes del límite puede terminarse)
 * y nunca más de 23 h (máximo de Stripe: 24 h). Redondeada al minuto para que
 * dos clics casi simultáneos produzcan la misma petición idempotente.
 */
export function balanceSessionExpiry(now: Date, dueAt: Date): Date {
  const min = now.getTime() + CHECKOUT_SESSION_MINUTES * 60_000;
  const max = now.getTime() + 23 * 3_600_000;
  const target = Math.min(max, Math.max(dueAt.getTime(), min));
  return new Date(Math.floor(target / 60_000) * 60_000);
}

export async function startBalanceCheckout(
  reservationId: string,
  deps: CheckoutDeps = defaultDeps
): Promise<CheckoutResult> {
  if (!presalePaymentsAllowed()) return { ok: false, error: 'payments_disabled' };

  const begin = await deps.rpc<BalanceBegin>('presale_balance_checkout_begin', { p_reservation_id: reservationId });
  if (!begin.ok) return { ok: false, error: begin.reason ?? 'not_payable' };

  // Reutiliza una sesión abierta (segunda pestaña, doble clic…).
  if (begin.open_session_id) {
    try {
      const open = await deps.stripe().checkout.sessions.retrieve(begin.open_session_id);
      if (open.status === 'open' && open.url) return { ok: true, url: open.url };
    } catch (err) {
      console.error('[presale][balance] no se pudo recuperar la sesión abierta', err);
    }
  }

  const r = begin.reservation;
  const base = siteUrl();
  const size = formatSize(Number(r.diameter), Number(r.width));
  const et = formatEt(Number(r.et));
  const expiresAt = balanceSessionExpiry(deps.now(), new Date(begin.balance_due_at));

  let session: Stripe.Checkout.Session;
  try {
    session = await deps.stripe().checkout.sessions.create(
      {
        mode: 'payment',
        locale: 'es',
        customer_email: begin.email,
        client_reference_id: reservationId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: CURRENCY,
              unit_amount: begin.balance_cents,
              product_data: {
                name: `Pago final · Reserva ${begin.code}`,
                description:
                  `${r.product_name} ${r.finish_name} ${size} ${et} · ${r.quantity_sets} juego(s) de ${r.units_per_set}. ` +
                  `Precio final ${formatPrice(r.total_cents)} (descuento preventa ${formatPrice(r.discount_cents)}) ` +
                  `− reserva pagada ${formatPrice(r.deposit_cents)}. IVA incluido.`,
              },
            },
          },
        ],
        ...shippingCheckoutParams(),
        expires_at: epochSeconds(expiresAt),
        success_url: `${base}/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: reservationLink(reservationId, r.access_version, base),
        automatic_tax: { enabled: false },
        metadata: { flow: 'presale_balance', reservation_id: reservationId, reservation_code: begin.code },
        payment_intent_data: {
          description: `Pago final reserva ${begin.code}`,
          metadata: { flow: 'presale_balance', reservation_id: reservationId, reservation_code: begin.code },
        },
      },
      { idempotencyKey: `presale-balance-${reservationId}-${begin.attempt}-${epochSeconds(expiresAt)}` }
    );
  } catch (err) {
    console.error('[presale][balance] error creando la sesión', err);
    return { ok: false, error: 'stripe_error' };
  }

  const attached = await deps.rpc<{ ok: boolean; reason?: string }>('presale_attach_balance_checkout', {
    p_reservation_id: reservationId,
    p_session_id: session.id,
    p_amount_cents: begin.balance_cents,
    p_expires_at: expiresAt.toISOString(),
    p_livemode: session.livemode,
  });
  if (!attached.ok || !session.url) {
    // La reserva dejó de admitir pagos entre medias (p. ej. caducó): la sesión
    // se expira para que nadie pueda pagarla.
    try {
      await deps.stripe().checkout.sessions.expire(session.id);
    } catch (err) {
      console.error('[presale][balance] no se pudo expirar la sesión', err);
    }
    return { ok: false, error: attached.reason ?? 'not_payable' };
  }

  return { ok: true, url: session.url };
}

// ------------------------------------------------------------------
// Checkout abandonado (página de cancelación)
// ------------------------------------------------------------------

export interface PendingCheckout {
  allocationId: string;
  status: string;
  holdExpiresAt: string | null;
  sessionId: string | null;
  reservationId: string | null;
}

export async function findPendingCheckout(kind: 'reservation' | 'allocation', id: string): Promise<PendingCheckout | null> {
  const column = kind === 'reservation' ? 'reservation_id' : 'id';
  const { data, error } = await getSupabaseAdmin()
    .from('inventory_allocations')
    .select('id, status, hold_expires_at, stripe_checkout_session_id, reservation_id')
    .eq(column, id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    allocationId: data.id,
    status: data.status,
    holdExpiresAt: data.hold_expires_at,
    sessionId: data.stripe_checkout_session_id,
    reservationId: data.reservation_id,
  };
}

/** URL de Stripe para retomar el pago, si la sesión sigue abierta. */
export async function resumeUrl(sessionId: string, deps: CheckoutDeps = defaultDeps): Promise<string | null> {
  try {
    const session = await deps.stripe().checkout.sessions.retrieve(sessionId);
    return session.status === 'open' ? session.url ?? null : null;
  } catch {
    return null;
  }
}

/**
 * El cliente renuncia al checkout: se expira la sesión en Stripe (así ya no
 * puede pagarse) y solo entonces se libera la plaza.
 */
export async function cancelPendingCheckout(
  pending: PendingCheckout,
  deps: CheckoutDeps = defaultDeps
): Promise<{ released: boolean; reason?: string }> {
  if (pending.status !== 'held') return { released: false, reason: pending.status };
  if (pending.sessionId) {
    try {
      const session = await deps.stripe().checkout.sessions.retrieve(pending.sessionId);
      if (session.status === 'complete') return { released: false, reason: 'already_paid' };
      if (session.status === 'open') await deps.stripe().checkout.sessions.expire(pending.sessionId);
    } catch (err) {
      console.error('[presale][cancel] no se pudo expirar la sesión', err);
      return { released: false, reason: 'stripe_error' };
    }
  }
  const res = await deps.rpc<{ ok: boolean; released?: boolean }>('presale_checkout_closed', {
    p_session_id: pending.sessionId,
    p_reason: 'checkout_cancelled',
    p_allocation_id: pending.allocationId,
  });
  return { released: Boolean(res.released) };
}
