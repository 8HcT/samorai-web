/**
 * Datos de prueba construidos con el catálogo REAL (app/data/products.ts) y
 * el mismo código de cálculo que usa el servidor.
 */
import { products } from '~/data/products';
import { buildDirectLine, buildReservationPayload, resolveConfiguration } from '~/lib/presale/catalog';
import type { Rpc } from '~/lib/presale/rpc.server';

export const T0 = new Date('2026-11-02T10:00:00.000Z');

export function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export function daysAfter(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

export const VICTORIA = products.find((p) => p.slug === 'victoria')!;
/** Antracita 18x9 ET35 → 300 €/llanta. */
export const VARIANT_300 = 'victoria-anthracite-grey-18x9-et35';
/** Antracita 18x8,5 ET35 → 275 €/llanta. */
export const VARIANT_275 = 'victoria-anthracite-grey-18x8-5-et35';
/** Silver 18x9 ET35 (otro acabado). */
export const VARIANT_SILVER = 'victoria-silver-metallic-18x9-et35';

export const HOLD_MINUTES = 46;

export const TERMS = {
  reservation_terms: 'Texto de prueba de condiciones de reserva.',
  cancellation_policy: 'Texto de prueba de cancelación.',
  refund_policy: 'Texto de prueba de devolución.',
  expiry_policy: 'Texto de prueba de caducidad.',
};

let batchSeq = 0;

export async function createBatch(
  rpc: Rpc,
  fields: Record<string, unknown> = {},
  opts: { open?: boolean; now?: Date } = {}
): Promise<string> {
  const created = await rpc<{ ok: boolean; batch_id: string; reason?: string }>('presale_admin_create_batch', {
    p_fields: {
      code: `run-${Date.now().toString(36)}-${batchSeq++}`,
      name: 'First Production Run',
      capacity_sets: 50,
      max_sets_per_order: 4,
      ...TERMS,
      ...fields,
    },
  });
  if (!created.ok) throw new Error(`create batch: ${created.reason}`);
  const products = await rpc<{ ok: boolean }>('presale_admin_set_batch_products', {
    p_batch_id: created.batch_id,
    p_product_slugs: ['victoria'],
  });
  if (!products.ok) throw new Error('set products');
  if (opts.open !== false) {
    const opened = await rpc<{ ok: boolean; reason?: string }>('presale_set_batch_status', {
      p_batch_id: created.batch_id,
      p_status: 'presale_open',
      p_now: opts.now ?? T0,
    });
    if (!opened.ok) throw new Error(`open presale: ${opened.reason}`);
  }
  return created.batch_id;
}

export function reservationPayload(
  variantId: string,
  sets: number,
  email: string,
  terms = { unitsPerSet: 4, discountBps: 500, depositPerSetCents: 5000 },
  extra: Partial<{ vehicleMake: string; vehicleModel: string }> = {}
) {
  const cfg = resolveConfiguration(variantId);
  if (!cfg) throw new Error(`variante desconocida ${variantId}`);
  return buildReservationPayload(cfg, sets, terms, { email, ...extra });
}

export function directLine(variantId: string, sets: number, unitsPerSet = 4) {
  const cfg = resolveConfiguration(variantId);
  if (!cfg) throw new Error(`variante desconocida ${variantId}`);
  return buildDirectLine(cfg, sets, unitsPerSet);
}

export interface HoldResult {
  ok: boolean;
  reason?: string;
  reservation_id: string;
  reservation_code: string;
  allocation_id: string;
  hold_expires_at: string;
  available?: number;
  available_after?: number;
}

export async function reserve(
  rpc: Rpc,
  batchId: string,
  opts: { variantId?: string; sets?: number; email?: string; now?: Date; fingerprint?: string | null; userId?: string | null } = {}
): Promise<HoldResult> {
  const { payload } = reservationPayload(opts.variantId ?? VARIANT_300, opts.sets ?? 1, opts.email ?? `c${Math.random().toString(36).slice(2)}@example.com`);
  return rpc<HoldResult>('presale_reserve_hold', {
    p_batch_id: batchId,
    p_reservation: payload,
    p_hold_minutes: HOLD_MINUTES,
    p_client_fingerprint: opts.fingerprint ?? null,
    p_user_id: opts.userId ?? null,
    p_now: opts.now ?? T0,
  });
}

let sessionSeq = 0;
export function fakeSessionId(prefix = 'cs_test'): string {
  return `${prefix}_${Date.now().toString(36)}${(sessionSeq++).toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Simula el checkout de la señal: sesión adjunta + webhook de pago. */
export async function reserveAndPay(
  rpc: Rpc,
  batchId: string,
  opts: { variantId?: string; sets?: number; email?: string; now?: Date } = {}
) {
  const now = opts.now ?? T0;
  const hold = await reserve(rpc, batchId, opts);
  if (!hold.ok) throw new Error(`reserve: ${hold.reason}`);
  const { quote } = reservationPayload(opts.variantId ?? VARIANT_300, opts.sets ?? 1, 'x@example.com');
  const session = fakeSessionId();
  const attached = await rpc<{ ok: boolean; reason?: string }>('presale_attach_checkout', {
    p_allocation_id: hold.allocation_id,
    p_session_id: session,
    p_amount_cents: quote.depositCents,
    p_expires_at: minutesAfter(now, 31),
    p_now: now,
  });
  if (!attached.ok) throw new Error(`attach: ${attached.reason}`);
  const confirmed = await rpc<{ result: string; status: string }>('presale_confirm_deposit', {
    p_session_id: session,
    p_payment_intent_id: `pi_${session}`,
    p_amount_cents: quote.depositCents,
    p_currency: 'eur',
    p_paid: true,
    p_customer: { name: 'Cliente Prueba' },
    p_now: minutesAfter(now, 2),
  });
  return { hold, session, confirmed, quote };
}

export async function launch(rpc: Rpc, batchId: string, now: Date) {
  const result = await rpc<{ ok: boolean; reason?: string; balance_due_at: string; reservations: number }>(
    'presale_launch_batch',
    { p_batch_id: batchId, p_now: now }
  );
  if (!result.ok) throw new Error(`launch: ${result.reason}`);
  return result;
}

export async function payBalance(
  rpc: Rpc,
  reservationId: string,
  opts: { now: Date; paidAt?: Date; amountCents?: number; expiresAt?: Date }
) {
  const begin = await rpc<{ ok: boolean; reason?: string; balance_cents: number }>('presale_balance_checkout_begin', {
    p_reservation_id: reservationId,
    p_now: opts.now,
  });
  if (!begin.ok) return { begin, session: null as string | null, confirmed: null as any };
  const session = fakeSessionId();
  const attached = await rpc<{ ok: boolean; reason?: string }>('presale_attach_balance_checkout', {
    p_reservation_id: reservationId,
    p_session_id: session,
    p_amount_cents: begin.balance_cents,
    p_expires_at: opts.expiresAt ?? minutesAfter(opts.now, 60),
    p_now: opts.now,
  });
  if (!attached.ok) throw new Error(`attach balance: ${attached.reason}`);
  const confirmed = await rpc<{ result: string; order_id?: string }>('presale_confirm_balance', {
    p_session_id: session,
    p_payment_intent_id: `pi_${session}`,
    p_amount_cents: opts.amountCents ?? begin.balance_cents,
    p_currency: 'eur',
    p_paid: true,
    p_customer: { email: 'x@example.com', name: 'Cliente Prueba', phone: '+34600000000' },
    p_shipping: { name: 'Cliente Prueba', line1: 'Calle 1', city: 'Madrid', postalCode: '28001', country: 'ES' },
    p_now: opts.paidAt ?? minutesAfter(opts.now, 1),
  });
  return { begin, session, confirmed };
}

export const ALL_VICTORIA_VARIANTS = VICTORIA.variants.map((v) => ({ variant_id: v.id, finish_id: v.finishId }));
