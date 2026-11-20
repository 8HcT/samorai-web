/**
 * Stock de punta a punta contra PostgreSQL real: el botón de pagar aparta el
 * stock, una segunda compra de las mismas unidades se rechaza, el cobro lo
 * descuenta una sola vez y la caducidad del pago lo libera.
 * Stripe, el registro del pedido y los correos están simulados.
 */
import type Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { products } from '~/data/products';

const created: Stripe.Checkout.SessionCreateParams[] = [];
let stripeFails = false;
vi.mock('~/lib/stripe/stripe.server', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          if (stripeFails) throw new Error('stripe down');
          created.push(params);
          return { id: `cs_test_stock_${created.length}`, url: 'https://checkout.stripe.com/c/pay/cs_test_stock' };
        },
      },
    },
  }),
}));

let db: TestDb;
vi.mock('~/lib/pricing.server', async (orig) => {
  const mod = await orig<typeof import('~/lib/pricing.server')>();
  return { ...mod, loadPricing: (opts: Parameters<typeof mod.loadPricing>[0] = {}) => mod.loadPricing({ ...opts, rpc: db.rpc }) };
});
vi.mock('~/lib/catalog.server', async (orig) => {
  const mod = await orig<typeof import('~/lib/catalog.server')>();
  return {
    ...mod,
    reserveStock: (k: string, i: Parameters<typeof mod.reserveStock>[1], e: Date) => mod.reserveStock(k, i, e, db.rpc),
    commitStock: (k: string, i: Parameters<typeof mod.commitStock>[1]) => mod.commitStock(k, i, db.rpc),
    extendStock: (k: string, u: Date) => mod.extendStock(k, u, db.rpc),
    releaseStock: (k: string) => mod.releaseStock(k, db.rpc),
  };
});
const recorded: { reviewReason?: string | null }[] = [];
vi.mock('~/lib/orders/orders.server', async (orig) => {
  const mod = await orig<typeof import('~/lib/orders/orders.server')>();
  return {
    ...mod,
    recordOrder: async (order: { reviewReason?: string | null }) => {
      recorded.push(order);
      return { isNew: false, orderId: null };
    },
  };
});

const { action } = await import('~/routes/api.checkout');
const { processCartSession } = await import('~/lib/orders/cart-webhook.server');
const { handleStripeEvent, defaultWebhookDeps } = await import('~/lib/presale/webhook.server');

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});
beforeEach(() => {
  stripeFails = false;
});

const victoria = products.find((p) => p.slug === 'victoria')!;
const V = victoria.variants.find((v) => v.finishId === 'black-metallic' && v.width === 9)!;
const stockOf = async () => (await db.query('select stock from catalog_variants where variant_id = $1', [V.id]))[0]?.stock;
const heldRows = async () => db.query(`select hold_key, quantity, status from stock_holds where variant_id = $1`, [V.id]);

async function checkout(quantity: number) {
  const body = new FormData();
  body.set('cart', JSON.stringify([{ variantId: V.id, quantity }]));
  body.set('locale', 'es');
  const request = new Request('http://localhost/api/checkout', { method: 'POST', body });
  try {
    return (await action({ request, params: {}, context: {} } as never)) as Response;
  } catch (res) {
    return res as Response;
  }
}

function paidSession(params: Stripe.Checkout.SessionCreateParams, id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 120000,
    currency: 'eur',
    payment_intent: `pi_${id}`,
    metadata: params.metadata,
    customer_details: { email: 'stock@example.com', name: 'Cliente Stock', phone: '+34600000000', address: null },
    collected_information: {
      shipping_details: { name: 'Cliente Stock', address: { line1: 'Gran Vía 1', line2: null, postal_code: '28013', city: 'Madrid', state: 'M', country: 'ES' } },
    },
    ...extra,
  } as unknown as Stripe.Checkout.Session;
}

describe('stock en la compra', () => {
  it('sin control de stock: se paga como siempre, sin caducidad corta', async () => {
    const res = await checkout(4);
    expect(res.status).toBe(303);
    const params = created.at(-1)!;
    expect(params.expires_at).toBeUndefined();
    expect(params.metadata?.stock_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('con stock: aparta, caduca a los 31 min y una segunda compra de las mismas unidades vuelve al carrito', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V.id, p_stock: 4, p_active: true });
    const before = Date.now();
    const first = await checkout(4);
    expect(first.status).toBe(303);
    const params = created.at(-1)!;
    expect(params.expires_at! * 1000).toBeGreaterThan(before + 30 * 60_000);
    expect(params.expires_at! * 1000).toBeLessThan(before + 32 * 60_000);
    expect(await heldRows()).toEqual([{ hold_key: params.metadata!.stock_key, quantity: 4, status: 'held' }]);

    const second = await checkout(1);
    expect(second.headers.get('Location')).toBe('/cart?error=stock');

    // El cliente paga: se descuenta una sola vez aunque Stripe repita el aviso.
    const s = paidSession(params, 'cs_test_stock_paid');
    await processCartSession(s);
    await processCartSession(s);
    expect(await stockOf()).toBe(0);
    expect(recorded.at(-1)?.reviewReason ?? null).toBeNull();
  });

  it('si Stripe falla al crear el pago, lo apartado se libera al momento', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V.id, p_stock: 4, p_active: true });
    stripeFails = true;
    const res = await checkout(4);
    expect(res.headers.get('Location')).toBe('/cart?error=stripe');
    expect((await heldRows()).filter((r: any) => r.status === 'held')).toHaveLength(0);
  });

  it('pago caducado: el webhook libera el stock para otros clientes', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V.id, p_stock: 4, p_active: true });
    expect((await checkout(4)).status).toBe(303);
    const params = created.at(-1)!;
    expect((await checkout(4)).headers.get('Location')).toBe('/cart?error=stock');

    const outcome = await handleStripeEvent(
      {
        id: `evt_expired_${Date.now()}`,
        object: 'event',
        type: 'checkout.session.expired',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: { object: { id: 'cs_test_expired', object: 'checkout.session', status: 'expired', payment_status: 'unpaid', metadata: params.metadata } },
      } as unknown as Stripe.Event,
      { ...defaultWebhookDeps(), rpc: db.rpc, dispatch: async () => {} }
    );
    expect(outcome).toMatchObject({ status: 'processed', flow: 'cart', result: 'stock_released' });
    expect((await checkout(4)).status).toBe(303);
  });

  it('referencia desactivada: no se llega a Stripe', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V.id, p_stock: 10, p_active: false });
    const n = created.length;
    expect((await checkout(1)).headers.get('Location')).toBe('/cart?error=stock');
    expect(created.length).toBe(n);
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V.id, p_stock: 10, p_active: true });
  });

  it('cobro sin stock suficiente (caso raro): el pedido queda «Requiere revisión»', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V.id, p_stock: 2, p_active: true });
    await processCartSession(
      paidSession({ metadata: { cart: `${V.id}:4:30000`, stock_key: 'abcdef12-sin-reserva', locale: 'es' } } as never, 'cs_test_oversold')
    );
    expect(await stockOf()).toBe(0);
    expect(recorded.at(-1)?.reviewReason).toMatch(/Sin stock suficiente al cobrar/);
  });
});
