/**
 * Checkout del carrito (/api/checkout) con promociones: Stripe simulado y
 * precios desde PostgreSQL real. Comprueba que se cobra el importe con
 * descuento calculado en el servidor y que queda en los metadatos.
 */
import type Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { products } from '~/data/products';

const created: Stripe.Checkout.SessionCreateParams[] = [];
vi.mock('~/lib/stripe/stripe.server', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          created.push(params);
          return { id: 'cs_test_cart', url: 'https://checkout.stripe.com/c/pay/cs_test_cart' };
        },
      },
    },
  }),
}));

let db: TestDb;
let failPricing = false;
vi.mock('~/lib/pricing.server', async (orig) => {
  const mod = await orig<typeof import('~/lib/pricing.server')>();
  return {
    ...mod,
    loadPricing: (opts: Parameters<typeof mod.loadPricing>[0] = {}) => {
      if (failPricing) return Promise.reject(new Error('db down'));
      return mod.loadPricing({ ...opts, rpc: db.rpc });
    },
  };
});

const { action } = await import('~/routes/api.checkout');

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

const victoria = products.find((p) => p.slug === 'victoria')!;
const silver85 = victoria.variants.find((v) => v.finishId === 'silver-metallic' && v.width === 8.5)!;
const black9 = victoria.variants.find((v) => v.finishId === 'black-metallic' && v.width === 9)!;

async function checkout(lines: { variantId: string; quantity: number }[]) {
  const body = new FormData();
  body.set('cart', JSON.stringify(lines));
  const request = new Request('http://localhost/api/checkout', { method: 'POST', body });
  try {
    return (await action({ request, params: {}, context: {} } as never)) as Response;
  } catch (res) {
    return res as Response;
  }
}

describe('checkout del carrito con promociones', () => {
  it('sin promoción cobra el precio vigente', async () => {
    created.length = 0;
    const res = await checkout([{ variantId: black9.id, quantity: 4 }]);
    expect(res.status).toBe(303);
    const [item] = created[0].line_items!;
    expect(item).toMatchObject({ quantity: 4, price_data: { unit_amount: 30000 } });
    expect(created[0].metadata?.cart).toBe(`${black9.id}:4:30000`);
  });

  it('Black Friday −20 % solo en Silver: descuenta esa línea y no la otra', async () => {
    const now = Date.now();
    await db.rpc('pricing_admin_save_promotion', {
      p_id: null,
      p_fields: {
        name: 'BF', badge: 'Black Friday', percent_off: 20,
        starts_at: new Date(now - 3_600_000).toISOString(),
        ends_at: new Date(now + 3_600_000).toISOString(),
        product_slugs: [], finish_ids: ['silver-metallic'], active: true,
      },
    });
    created.length = 0;
    const res = await checkout([
      { variantId: silver85.id, quantity: 4 },
      { variantId: black9.id, quantity: 1 },
    ]);
    expect(res.status).toBe(303);
    const [silver, black] = created[0].line_items!;
    expect(silver.price_data).toMatchObject({ unit_amount: 22000 });
    expect(silver.price_data?.product_data?.name).toContain('Black Friday −20%');
    expect(silver.price_data?.product_data?.metadata).toMatchObject({ basePriceCents: '27500' });
    expect(black.price_data).toMatchObject({ unit_amount: 30000 });
    expect(created[0].metadata?.cart).toBe(`${silver85.id}:4:22000,${black9.id}:1:30000`);
  });

  it('el precio del navegador se ignora', async () => {
    created.length = 0;
    await checkout([{ variantId: black9.id, quantity: 1, unitPriceCents: 1 } as never]);
    expect(created[0].line_items![0].price_data?.unit_amount).toBe(30000);
  });

  it('si no se pueden leer los precios, no se cobra', async () => {
    failPricing = true;
    created.length = 0;
    const res = await checkout([{ variantId: black9.id, quantity: 1 }]);
    failPricing = false;
    expect(res.headers.get('Location')).toBe('/cart?error=price');
    expect(created).toHaveLength(0);
  });
});
