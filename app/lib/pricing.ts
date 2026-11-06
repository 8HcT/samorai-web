/**
 * Reglas de precio de las llantas Victoria.
 *
 * El precio unitario FINAL (IVA incluido) depende EXCLUSIVAMENTE del ancho:
 *   · 8.5"  → 275 €
 *   · 9"    → 300 €
 *   · 9.5"  → 300 €
 *
 * No lo modifican el acabado, el ET, el PCD, el buje ni ninguna otra
 * especificación. Todos los importes ya incluyen IVA: NO debe añadirse
 * ningún impuesto encima. El cliente paga exactamente este importe × cantidad.
 *
 * Solo existen dos niveles de precio (275 € / 300 €), así que Stripe puede
 * reutilizar dos `price` en lugar de crear diez. Cuando el cliente facilite
 * los identificadores reales, se rellenan en STRIPE_PRICE_ID_BY_WIDTH.
 */

/** Anchos válidos actualmente (pulgadas), en formato normalizado. */
export type WheelWidth = 8.5 | 9 | 9.5;

/** Nivel de precio: importe final en céntimos de EUR (IVA incluido). */
export interface PriceTier {
  amountCents: number;
  /** ID real del `price` de Stripe. Se rellena al integrar Stripe. */
  stripePriceId?: string;
}

/** Dos niveles de precio reutilizables por ancho. */
export const PRICE_TIERS = {
  low: { amountCents: 27500, stripePriceId: undefined } as PriceTier, // 275 €
  high: { amountCents: 30000, stripePriceId: undefined } as PriceTier, // 300 €
} as const;

/** Clave del nivel de precio para un ancho ('low' = 275 €, 'high' = 300 €). */
export function priceTierKeyForWidth(width: number): 'low' | 'high' {
  return width === 8.5 ? 'low' : 'high';
}

/** Ancho → nivel de precio. El precio depende solo del ancho. */
export function priceTierForWidth(width: number): PriceTier {
  return PRICE_TIERS[priceTierKeyForWidth(width)];
}

/** Precio unitario final (céntimos, IVA incluido) para un ancho dado. */
export function unitPriceCentsForWidth(width: number): number {
  return priceTierForWidth(width).amountCents;
}

/** Todos los importes ya incluyen IVA: no se añade impuesto adicional. */
export const TAX_INCLUDED = true as const;

/* ────────────────────────────────────────────────────────────────────────
 * Precios editables desde /admin y promociones (Black Friday, etc.)
 *
 * El servidor carga un `PricingSnapshot` de Supabase (precio por modelo y
 * ancho + promociones vigentes). Si no hay base de datos, se usan los
 * precios por defecto de arriba y ninguna promoción. Las funciones de abajo
 * son puras (sirven en servidor y navegador) y deciden el precio final.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ActivePromotion {
  id: string;
  name: string;
  /** Texto de la etiqueta visible (p. ej. «Black Friday»). */
  badge: string;
  percentOff: number;
  startsAt: string;
  endsAt: string;
  /** Vacío = todos los modelos. */
  productSlugs: string[];
  /** Vacío = todos los acabados. */
  finishIds: string[];
}

export interface PricingSnapshot {
  /** Precio unitario final (IVA incl.) por `${slug}|${ancho}`. */
  prices: Record<string, number>;
  promotions: ActivePromotion[];
}

/** Promoción aplicada a un precio (lo que necesita la interfaz). */
export interface AppliedPromotion {
  id: string;
  badge: string;
  percentOff: number;
  endsAt: string;
}

export interface VariantPrice {
  /** Precio sin promoción (IVA incluido). */
  baseCents: number;
  /** Precio a pagar (IVA incluido). Igual a `baseCents` sin promoción. */
  finalCents: number;
  promotion: AppliedPromotion | null;
}

/** Precio por variante, listo para enviar al navegador. */
export type PriceBook = Record<string, VariantPrice>;

export function priceKey(productSlug: string, width: number): string {
  return `${productSlug}|${Number(width)}`;
}

/** Snapshot sin base de datos: precios por defecto y sin promociones. */
export const EMPTY_PRICING: PricingSnapshot = { prices: {}, promotions: [] };

/** Aplica un porcentaje de descuento redondeando al céntimo. */
export function applyPercentOff(cents: number, percentOff: number): number {
  return Math.round((cents * (100 - percentOff)) / 100);
}

interface PriceableVariant {
  id: string;
  finishId: string;
  width: number;
  priceCents?: number;
}

/** Mejor promoción vigente para un modelo/acabado (mayor %; no se acumulan). */
export function promotionFor(
  snapshot: PricingSnapshot,
  productSlug: string,
  finishId: string,
  now: Date = new Date()
): ActivePromotion | null {
  let best: ActivePromotion | null = null;
  const t = now.getTime();
  for (const p of snapshot.promotions) {
    if (new Date(p.startsAt).getTime() > t || new Date(p.endsAt).getTime() <= t) continue;
    if (p.productSlugs.length > 0 && !p.productSlugs.includes(productSlug)) continue;
    if (p.finishIds.length > 0 && !p.finishIds.includes(finishId)) continue;
    if (!best || p.percentOff > best.percentOff) best = p;
  }
  return best;
}

/**
 * Precio de una referencia: precio editado en /admin si existe; si no, el
 * precio por defecto de los datos de producto. `null` si no tiene precio.
 */
export function priceVariant(
  snapshot: PricingSnapshot,
  productSlug: string,
  variant: PriceableVariant,
  now: Date = new Date()
): VariantPrice | null {
  const baseCents = snapshot.prices[priceKey(productSlug, variant.width)] ?? variant.priceCents;
  if (baseCents == null) return null;
  const promo = promotionFor(snapshot, productSlug, variant.finishId, now);
  if (!promo) return { baseCents, finalCents: baseCents, promotion: null };
  return {
    baseCents,
    finalCents: applyPercentOff(baseCents, promo.percentOff),
    promotion: { id: promo.id, badge: promo.badge, percentOff: promo.percentOff, endsAt: promo.endsAt },
  };
}

/** Tabla variante → precio para uno o varios productos. */
export function buildPriceBook(
  snapshot: PricingSnapshot,
  products: { slug: string; variants: PriceableVariant[] }[],
  now: Date = new Date()
): PriceBook {
  const book: PriceBook = {};
  for (const product of products) {
    for (const v of product.variants) {
      const price = priceVariant(snapshot, product.slug, v, now);
      if (price) book[v.id] = price;
    }
  }
  return book;
}

/** El precio más bajo (a pagar) de un conjunto, con su precio sin descuento. */
export function lowestPrice(prices: (VariantPrice | undefined)[]): VariantPrice | null {
  let best: VariantPrice | null = null;
  for (const p of prices) {
    if (p && (!best || p.finalCents < best.finalCents)) best = p;
  }
  return best;
}
