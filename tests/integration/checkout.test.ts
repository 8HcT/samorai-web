/**
 * Flujos de checkout del servidor contra PostgreSQL real, con un Stripe
 * simulado que registra las peticiones (no se llama a la API real):
 * importes y metadatos enviados a Stripe, liberación de la plaza si Stripe
 * falla, reutilización de sesiones abiertas y validaciones de entrada.
 */
import type Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { T0, VARIANT_300, VICTORIA, createBatch, launch } from '../helpers/fixtures';
import { startBalanceCheckout, startDirectCheckout, startReservationCheckout, type CheckoutDeps } from '~/lib/presale/checkout.server';

let db: TestDb;

interface FakeStripe {
  created: { params: Stripe.Checkout.SessionCreateParams; options: Stripe.RequestOptions | undefined }[];
  expired: string[];
  failCreate: boolean;
  sessions: Map<string, { status: string; url: string }>;
}

function fakeStripe(): FakeStripe & { client: Stripe } {
  const state: FakeStripe = { created: [], expired: [], failCreate: false, sessions: new Map() };
  let n = 0;
  const client = {
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => {
          if (state.failCreate) throw new Error('stripe down');
          state.created.push({ params, options });
          const id = `cs_test_fake${Date.now()}${n++}`;
          const url = `https://checkout.stripe.com/c/pay/${id}`;
          state.sessions.set(id, { status: 'open', url });
          return { id, url, livemode: false, status: 'open' } as unknown as Stripe.Checkout.Session;
        },
        retrieve: async (id: string) => {
          const s = state.sessions.get(id);
          return { id, url: s?.status === 'open' ? s.url : null, status: s?.status ?? 'expired' } as unknown as Stripe.Checkout.Session;
        },
        expire: async (id: string) => {
          state.expired.push(id);
          const s = state.sessions.get(id);
          if (s) s.status = 'expired';
          return { id, status: 'expired' } as unknown as Stripe.Checkout.Session;
        },
      },
    },
  } as unknown as Stripe;
  return Object.assign(state, { client });
}

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

function depsWith(stripe: Stripe): CheckoutDeps {
  return { rpc: db.rpc, stripe: () => stripe, now: () => new Date() };
}

const contact = (email: string) => ({ email, customerName: 'Prueba', vehicleMake: 'BMW', vehicleModel: 'M3' });

describe('reserva (señal)', () => {
  it('crea la sesión con el importe del servidor y la deja adjunta a la retención', async () => {
    await createBatch(db.rpc, { capacity_sets: 5 }, { now: T0 });
    const stripe = fakeStripe();
    const res = await startReservationCheckout(
      { product: VICTORIA, variantId: VARIANT_300, sets: 2, contact: contact('a@example.com'), acceptedTerms: true, userId: null, clientFingerprint: 'fp-a' },
      depsWith(stripe.client)
    );
    expect(res).toMatchObject({ ok: true });
    const { params, options } = stripe.created[0];
    expect(params.mode).toBe('payment');
    expect(params.line_items?.[0]).toMatchObject({ quantity: 2, price_data: { unit_amount: 5000, currency: 'eur' } });
    expect(params.metadata).toMatchObject({ flow: 'presale_deposit' });
    expect(params.customer_email).toBe('a@example.com');
    expect(params.cancel_url).toContain('/checkout/cancelado?k=reservation');
    expect(options?.idempotencyKey).toMatch(/^presale-deposit-/);
    const expiresIn = (params.expires_at! * 1000 - Date.now()) / 60_000;
    expect(expiresIn).toBeGreaterThan(30);

    const [r] = await db.query('select status, vehicle_make, deposit_cents, total_cents, stripe_deposit_session_id from reservations where email = $1', ['a@example.com']);
    expect(r).toMatchObject({ status: 'pending_deposit', vehicle_make: 'BMW', deposit_cents: 10000, total_cents: 228000 });
    const [p] = await db.query('select purpose, status, amount_cents from payments where stripe_checkout_session_id = $1', [r.stripe_deposit_session_id]);
    expect(p).toEqual({ purpose: 'deposit', status: 'open', amount_cents: 10000 });
  });

  it('si Stripe falla, la plaza se libera al momento', async () => {
    await createBatch(db.rpc, { capacity_sets: 1 }, { now: T0 });
    const stripe = fakeStripe();
    stripe.failCreate = true;
    const res = await startReservationCheckout(
      { product: VICTORIA, variantId: VARIANT_300, sets: 1, contact: contact('fail@example.com'), acceptedTerms: true, userId: null, clientFingerprint: null },
      depsWith(stripe.client)
    );
    expect(res).toEqual({ ok: false, error: 'stripe_error' });
    const [a] = await db.query(
      `select a.status, a.release_reason from inventory_allocations a join reservations r on r.id = a.reservation_id where r.email = $1`,
      ['fail@example.com']
    );
    expect(a).toEqual({ status: 'released', release_reason: 'stripe_error' });
  });

  it('exige aceptar las condiciones y una referencia válida', async () => {
    const stripe = fakeStripe();
    expect(await startReservationCheckout(
      { product: VICTORIA, variantId: VARIANT_300, sets: 1, contact: contact('t@example.com'), acceptedTerms: false, userId: null, clientFingerprint: null },
      depsWith(stripe.client)
    )).toEqual({ ok: false, error: 'terms_required' });
    expect(await startReservationCheckout(
      { product: VICTORIA, variantId: 'victoria-inventada', sets: 1, contact: contact('t@example.com'), acceptedTerms: true, userId: null, clientFingerprint: null },
      depsWith(stripe.client)
    )).toEqual({ ok: false, error: 'invalid_configuration' });
    expect(stripe.created).toHaveLength(0);
  });
});

describe('compra directa y pago final', () => {
  it('compra directa con precio completo y recogida de envío', async () => {
    const db2 = await createTestDb();
    try {
      const batchId = await createBatch(db2.rpc, { capacity_sets: 3 }, { now: T0 });
      await launch(db2.rpc, batchId, new Date());
      const stripe = fakeStripe();
      const res = await startDirectCheckout(
        { product: VICTORIA, variantId: VARIANT_300, sets: 1, email: null, userId: null, clientFingerprint: null },
        { rpc: db2.rpc, stripe: () => stripe.client, now: () => new Date() }
      );
      expect(res.ok).toBe(true);
      const { params } = stripe.created[0];
      expect(params.metadata).toMatchObject({ flow: 'direct_sale', sets: '1' });
      expect(params.shipping_address_collection?.allowed_countries).toContain('ES');
      const item = params.line_items![0];
      // Sin STRIPE_PRICE_ID_* en tests → importe del servidor.
      expect(item).toMatchObject({ quantity: 4, price_data: { unit_amount: 30000 } });
      const [p] = await db2.query(`select purpose, amount_cents from payments`);
      expect(p).toEqual({ purpose: 'direct', amount_cents: 120000 });
    } finally {
      await db2.close();
    }
  });

  it('pago final: reutiliza la sesión abierta en lugar de crear otra (doble clic / dos pestañas)', async () => {
    const db3 = await createTestDb();
    try {
      const batchId = await createBatch(db3.rpc, { capacity_sets: 3 }, { now: T0 });
      const stripe = fakeStripe();
      const deps = { rpc: db3.rpc, stripe: () => stripe.client, now: () => new Date() };
      const res = await startReservationCheckout(
        { product: VICTORIA, variantId: VARIANT_300, sets: 1, contact: contact('bal@example.com'), acceptedTerms: true, userId: null, clientFingerprint: null },
        deps
      );
      expect(res.ok).toBe(true);
      const [r] = await db3.query(`select id, stripe_deposit_session_id from reservations`);
      await db3.rpc('presale_confirm_deposit', {
        p_session_id: r.stripe_deposit_session_id, p_payment_intent_id: 'pi_x', p_amount_cents: 5000, p_currency: 'eur', p_paid: true,
      });
      await launch(db3.rpc, batchId, new Date());

      const first = await startBalanceCheckout(r.id, deps);
      const second = await startBalanceCheckout(r.id, deps);
      expect(first.ok && second.ok).toBe(true);
      expect(first.ok && second.ok && first.url === second.url).toBe(true);
      const balanceSessions = stripe.created.filter((c) => c.params.metadata?.flow === 'presale_balance');
      expect(balanceSessions).toHaveLength(1);
      expect(balanceSessions[0].params.line_items?.[0]).toMatchObject({ quantity: 1, price_data: { unit_amount: 109000 } });
      expect(balanceSessions[0].params.phone_number_collection).toEqual({ enabled: true });
    } finally {
      await db3.close();
    }
  });
});
