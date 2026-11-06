import { describe, expect, it } from 'vitest';
import {
  applyPercentOff,
  buildPriceBook,
  lowestPrice,
  priceVariant,
  promotionFor,
  type ActivePromotion,
  type PricingSnapshot,
} from '~/lib/pricing';
import { toPricingSnapshot } from '~/lib/pricing.server';
import { parseCartMeta } from '~/lib/orders/cart-webhook.server';
import { parsePromotionForm } from '~/lib/pricing-admin.server';
import { products, getVariantById } from '~/data/products';

const NOW = new Date('2026-11-27T12:00:00Z');
const BF: ActivePromotion = {
  id: 'bf',
  name: 'Black Friday 2026',
  badge: 'Black Friday',
  percentOff: 20,
  startsAt: '2026-11-27T00:00:00Z',
  endsAt: '2026-11-30T23:00:00Z',
  productSlugs: [],
  finishIds: [],
};
const victoria = products.find((p) => p.slug === 'victoria')!;
const v85 = victoria.variants.find((v) => v.width === 8.5)!;
const v9 = victoria.variants.find((v) => v.width === 9 && v.finishId === 'silver-metallic')!;

describe('precio con promoción', () => {
  it('−20 % sobre 275 € y 300 € → 220 € y 240 €', () => {
    expect(applyPercentOff(27500, 20)).toBe(22000);
    expect(applyPercentOff(30000, 20)).toBe(24000);
    expect(applyPercentOff(27490, 15)).toBe(23367); // redondeo al céntimo
  });

  it('sin snapshot de BD usa los precios por defecto y ninguna promoción', () => {
    expect(priceVariant({ prices: {}, promotions: [] }, 'victoria', v85, NOW)).toEqual({
      baseCents: 27500,
      finalCents: 27500,
      promotion: null,
    });
  });

  it('el precio editado en /admin sustituye al de por defecto', () => {
    const snap: PricingSnapshot = { prices: { 'victoria|8.5': 26000 }, promotions: [] };
    expect(priceVariant(snap, 'victoria', v85, NOW)?.finalCents).toBe(26000);
    expect(priceVariant(snap, 'victoria', v9, NOW)?.finalCents).toBe(30000);
  });

  it('aplica la promoción solo dentro de sus fechas', () => {
    const snap: PricingSnapshot = { prices: {}, promotions: [BF] };
    expect(priceVariant(snap, 'victoria', v85, NOW)).toMatchObject({ baseCents: 27500, finalCents: 22000, promotion: { id: 'bf', percentOff: 20 } });
    expect(priceVariant(snap, 'victoria', v85, new Date('2026-11-26T23:59:59Z'))?.promotion).toBeNull();
    expect(priceVariant(snap, 'victoria', v85, new Date('2026-11-30T23:00:00Z'))?.promotion).toBeNull(); // fin exclusivo
  });

  it('respeta el alcance por modelo y acabado', () => {
    const onlySilver = { ...BF, id: 's', finishIds: ['silver-metallic'] };
    const otherModel = { ...BF, id: 'o', productSlugs: ['otro-modelo'] };
    expect(promotionFor({ prices: {}, promotions: [onlySilver] }, 'victoria', 'silver-metallic', NOW)?.id).toBe('s');
    expect(promotionFor({ prices: {}, promotions: [onlySilver] }, 'victoria', 'black-metallic', NOW)).toBeNull();
    expect(promotionFor({ prices: {}, promotions: [otherModel] }, 'victoria', 'silver-metallic', NOW)).toBeNull();
  });

  it('si coinciden varias, gana la de mayor descuento (no se acumulan)', () => {
    const snap: PricingSnapshot = { prices: {}, promotions: [{ ...BF, id: 'small', percentOff: 10 }, BF] };
    expect(priceVariant(snap, 'victoria', v9, NOW)?.finalCents).toBe(24000);
  });

  it('price book y «desde» con el precio más bajo a pagar', () => {
    const book = buildPriceBook({ prices: {}, promotions: [{ ...BF, finishIds: ['silver-metallic'] }] }, [victoria], NOW);
    expect(Object.keys(book)).toHaveLength(victoria.variants.length);
    const from = lowestPrice(victoria.variants.map((v) => book[v.id]));
    expect(from).toMatchObject({ finalCents: 22000, baseCents: 27500 }); // Silver 8,5 con −20 %
  });

  it('convierte la fila de la BD (anchos como texto numérico)', () => {
    const snap = toPricingSnapshot({
      prices: [{ product_slug: 'victoria', width: '9.0', unit_price_cents: 31000 }],
      promotions: [{ id: 'x', name: 'n', badge: 'b', percent_off: 5, starts_at: 'a', ends_at: 'b', product_slugs: null, finish_ids: ['f'] }],
    });
    expect(snap.prices['victoria|9']).toBe(31000);
    expect(snap.promotions[0]).toMatchObject({ percentOff: 5, productSlugs: [], finishIds: ['f'] });
  });
});

describe('metadatos del carrito en Stripe', () => {
  it('lee el precio cobrado y acepta el formato antiguo sin precio', () => {
    expect(parseCartMeta('a:2:22000,b:1')).toEqual([
      { variantId: 'a', quantity: 2, unitPriceCents: 22000 },
      { variantId: 'b', quantity: 1, unitPriceCents: null },
    ]);
  });
});

describe('formulario de promoción del admin', () => {
  function form(entries: [string, string][]) {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  }
  const all = [
    ['product_slugs', 'victoria'],
    ...victoria.finishes.map((f) => ['finish_ids', f.id]),
  ] as [string, string][];

  it('Black Friday −20 % en hora de Madrid; todo marcado = toda la tienda', () => {
    const { fields, errors } = parsePromotionForm(
      form([['name', 'Black Friday 2026'], ['badge', 'Black Friday'], ['percent_off', '20'], ['starts_at', '2026-11-27T00:00'], ['ends_at', '2026-12-01T00:00'], ['active', 'on'], ...all])
    );
    expect(errors).toEqual([]);
    expect(fields).toMatchObject({
      percent_off: 20,
      starts_at: '2026-11-26T23:00:00.000Z', // 00:00 en Madrid (UTC+1)
      ends_at: '2026-11-30T23:00:00.000Z',
      product_slugs: [],
      finish_ids: [],
      active: true,
    });
  });

  it('acabados concretos y validaciones', () => {
    const ok = parsePromotionForm(
      form([['name', 'Silver'], ['percent_off', '10'], ['starts_at', '2026-11-27T00:00'], ['ends_at', '2026-11-28T00:00'], ['finish_ids', 'silver-metallic'], ['finish_ids', 'inventado']])
    );
    expect(ok.fields).toMatchObject({ badge: 'Silver', finish_ids: ['silver-metallic'], active: false });

    const bad = parsePromotionForm(form([['name', ''], ['percent_off', '95'], ['starts_at', '2026-11-28T00:00'], ['ends_at', '2026-11-27T00:00']]));
    expect(bad.errors).toHaveLength(3);
  });
});

it('las referencias del catálogo siguen resolviéndose', () => {
  expect(getVariantById(v85.id)?.variant.width).toBe(8.5);
});
