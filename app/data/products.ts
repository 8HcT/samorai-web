import type { Product, HubRingProduct, WheelVariant } from '~/types/product';
import { unitPriceCentsForWidth } from '~/lib/pricing';

/**
 * Atributos comunes a TODAS las referencias de Victoria (una sola opción
 * disponible por ahora → se muestran como datos técnicos de solo lectura,
 * nunca como selectores). El precio depende solo del ancho, así que se
 * deriva de `unitPriceCentsForWidth(width)` — no se escribe a mano.
 */
const VIC_COMMON: Omit<
  WheelVariant,
  'id' | 'finishId' | 'color' | 'width' | 'et' | 'priceCents'
> = {
  diameter: 18,
  pcd: '5x120',
  cb: 72.6,
  technicalValue: 40,
  maxLoad: 650,
  capLogo: 'SAMORAI Logo',
  stockStatus: 'in_stock',
  priceLabel: 'IVA incluido',
  vehicleFitment: ['5×120 / CB72.6 applications'],
};

/** Construye una referencia Victoria a partir de sus atributos variables. */
function vic(
  finishId: string,
  color: WheelVariant['color'],
  width: number,
  et: number
): WheelVariant {
  const w = String(width).replace('.', '-'); // 8.5 → "8-5"
  return {
    id: `victoria-${finishId}-18x${w}-et${et}`,
    finishId,
    color,
    width,
    et,
    priceCents: unitPriceCentsForWidth(width),
    ...VIC_COMMON,
  };
}

/**
 * Rutas de imagen de un acabado, organizadas por modelo/color:
 *   public/images/products/<modelo>/<color>/<n>.jpg
 * 1 = principal · 2 = secundaria (hover del card) · 3, 4… = extras (galería).
 * Las variables técnicas (medida, ET…) NO cambian la imagen — solo modelo y color.
 */
function finishImages(model: string, finishId: string, count = 4): string[] {
  return Array.from(
    { length: count },
    (_, i) => `/images/products/${model}/${finishId}/${i + 1}.jpg`
  );
}

export const products: Product[] = [
  {
    id: 'victoria',
    slug: 'victoria',
    name: 'Victoria',
    model: 'Victoria',
    category: 'wheel',
    status: 'active',
    priceLabel: 'Desde 275 €',
    shortDescription: 'Llanta de aleación de precisión para aplicaciones 5×120. Arquitectura de cinco radios con geometría de competición.',
    description: 'La Victoria es la primera llanta comercial de SAMORAI — una declaración de lo que significa la ingeniería de precisión guiada por la pasión por el automóvil. Diseñada en torno a un PCD 5×120 con buje central de 72,6 mm, la Victoria ofrece tolerancias OEM exactas con una estética que eleva cualquier proyecto. Disponible en tres acabados: Antracita Grey, Black Metallic y Silver Metallic. Compatible con una amplia gama de vehículos 5×120 — usa anillos de centrado para bujes distintos de 72,6 mm.',
    colors: ['Anthracite Grey', 'Black Metallic', 'Silver Metallic'],
    finishes: [
      { id: 'anthracite-grey', name: 'Antracita Grey', color: 'Anthracite Grey', images: finishImages('victoria', 'anthracite-grey') },
      { id: 'black-metallic', name: 'Black Metallic', color: 'Black Metallic', images: finishImages('victoria', 'black-metallic') },
      { id: 'silver-metallic', name: 'Silver Metallic', color: 'Silver Metallic', images: finishImages('victoria', 'silver-metallic') },
    ],
    specs: {
      pcd: '5x120',
      cbBase: 72.6,
      maxLoad: 650,
      capLogo: 'SAMORAI Logo',
      material: 'Cast aluminum alloy',
      finish: 'Multi-coat powder',
    },
    imagePlaceholder: '/images/victoria-placeholder.jpg',
    featured: true,
    // Las 10 referencias fabricadas (únicas válidas). No generar combinaciones.
    variants: [
      /* — Antracita Grey (anthracite-grey) — */
      vic('anthracite-grey', 'Anthracite Grey', 8.5, 35), // 275 €
      vic('anthracite-grey', 'Anthracite Grey', 9, 35), //   300 €
      vic('anthracite-grey', 'Anthracite Grey', 9, 45), //   300 €
      vic('anthracite-grey', 'Anthracite Grey', 9.5, 45), // 300 €
      /* — Black Metallic (black-metallic) — */
      vic('black-metallic', 'Black Metallic', 8.5, 35), // 275 €
      vic('black-metallic', 'Black Metallic', 9, 35), //   300 €
      vic('black-metallic', 'Black Metallic', 9, 45), //   300 €
      vic('black-metallic', 'Black Metallic', 9.5, 45), // 300 €
      /* — Silver Metallic (silver-metallic) — sin 18x9,5 — */
      vic('silver-metallic', 'Silver Metallic', 8.5, 45), // 275 €
      vic('silver-metallic', 'Silver Metallic', 9, 35), //   300 €
    ],
  },
];

export const hubRingProduct: HubRingProduct = {
  id: 'hub-ring-samorai-001',
  slug: 'samorai-hub-rings',
  name: 'SAMORAI Custom Hub Rings',
  category: 'hub_ring',
  status: 'coming_soon',
  shortDescription: "Custom-machined hub rings to perfectly adapt SAMORAI wheels to your vehicle's center bore. Logo-engraved, precision-fitted.",
  description: 'Every SAMORAI wheel ships with a base center bore of 72.6mm. If your vehicle requires a different CB, our precision-machined hub rings eliminate vibration and ensure the wheel sits concentrically on the hub — just as it would from the factory. Select your wheel CB and vehicle CB, and we machine your hub rings to exact tolerances. Available in billet aluminum with optional SAMORAI logo engraving.',
  featured: true,
  comingSoon: true,
  options: [
    {
      id: 'hr-726-571',
      wheelCB: 72.6, vehicleCB: 57.1,
      material: 'billet_aluminum', hasLogo: true,
      quantity: 4, compatibilityNotes: '5×120 wheel to 57.1mm hub — various applications',
      priceLabel: 'Coming soon', stockStatus: 'pre_order',
    },
    {
      id: 'hr-726-651',
      wheelCB: 72.6, vehicleCB: 65.1,
      material: 'billet_aluminum', hasLogo: true,
      quantity: 4, compatibilityNotes: 'Various European applications',
      priceLabel: 'Coming soon', stockStatus: 'pre_order',
    },
    {
      id: 'hr-726-669',
      wheelCB: 72.6, vehicleCB: 66.9,
      material: 'billet_aluminum', hasLogo: true,
      quantity: 4, compatibilityNotes: 'Various Ford / Opel applications',
      priceLabel: 'Coming soon', stockStatus: 'pre_order',
    },
  ],
};

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getFeaturedProducts(): Product[] {
  return products.filter((p) => p.featured && p.status === 'active');
}

/** Localiza una variante (y su producto) por id de variante. */
export function getVariantById(
  variantId: string
): { product: Product; variant: WheelVariant } | undefined {
  for (const product of products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return undefined;
}

/* ============================================================
   Helpers del configurador
   La lógica se basa SIEMPRE en `finishId` + medidas exactas, nunca en el
   texto visible. Solo se ofrecen combinaciones que existen como referencia.
   ============================================================ */

/** Metadatos de un acabado por id (nombre visible, color del swatch). */
export function getFinish(product: Product, finishId: string) {
  return product.finishes.find((f) => f.id === finishId);
}

/** Variantes en stock de un acabado. */
export function getVariantsByFinish(
  product: Product,
  finishId: string
): WheelVariant[] {
  return product.variants.filter(
    (v) => v.finishId === finishId && v.stockStatus !== 'out_of_stock'
  );
}

/** Anchos disponibles para un acabado (ordenados asc). Ej. [8.5, 9, 9.5]. */
export function getWidthsForFinish(product: Product, finishId: string): number[] {
  const widths = new Set(
    getVariantsByFinish(product, finishId).map((v) => v.width)
  );
  return [...widths].sort((a, b) => a - b);
}

/** ET disponibles para un acabado + ancho (ordenados asc). */
export function getEtsForWidth(
  product: Product,
  finishId: string,
  width: number
): number[] {
  const ets = new Set(
    getVariantsByFinish(product, finishId)
      .filter((v) => v.width === width)
      .map((v) => v.et)
  );
  return [...ets].sort((a, b) => a - b);
}

/**
 * Encuentra la referencia EXACTA por coincidencia de atributos
 * (acabado + ancho + ET). Devuelve `undefined` si esa combinación no se
 * fabrica — nunca se debe permitir continuar sin una referencia válida.
 */
export function findExactVariant(
  product: Product,
  finishId: string,
  width: number,
  et: number
): WheelVariant | undefined {
  return product.variants.find(
    (v) =>
      v.finishId === finishId &&
      v.width === width &&
      v.et === et &&
      v.stockStatus !== 'out_of_stock'
  );
}
