import { getVariantById } from '~/data/products';
import type { Product, WheelVariant } from '~/types/product';

/**
 * Carrito persistido en localStorage. Guardamos lo mínimo
 * (`variantId` + `quantity`) y resolvemos el resto desde los datos de
 * producto en tiempo de render, de modo que precios/specs siempre
 * reflejan la fuente de verdad.
 */
export interface CartLine {
  variantId: string;
  quantity: number;
}

/** Línea resuelta con su producto y variante para pintar/calcular. */
export interface ResolvedCartLine extends CartLine {
  product: Product;
  variant: WheelVariant;
  /** Precio unitario en céntimos, o null si la variante no tiene precio. */
  unitPriceCents: number | null;
  /** Subtotal de la línea en céntimos, o null si falta precio. */
  lineTotalCents: number | null;
}

export const CART_STORAGE_KEY = 'samorai_cart_v1';

export function readCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is CartLine =>
          l && typeof l.variantId === 'string' && typeof l.quantity === 'number'
      )
      .map((l) => ({ variantId: l.variantId, quantity: Math.max(1, Math.floor(l.quantity)) }));
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* almacenamiento no disponible — ignorar */
  }
}

/** Resuelve líneas a producto/variante/precio; descarta las inválidas. */
export function resolveCart(lines: CartLine[]): ResolvedCartLine[] {
  const resolved: ResolvedCartLine[] = [];
  for (const line of lines) {
    const found = getVariantById(line.variantId);
    if (!found) continue;
    const unit = found.variant.priceCents ?? null;
    resolved.push({
      ...line,
      product: found.product,
      variant: found.variant,
      unitPriceCents: unit,
      lineTotalCents: unit == null ? null : unit * line.quantity,
    });
  }
  return resolved;
}

/** Suma total en céntimos; null si alguna línea no tiene precio. */
export function cartTotalCents(resolved: ResolvedCartLine[]): number | null {
  if (resolved.length === 0) return 0;
  let total = 0;
  for (const line of resolved) {
    if (line.lineTotalCents == null) return null;
    total += line.lineTotalCents;
  }
  return total;
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}
