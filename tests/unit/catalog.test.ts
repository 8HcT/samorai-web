import { describe, expect, it } from 'vitest';
import { products } from '~/data/products';
import {
  EMPTY_CATALOG,
  finishKey,
  finishSummary,
  lineProblem,
  publicVariantState,
  variantAvailability,
  type CatalogSnapshot,
} from '~/lib/catalog';
import { toCatalogSnapshot, parseStockInput } from '~/lib/catalog.server';

const victoria = products.find((p) => p.slug === 'victoria')!;
const grey = victoria.variants.filter((v) => v.finishId === 'anthracite-grey');
const v0 = grey[0];

function snap(partial: Partial<CatalogSnapshot>): CatalogSnapshot {
  return { ...EMPTY_CATALOG, enabled: true, ...partial };
}

describe('catálogo sin configurar', () => {
  it('todo visible, comprable y sin límite (como antes)', () => {
    expect(variantAvailability(EMPTY_CATALOG, 'victoria', v0)).toEqual({ purchasable: true, available: null, reason: null, low: false });
    expect(finishSummary(EMPTY_CATALOG, victoria, 'anthracite-grey')).toEqual({ visible: true, soldOut: false, low: false, labels: [] });
  });
});

describe('stock por referencia', () => {
  it('descuenta lo apartado por otros pagos', () => {
    const cat = snap({ variants: { [v0.id]: { stock: 8, active: true, held: 4 } } });
    expect(variantAvailability(cat, 'victoria', v0)).toMatchObject({ purchasable: true, available: 4, low: true });
  });
  it('a 0 está agotada; desactivada no se puede comprar', () => {
    expect(variantAvailability(snap({ variants: { [v0.id]: { stock: 0, active: true, held: 0 } } }), 'victoria', v0)).toMatchObject({ purchasable: false, reason: 'sold_out' });
    expect(variantAvailability(snap({ variants: { [v0.id]: { stock: 20, active: false, held: 0 } } }), 'victoria', v0)).toMatchObject({ purchasable: false, reason: 'inactive' });
  });
  it('no publica el stock exacto si sobra', () => {
    const cat = snap({ variants: { [v0.id]: { stock: 200, active: true, held: 0 } } });
    expect(publicVariantState(cat, 'victoria', v0)).toEqual({ purchasable: true, reason: null, left: null, low: false });
    const few = snap({ variants: { [v0.id]: { stock: 6, active: true, held: 0 } } });
    expect(publicVariantState(few, 'victoria', v0)).toMatchObject({ left: 6, low: true });
  });
});

describe('acabado: visibilidad y etiquetas', () => {
  const allGrey = (stock: number) => Object.fromEntries(grey.map((v) => [v.id, { stock, active: true, held: 0 }]));

  it('agotado entero: etiqueta «Agotado» y sigue visible salvo que se pida ocultarlo', () => {
    const cat = snap({ variants: allGrey(0) });
    expect(finishSummary(cat, victoria, 'anthracite-grey')).toMatchObject({ visible: true, soldOut: true, labels: ['sold_out'] });
    const hide = snap({ variants: allGrey(0), finishes: { [finishKey('victoria', 'anthracite-grey')]: { visible: true, hideWhenSoldOut: true, labelCode: null } } });
    expect(finishSummary(hide, victoria, 'anthracite-grey').visible).toBe(false);
  });

  it('pocas en total: «Últimas unidades» automática (sin duplicar la manual)', () => {
    const cat = snap({ lowStockThreshold: 8, variants: { ...allGrey(0), [grey[0].id]: { stock: 4, active: true, held: 0 } } });
    expect(finishSummary(cat, victoria, 'anthracite-grey').labels).toEqual(['last_units']);
    const manual = snap({
      lowStockThreshold: 8,
      variants: { ...allGrey(0), [grey[0].id]: { stock: 4, active: true, held: 0 } },
      finishes: { [finishKey('victoria', 'anthracite-grey')]: { visible: true, hideWhenSoldOut: false, labelCode: 'last_units' } },
    });
    expect(finishSummary(manual, victoria, 'anthracite-grey').labels).toEqual(['last_units']);
  });

  it('si alguna medida no tiene control de stock, no se dice «Últimas unidades»', () => {
    const cat = snap({ lowStockThreshold: 8, variants: { [grey[0].id]: { stock: 2, active: true, held: 0 } } });
    expect(finishSummary(cat, victoria, 'anthracite-grey')).toMatchObject({ low: false, labels: [] });
  });

  it('etiqueta manual del panel, sin contradicciones con «Agotado»', () => {
    const fin = (labelCode: 'new' | 'back_in_stock') => ({ [finishKey('victoria', 'anthracite-grey')]: { visible: true, hideWhenSoldOut: false, labelCode } });
    expect(finishSummary(snap({ finishes: fin('new') }), victoria, 'anthracite-grey').labels).toEqual(['new']);
    expect(finishSummary(snap({ finishes: fin('new'), variants: allGrey(0) }), victoria, 'anthracite-grey').labels).toEqual(['new', 'sold_out']);
    expect(finishSummary(snap({ finishes: fin('back_in_stock'), variants: allGrey(0) }), victoria, 'anthracite-grey').labels).toEqual(['sold_out']);
  });

  it('oculto desde el panel, o con todas sus medidas desactivadas', () => {
    const hidden = snap({ finishes: { [finishKey('victoria', 'anthracite-grey')]: { visible: false, hideWhenSoldOut: false, labelCode: null } } });
    expect(finishSummary(hidden, victoria, 'anthracite-grey').visible).toBe(false);
    expect(variantAvailability(hidden, 'victoria', v0).reason).toBe('hidden');
    const off = snap({ variants: Object.fromEntries(grey.map((v) => [v.id, { stock: 10, active: false, held: 0 }])) });
    expect(finishSummary(off, victoria, 'anthracite-grey').visible).toBe(false);
  });
});

describe('carrito', () => {
  it('marca líneas agotadas o con más unidades de las que quedan', () => {
    expect(lineProblem({ purchasable: false, reason: 'sold_out', left: 0, low: false }, 4)).toEqual({ kind: 'unavailable', reason: 'sold_out' });
    expect(lineProblem({ purchasable: true, reason: null, left: 2, low: true }, 4)).toEqual({ kind: 'too_many', left: 2 });
    expect(lineProblem({ purchasable: true, reason: null, left: 6, low: true }, 4)).toBeNull();
    expect(lineProblem({ purchasable: true, reason: null, left: null, low: false }, 40)).toBeNull();
  });
});

describe('lectura de la base de datos y del panel', () => {
  it('convierte la respuesta y descarta etiquetas desconocidas', () => {
    const cat = toCatalogSnapshot({
      low_stock_threshold: '6',
      finishes: [{ product_slug: 'victoria', finish_id: 'black-metallic', visible: true, hide_when_sold_out: false, label_code: 'inventada' }],
      variants: [{ variant_id: v0.id, stock: 3, active: true, held: '1' }],
    });
    expect(cat.lowStockThreshold).toBe(6);
    expect(cat.finishes['victoria:black-metallic'].labelCode).toBeNull();
    expect(cat.variants[v0.id]).toEqual({ stock: 3, active: true, held: 1 });
  });
  it('stock escrito en el panel', () => {
    expect(parseStockInput('')).toBeNull();
    expect(parseStockInput(' 12 ')).toBe(12);
    expect(parseStockInput('-1')).toBeUndefined();
    expect(parseStockInput('3,5')).toBeUndefined();
  });
});
