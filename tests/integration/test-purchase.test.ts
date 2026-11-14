/**
 * Compra de prueba de 1 € y devolución de pedidos del carrito.
 *  · Solo un administrador, desde la propia web, puede comprar la referencia
 *    de prueba; nunca mezclada con llantas reales.
 *  · El webhook la registra como prueba (código PRUEBA-…) y guarda el detalle
 *    de las referencias reales.
 *  · «Devolver» en un pedido del carrito devuelve de verdad el pago de Stripe.
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { products } from '~/data/products';
import { TEST_PRODUCT_NAME, TEST_VARIANT_ID } from '~/lib/orders/test-purchase';
import type { OrderRecord } from '~/lib/orders/orders.server';

// ── Stripe simulado ───────────────────────────────────────────────────────
const created: Stripe.Checkout.SessionCreateParams[] = [];
vi.mock('~/lib/stripe/stripe.server', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          created.push(params);
          return { id: 'cs_test_prueba', url: 'https://checkout.stripe.com/c/pay/cs_test_prueba' };
        },
      },
    },
  }),
  isStripeConfigured: () => true,
  stripeDashboardPaymentUrl: (pi: string) => `https://dashboard.stripe.com/test/payments/${pi}`,
}));

// ── Sesión de administrador simulada ──────────────────────────────────────
let isAdmin = false;
vi.mock('~/lib/auth/session.server', () => ({
  requireAdmin: async () => {
    if (!isAdmin) throw new Response(null, { status: 302, headers: { Location: '/cuenta/acceso' } });
    return { user: { id: 'admin-1', email: 'admin@example.com' }, auth: { headers: new Headers() } };
  },
}));

// ── Base de datos simulada (forma mínima del cliente de Supabase) ─────────
const tables: Record<string, Record<string, unknown>[]> = { orders: [], payments: [] };
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), b),
    in: (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), b),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return b;
}
vi.mock('~/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({ from: query }),
  isSupabaseConfigured: () => true,
}));

const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];
vi.mock('~/lib/presale/rpc.server', async (orig) => ({
  ...(await orig<typeof import('~/lib/presale/rpc.server')>()),
  adminRpc: async (fn: string, params: Record<string, unknown> = {}) => {
    rpcCalls.push({ fn, params });
    return { result: 'legacy_order' };
  },
  isPresaleDbConfigured: () => true,
}));

// ── Registro del pedido y correos (se capturan, no se escriben) ───────────
const recorded: OrderRecord[] = [];
vi.mock('~/lib/orders/orders.server', () => ({
  recordOrder: async (order: OrderRecord) => {
    recorded.push(order);
    return { isNew: true, orderId: 'order-1' };
  },
}));
vi.mock('~/lib/email/email.server', async (orig) => ({
  ...(await orig<typeof import('~/lib/email/email.server')>()),
  sendOrderEmails: async () => ({ customer: 'sent', shop: 'sent', errors: [] }),
}));

const { action } = await import('~/routes/api.checkout');
const { processCartSession } = await import('~/lib/orders/cart-webhook.server');
const { refundOrder } = await import('~/lib/presale/admin.server');

const victoria = products.find((p) => p.slug === 'victoria')!;
const black9 = victoria.variants.find((v) => v.finishId === 'black-metallic' && v.width === 9)!;

async function checkout(lines: { variantId: string; quantity: number }[], headers: Record<string, string> = { Origin: 'http://localhost' }) {
  const body = new FormData();
  body.set('cart', JSON.stringify(lines));
  const request = new Request('http://localhost/api/checkout', { method: 'POST', body, headers });
  try {
    return (await action({ request, params: {}, context: {} } as never)) as Response;
  } catch (res) {
    return res as Response;
  }
}

beforeEach(() => {
  created.length = 0;
  recorded.length = 0;
  rpcCalls.length = 0;
  isAdmin = false;
});

describe('checkout de la compra de prueba', () => {
  it('sin sesión de administrador no llega a Stripe: va al login', async () => {
    const res = await checkout([{ variantId: TEST_VARIANT_ID, quantity: 1 }]);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/cuenta/acceso');
    expect(created).toHaveLength(0);
  });

  it('desde otra web (sin Origin propio) se rechaza', async () => {
    isAdmin = true;
    const res = await checkout([{ variantId: TEST_VARIANT_ID, quantity: 1 }], { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(created).toHaveLength(0);
  });

  it('no se puede mezclar con llantas reales', async () => {
    isAdmin = true;
    const res = await checkout([
      { variantId: TEST_VARIANT_ID, quantity: 1 },
      { variantId: black9.id, quantity: 4 },
    ]);
    expect(res.headers.get('Location')).toBe('/admin/estado?prueba=error');
    expect(created).toHaveLength(0);
  });

  it('un administrador paga 1 € por el mismo camino que un cliente', async () => {
    isAdmin = true;
    const res = await checkout([{ variantId: TEST_VARIANT_ID, quantity: 5 }]);
    expect(res.status).toBe(303);
    expect(created).toHaveLength(1);
    const params = created[0];
    expect(params.line_items).toEqual([expect.objectContaining({ quantity: 1, price_data: expect.objectContaining({ unit_amount: 100 }) })]);
    expect(params.metadata).toMatchObject({ test: '1', cart: `${TEST_VARIANT_ID}:1:100` });
    expect(params.customer_email).toBe('admin@example.com');
    expect(params.success_url).toContain('/admin/estado?prueba={CHECKOUT_SESSION_ID}');
    expect(params.shipping_address_collection?.allowed_countries).toContain('ES');
  });
});

function session(metadata: Record<string, string>): Stripe.Checkout.Session {
  return {
    id: 'cs_live_a1b2c3d4e5f6g7h8',
    payment_status: 'paid',
    amount_total: 100,
    amount_subtotal: 100,
    currency: 'eur',
    payment_intent: 'pi_123',
    metadata,
    customer_details: { email: 'admin@example.com', name: 'Admin', phone: '+34600000000', address: null },
  } as unknown as Stripe.Checkout.Session;
}

describe('webhook: registro de la compra', () => {
  it('la compra de prueba queda marcada y deja constancia de los correos', async () => {
    await processCartSession(session({ cart: `${TEST_VARIANT_ID}:1:100`, test: '1' }));
    expect(recorded[0]).toMatchObject({ isTest: true, lines: [{ variantId: TEST_VARIANT_ID, productName: TEST_PRODUCT_NAME, unitPriceCents: 100 }] });
    expect(rpcCalls).toContainEqual({
      fn: 'presale_audit',
      params: expect.objectContaining({
        p_entity_id: 'order-1',
        p_action: 'order_emails',
        p_data: expect.objectContaining({ customer: 'sent', shop: 'sent', test: true }),
      }),
    });
  });

  it('una compra real guarda acabado, medida y ET de cada línea (y el idioma del cliente)', async () => {
    await processCartSession(session({ cart: `${black9.id}:4:30000`, locale: 'en' }));
    expect(recorded[0].isTest).toBe(false);
    expect(recorded[0].locale).toBe('en');
    expect(recorded[0].lines[0]).toMatchObject({
      variantId: black9.id, quantity: 4, unitPriceCents: 30000,
      finishId: 'black-metallic', finishName: 'Black Metallic', diameter: 18, width: 9, et: black9.et,
    });
  });
});

describe('devolución de un pedido del carrito', () => {
  function fakeStripe() {
    const refunds: Stripe.RefundCreateParams[] = [];
    const client = {
      refunds: {
        create: async (params: Stripe.RefundCreateParams) => {
          refunds.push(params);
          return { id: 're_1', status: 'succeeded', amount: params.amount } as Stripe.Refund;
        },
      },
    } as unknown as Stripe;
    return { client, refunds };
  }

  it('devuelve el pago del propio pedido (no tiene filas en payments)', async () => {
    tables.orders = [{ id: 'o1', stripe_payment_intent_id: 'pi_cart', amount_total_cents: 120000, amount_paid_cents: 120000, refunded_cents: 0 }];
    tables.payments = [];
    const { client, refunds } = fakeStripe();
    const res = await refundOrder('o1', client);
    expect(res).toEqual({ ok: true, refundedCents: 120000 });
    expect(refunds[0]).toMatchObject({ payment_intent: 'pi_cart', amount: 120000 });
    expect(rpcCalls).toContainEqual({ fn: 'presale_record_refund', params: { p_payment_intent_id: 'pi_cart', p_refunded_total_cents: 120000 } });
  });

  it('si ya está devuelto no vuelve a devolver ni dice que lo ha hecho', async () => {
    tables.orders = [{ id: 'o2', stripe_payment_intent_id: 'pi_done', amount_total_cents: 100, amount_paid_cents: 100, refunded_cents: 100 }];
    const { client, refunds } = fakeStripe();
    expect(await refundOrder('o2', client)).toEqual({ ok: false, reason: 'nothing_to_refund' });
    expect(refunds).toHaveLength(0);
  });

  it('un pedido sin pago de Stripe no se puede devolver', async () => {
    tables.orders = [{ id: 'o3', stripe_payment_intent_id: null, amount_total_cents: 100, amount_paid_cents: 100, refunded_cents: 0 }];
    const { client } = fakeStripe();
    expect(await refundOrder('o3', client)).toEqual({ ok: false, reason: 'no_payment' });
  });
});
