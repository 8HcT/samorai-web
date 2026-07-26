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
