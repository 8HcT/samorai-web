/**
 * Cifras del panel: las compras de prueba no cuentan, los ingresos son
 * netos de devoluciones, «hoy» es el día de Madrid y cada referencia se
 * nombra con su acabado, medida y ET.
 */
import { describe, expect, it } from 'vitest';
import { products } from '~/data/products';
import { computeStoreStats, describeOrderItem, itemsSummary, madridDayKey, referencePrices, type StoreItem, type StoreOrder } from '~/lib/admin/store-stats';
import { TEST_VARIANT_ID } from '~/lib/orders/test-purchase';
import type { PricingSnapshot } from '~/lib/pricing';

const victoria = products.find((p) => p.slug === 'victoria')!;
const black9 = victoria.variants.find((v) => v.finishId === 'black-metallic' && v.width === 9 && v.et === 35)!;
const silver85 = victoria.variants.find((v) => v.finishId === 'silver-metallic' && v.width === 8.5)!;

const NOW = new Date('2026-11-27T10:00:00Z');

function order(id: string, over: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id,
    code: id.toUpperCase(),
    kind: 'cart',
    status: 'paid',
    customer_name: 'Cliente',
    customer_email: 'c@example.com',
    amount_total_cents: 120000,
    amount_paid_cents: 120000,
    refunded_cents: 0,
    created_at: '2026-11-27T09:00:00Z',
    stripe_session_id: `cs_live_${id}`,
    ...over,
  };
}

const item = (order_id: string, variant_id: string, quantity: number, unit = 30000): StoreItem => ({
  order_id,
  variant_id,
  product_name: 'Victoria',
  quantity,
  unit_price_cents: unit,
});

describe('cifras de la tienda', () => {
  const orders = [
    order('a1'),
    order('a2', { status: 'shipped', created_at: '2026-11-21T09:00:00Z', amount_total_cents: 110000, amount_paid_cents: 110000 }),
    order('a3', { status: 'refunded', refunded_cents: 120000, created_at: '2026-10-01T09:00:00Z' }),
    order('t1', { code: 'PRUEBA-ABCDEFGH', amount_total_cents: 100, amount_paid_cents: 100 }),
    // Pagado con las claves de test de Stripe (puesta a punto): no es dinero real.
    order('t2', { code: null, stripe_session_id: 'cs_test_abc123', created_at: '2026-11-27T08:00:00Z' }),
  ];
  const items = [
    item('a1', black9.id, 4),
    item('a2', silver85.id, 4, 27500),
    item('a3', black9.id, 4),
    item('t1', TEST_VARIANT_ID, 1, 100),
    item('t2', black9.id, 4),
  ];
  const stats = computeStoreStats(orders, items, NOW);

  it('las compras de prueba y los pagos en modo test no cuentan en pedidos, ingresos ni unidades', () => {
    expect(stats.orders.total).toBe(3);
    expect(stats.unitsSold).toBe(8);
    expect(stats.byReference.some((r) => r.variantId === TEST_VARIANT_ID)).toBe(false);
  });

  it('ingresos netos = cobrado − devuelto', () => {
    expect(stats.netRevenueCents).toBe(120000 + 110000 + 120000 - 120000);
    expect(stats.refundedCents).toBe(120000);
    expect(stats.netRevenue30Cents).toBe(230000);
  });

  it('pedidos de hoy, 7 y 30 días; pendientes de enviar', () => {
    expect(stats.orders).toMatchObject({ today: 1, last7: 2, last30: 2, cancelled: 1 });
    expect(stats.toShip).toBe(1);
    expect(stats.pipeline).toMatchObject({ paid: 1, shipped: 1 });
  });

  it('ventas por referencia y acabado (sin pedidos devueltos)', () => {
    expect(stats.byReference.map((r) => [r.variantId, r.units])).toEqual([
      [black9.id, 4],
      [silver85.id, 4],
    ]);
    expect(stats.byReference[0].label).toBe('Victoria Black Metallic · 18x9 · ET35');
    expect(stats.byFinish).toEqual(
      expect.arrayContaining([{ label: 'Black Metallic', units: 4 }, { label: 'Silver Metallic', units: 4 }])
    );
  });

  it('últimos pedidos (con las pruebas marcadas) y última prueba', () => {
    expect(stats.recent[0].isTest || stats.recent[1].isTest).toBe(true);
    expect(stats.lastTest?.code).toBe('PRUEBA-ABCDEFGH');
    expect(stats.lastTest?.summary).toBe('1× prueba 1 €');
  });
});

describe('día de Madrid', () => {
  it('las 23:30 UTC de noviembre ya son el día siguiente en Madrid', () => {
    expect(madridDayKey(new Date('2026-11-26T23:30:00Z'))).toBe('2026-11-27');
    expect(madridDayKey(new Date('2026-11-26T22:30:00Z'))).toBe('2026-11-26');
  });
});

describe('descripción de líneas', () => {
  it('deduce acabado, medida y ET del catálogo en pedidos antiguos', () => {
    expect(describeOrderItem(item('x', black9.id, 4))).toEqual({
      title: 'Victoria · Black Metallic',
      detail: `18x9 · ET35 · ${black9.id}`,
    });
    expect(itemsSummary([item('x', black9.id, 4)])).toBe('4× Victoria Black Metallic 18x9 ET35');
  });

  it('usa lo guardado en el pedido cuando existe', () => {
    const saved = { ...item('x', black9.id, 2), finish_name: 'Negro', width: '9.0', diameter: '18.0', et: 35 };
    expect(describeOrderItem(saved).title).toBe('Victoria · Negro');
  });
});

describe('precio vigente por referencia', () => {
  it('aplica la promoción activa y conserva el precio anterior', () => {
    const snapshot: PricingSnapshot = {
      prices: {},
      promotions: [
        {
          id: 'bf', name: 'BF', badge: 'Black Friday', percentOff: 20,
          startsAt: '2026-11-27T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', productSlugs: [], finishIds: ['silver-metallic'],
        },
      ],
    };
    const list = referencePrices(snapshot, NOW);
    expect(list).toHaveLength(victoria.variants.length);
    const silver = list.find((p) => p.variantId === silver85.id)!;
    expect(silver).toMatchObject({ baseCents: 27500, finalCents: 22000, promotion: { badge: 'Black Friday', percentOff: 20 } });
    const black = list.find((p) => p.variantId === black9.id)!;
    expect(black).toMatchObject({ baseCents: 30000, finalCents: 30000, promotion: null, size: '18x9', et: 'ET35' });
  });
});
