/**
 * Webhook de Stripe de extremo a extremo contra PostgreSQL real:
 * firma, idempotencia por evento, enrutado por flujo, eventos duplicados,
 * fuera de orden, caducidad de sesión, pago diferido fallido y reembolsos.
 */
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { T0, createBatch, daysAfter, fakeSessionId, launch, minutesAfter, reserve, reservationPayload, VARIANT_300 } from '../helpers/fixtures';
import { handleStripeEvent, type WebhookDeps } from '~/lib/presale/webhook.server';

let db: TestDb;
let deps: WebhookDeps;
const dispatched: string[][] = [];
const cartSessions: string[] = [];

beforeAll(async () => {
  db = await createTestDb();
  deps = {
    rpc: db.rpc,
    dispatch: async (ids) => {
      dispatched.push(ids);
    },
    cartSession: async (s) => {
      cartSessions.push(s.id);
    },
  };
});

afterAll(async () => {
  await db?.close();
});

let evtSeq = 0;
function event(type: string, object: Record<string, unknown>, id = `evt_test_${Date.now()}_${evtSeq++}`): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2026-06-24.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

function session(id: string, flow: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    object: 'checkout.session',
    livemode: false,
    payment_status: 'paid',
    amount_total: 5000,
    currency: 'eur',
    payment_intent: `pi_${id}`,
    metadata: flow ? { flow } : {},
    customer_details: { email: 'webhook@example.com', name: 'Cliente Webhook', phone: '+34600111222', address: null },
    collected_information: {
      shipping_details: {
        name: 'Cliente Webhook',
        address: { line1: 'Gran Vía 1', line2: null, postal_code: '28013', city: 'Madrid', state: 'M', country: 'ES' },
      },
    },
    ...extra,
  };
}

async function openDeposit(batchId: string, email = `wh${Math.random().toString(36).slice(2)}@example.com`) {
  const hold = await reserve(db.rpc, batchId, { email, now: new Date() });
  expect(hold.ok).toBe(true);
  const id = fakeSessionId();
  const attached = await db.rpc<any>('presale_attach_checkout', {
    p_allocation_id: hold.allocation_id,
    p_session_id: id,
    p_amount_cents: 5000,
    p_expires_at: minutesAfter(new Date(), 31),
  });
  expect(attached.ok).toBe(true);
  return { hold, sessionId: id };
}

describe('enrutado y efectos', () => {
  it('checkout.session.completed de la señal confirma la reserva y despacha sus correos', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold, sessionId } = await openDeposit(batchId);
    const outcome = await handleStripeEvent(event('checkout.session.completed', session(sessionId, 'presale_deposit')), deps);
    expect(outcome).toMatchObject({ status: 'processed', flow: 'presale_deposit', result: 'confirmed' });

    const [r] = await db.query('select status, deposit_status, phone from reservations where id = $1', [hold.reservation_id]);
    expect(r).toEqual({ status: 'confirmed', deposit_status: 'paid', phone: '+34600111222' });
    expect(dispatched.at(-1)).toHaveLength(3);
  });

  it('el mismo evento entregado dos veces se procesa una sola vez', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { sessionId } = await openDeposit(batchId);
    const e = event('checkout.session.completed', session(sessionId, 'presale_deposit'));
    expect((await handleStripeEvent(e, deps)).status).toBe('processed');
    expect(await handleStripeEvent(e, deps)).toEqual({ status: 'duplicate' });
    const [row] = await db.query('select status, attempts from stripe_events where id = $1', [e.id]);
    expect(row).toEqual({ status: 'processed', attempts: 1 });
  });

  it('eventos distintos del mismo pago (reenvío manual) no duplican efectos', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold, sessionId } = await openDeposit(batchId);
    await handleStripeEvent(event('checkout.session.completed', session(sessionId, 'presale_deposit')), deps);
    const again = await handleStripeEvent(event('checkout.session.completed', session(sessionId, 'presale_deposit')), deps);
    expect(again).toMatchObject({ status: 'processed', result: 'already' });
    const [{ n }] = await db.query('select count(*)::int as n from email_notifications where reservation_id = $1', [hold.reservation_id]);
    expect(n).toBe(3);
  });

  it('checkout.session.expired libera la plaza; un completed fuera de orden después no la resucita', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 }, { now: T0 });
    const { hold, sessionId } = await openDeposit(batchId);
    await handleStripeEvent(event('checkout.session.expired', session(sessionId, 'presale_deposit', { payment_status: 'unpaid' })), deps);
    const [a] = await db.query('select status, release_reason from inventory_allocations where id = $1', [hold.allocation_id]);
    expect(a).toEqual({ status: 'released', release_reason: 'checkout_expired' });

    const late = await handleStripeEvent(
      event('checkout.session.completed', session(sessionId, 'presale_deposit', { payment_status: 'unpaid' })),
      deps
    );
    expect(late).toMatchObject({ status: 'processed', result: 'already' });
  });

  it('pago diferido: completed(unpaid) → en proceso; async_payment_failed → liberado', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold, sessionId } = await openDeposit(batchId);
    const p = await handleStripeEvent(event('checkout.session.completed', session(sessionId, 'presale_deposit', { payment_status: 'unpaid' })), deps);
    expect(p).toMatchObject({ result: 'processing' });
    await handleStripeEvent(event('checkout.session.async_payment_failed', session(sessionId, 'presale_deposit', { payment_status: 'unpaid' })), deps);
    const [r] = await db.query('select status from reservations where id = $1', [hold.reservation_id]);
    expect(r.status).toBe('abandoned');
  });

  it('pago diferido que acaba cobrándose: async_payment_succeeded confirma', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold, sessionId } = await openDeposit(batchId);
    await handleStripeEvent(event('checkout.session.completed', session(sessionId, 'presale_deposit', { payment_status: 'unpaid' })), deps);
    const ok = await handleStripeEvent(event('checkout.session.async_payment_succeeded', session(sessionId, 'presale_deposit')), deps);
    expect(ok).toMatchObject({ result: 'confirmed' });
    const [r] = await db.query('select status from reservations where id = $1', [hold.reservation_id]);
    expect(r.status).toBe('confirmed');
  });

  it('pago final: crea el pedido con la dirección de envío de Stripe', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold, sessionId } = await openDeposit(batchId);
    await handleStripeEvent(event('checkout.session.completed', session(sessionId, 'presale_deposit')), deps);
    await launch(db.rpc, batchId, new Date());
    const balanceSession = fakeSessionId();
    const { quote } = reservationPayload(VARIANT_300, 1, 'x@example.com');
    await db.rpc('presale_attach_balance_checkout', {
      p_reservation_id: hold.reservation_id,
      p_session_id: balanceSession,
      p_amount_cents: quote.balanceCents,
      p_expires_at: daysAfter(new Date(), 1),
    });
    const res = await handleStripeEvent(
      event('checkout.session.completed', session(balanceSession, 'presale_balance', { amount_total: quote.balanceCents })),
      deps
    );
    expect(res).toMatchObject({ status: 'processed', flow: 'presale_balance', result: 'completed' });
    const [o] = await db.query('select kind, shipping_address, customer_phone, amount_paid_cents from orders where reservation_id = $1', [hold.reservation_id]);
    expect(o).toMatchObject({ kind: 'presale', customer_phone: '+34600111222', amount_paid_cents: 114000 });
    expect(o.shipping_address).toMatchObject({ city: 'Madrid', postalCode: '28013', country: 'ES' });
  });

  it('charge.refunded sincroniza devoluciones hechas desde el dashboard de Stripe', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold, sessionId } = await openDeposit(batchId);
    await handleStripeEvent(event('checkout.session.completed', session(sessionId, 'presale_deposit')), deps);
    await db.rpc('presale_admin_cancel_reservation', { p_reservation_id: hold.reservation_id, p_reason: 'test', p_refund_deposit: true });
    const res = await handleStripeEvent(
      event('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: `pi_${sessionId}`, amount_refunded: 5000, refunded: true }),
      deps
    );
    expect(res).toMatchObject({ flow: 'refund', result: 'recorded' });
    const [r] = await db.query('select deposit_status from reservations where id = $1', [hold.reservation_id]);
    expect(r.deposit_status).toBe('refunded');
  });

  it('las sesiones del carrito de siempre siguen su flujo', async () => {
    const id = fakeSessionId();
    const res = await handleStripeEvent(event('checkout.session.completed', session(id, null)), deps);
    expect(res).toMatchObject({ status: 'processed', flow: 'cart' });
    expect(cartSessions).toContain(id);
  });

  it('un error de proceso marca el evento como fallido y se reintenta en la siguiente entrega', async () => {
    const failing: WebhookDeps = { ...deps, cartSession: vi.fn().mockRejectedValueOnce(new Error('caída temporal')).mockResolvedValue(undefined) };
    const e = event('checkout.session.completed', session(fakeSessionId(), null));
    await expect(handleStripeEvent(e, failing)).rejects.toThrow('caída temporal');
    const [row] = await db.query('select status, last_error from stripe_events where id = $1', [e.id]);
    expect(row).toEqual({ status: 'failed', last_error: 'caída temporal' });
    expect((await handleStripeEvent(e, failing)).status).toBe('processed');
    const [row2] = await db.query('select status, attempts from stripe_events where id = $1', [e.id]);
    expect(row2).toEqual({ status: 'processed', attempts: 2 });
  });

  it('tipos no gestionados quedan registrados como ignorados', async () => {
    const e = event('customer.created', { id: 'cus_1', object: 'customer' });
    expect(await handleStripeEvent(e, deps)).toMatchObject({ status: 'ignored' });
    const [row] = await db.query('select status from stripe_events where id = $1', [e.id]);
    expect(row.status).toBe('ignored');
  });
});

describe('ruta /api/stripe-webhook (verificación de firma)', () => {
  it('rechaza peticiones sin firma o con firma inválida y acepta la firma correcta', async () => {
    const { action } = await import('~/routes/api.stripe-webhook');
    const stripe = new Stripe('sk_test_dummy_for_tests');
    const payload = JSON.stringify({ id: 'evt_sig_ok', object: 'event', type: 'customer.created', created: Math.floor(Date.now() / 1000), livemode: false, data: { object: {} } });
    const call = (headers: Record<string, string>) =>
      action({ request: new Request('https://shop.example.com/api/stripe-webhook', { method: 'POST', body: payload, headers }), params: {}, context: {} } as any);

    expect((await call({})).status).toBe(400);
    expect((await call({ 'stripe-signature': 't=1,v1=deadbeef' })).status).toBe(400);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret_for_tests' });
    expect((await call({ 'stripe-signature': header })).status).toBe(200);
  });
});
