/**
 * Catálogo controlado desde /admin/catalogo: visibilidad, etiquetas y stock.
 * Lógica pura, compartida entre servidor y navegador.
 *
 * Sin configuración (o sin la migración aplicada) todo se comporta como
 * antes: visible, sin etiquetas y sin límite de stock.
 */
import type { Product, WheelVariant } from '~/types/product';

/** Etiquetas que se eligen en el panel. El texto vive en las traducciones (`t.labels`). */
export const MANUAL_LABEL_CODES = ['new', 'premium', 'best_seller', 'limited', 'exclusive', 'last_units', 'back_in_stock'] as const;
export type ManualLabelCode = (typeof MANUAL_LABEL_CODES)[number];
/** Etiquetas automáticas por stock. */
export type StockLabelCode = 'sold_out' | 'last_units';
export type LabelCode = ManualLabelCode | StockLabelCode;

export const isManualLabel = (code: unknown): code is ManualLabelCode =>
  typeof code === 'string' && (MANUAL_LABEL_CODES as readonly string[]).includes(code);

export interface CatalogFinishState {
  visible: boolean;
  hideWhenSoldOut: boolean;
  labelCode: ManualLabelCode | null;
}

export interface CatalogVariantState {
  /** Unidades en almacén; null = sin control (se vende sin límite). */
  stock: number | null;
  active: boolean;
  /** Apartado ahora mismo por pagos en curso. */
  held: number;
}

export interface CatalogSnapshot {
  /** false = sin tablas o sin base de datos: nada que controlar. */
  enabled: boolean;
  lowStockThreshold: number;
  finishes: Record<string, CatalogFinishState>;
  variants: Record<string, CatalogVariantState>;
}

export const EMPTY_CATALOG: CatalogSnapshot = { enabled: false, lowStockThreshold: 8, finishes: {}, variants: {} };

export const finishKey = (productSlug: string, finishId: string) => `${productSlug}:${finishId}`;

/** Por debajo de esta cifra se dice cuántas quedan («Quedan 4»); por encima, no se publica el stock. */
export const PUBLIC_STOCK_CAP = 24;

export type UnavailableReason = 'hidden' | 'inactive' | 'sold_out';

export interface VariantAvailability {
  purchasable: boolean;
  /** Unidades que se pueden comprar ahora; null = sin límite. */
  available: number | null;
  reason: UnavailableReason | null;
  /** Quedan pocas (umbral del panel). */
  low: boolean;
}

export function variantAvailability(cat: CatalogSnapshot, productSlug: string, variant: Pick<WheelVariant, 'id' | 'finishId'>): VariantAvailability {
  const finish = cat.finishes[finishKey(productSlug, variant.finishId)];
  if (finish && !finish.visible) return { purchasable: false, available: 0, reason: 'hidden', low: false };
  const state = cat.variants[variant.id];
  if (!state) return { purchasable: true, available: null, reason: null, low: false };
  if (!state.active) return { purchasable: false, available: 0, reason: 'inactive', low: false };
  if (state.stock == null) return { purchasable: true, available: null, reason: null, low: false };
  const available = Math.max(0, state.stock - state.held);
  if (available <= 0) return { purchasable: false, available: 0, reason: 'sold_out', low: false };
  return { purchasable: true, available, reason: null, low: cat.lowStockThreshold > 0 && available <= cat.lowStockThreshold };
}

export interface FinishSummary {
  /** Se muestra en la web (listado y ficha). */
  visible: boolean;
  /** Ninguna referencia se puede comprar porque se han agotado. */
  soldOut: boolean;
  /** Quedan pocas en total (todas sus referencias con stock controlado). */
  low: boolean;
  /** Etiquetas a mostrar, en orden: la del panel y la automática de stock. */
  labels: LabelCode[];
}

export function finishSummary(cat: CatalogSnapshot, product: Pick<Product, 'slug' | 'variants'>, finishId: string): FinishSummary {
  const config = cat.finishes[finishKey(product.slug, finishId)];
  const variants = product.variants.filter((v) => v.finishId === finishId);
  const states = variants.map((v) => variantAvailability(cat, product.slug, v));
  const buyable = states.filter((s) => s.purchasable);
  const soldOut = variants.length > 0 && buyable.length === 0 && states.some((s) => s.reason === 'sold_out');
  const allInactive = variants.length > 0 && states.every((s) => s.reason === 'inactive');
  const visible =
    config?.visible !== false && !allInactive && !(config?.hideWhenSoldOut && soldOut);
  const limited = buyable.length > 0 && buyable.every((s) => s.available != null);
  const total = buyable.reduce((sum, s) => sum + (s.available ?? 0), 0);
  const low = !soldOut && limited && cat.lowStockThreshold > 0 && total <= cat.lowStockThreshold;

  const labels: LabelCode[] = [];
  const manual = config?.labelCode ?? null;
  // Sin contradicciones: agotado anula «Últimas unidades» o «De nuevo disponible».
  if (manual && !(soldOut && (manual === 'last_units' || manual === 'back_in_stock'))) labels.push(manual);
  if (soldOut) labels.push('sold_out');
  else if (low && !labels.includes('last_units')) labels.push('last_units');
  return { visible, soldOut, low, labels };
}

/** Lo que se publica de una referencia (sin revelar el stock exacto si sobra). */
export interface PublicVariantState {
  purchasable: boolean;
  reason: UnavailableReason | null;
  /** Cuántas quedan, solo si son pocas (≤ PUBLIC_STOCK_CAP); null = suficientes o sin límite. */
  left: number | null;
  low: boolean;
}

export function publicVariantState(cat: CatalogSnapshot, productSlug: string, variant: Pick<WheelVariant, 'id' | 'finishId'>): PublicVariantState {
  const a = variantAvailability(cat, productSlug, variant);
  return {
    purchasable: a.purchasable,
    reason: a.reason,
    left: a.available != null && a.available <= PUBLIC_STOCK_CAP ? a.available : null,
    low: a.low,
  };
}

/** Estado de una línea del carrito con la cantidad pedida. */
export type LineProblem = { kind: 'unavailable'; reason: UnavailableReason } | { kind: 'too_many'; left: number };

export function lineProblem(state: PublicVariantState | undefined, quantity: number): LineProblem | null {
  if (!state) return null;
  if (!state.purchasable) return { kind: 'unavailable', reason: state.reason ?? 'inactive' };
  if (state.left != null && quantity > state.left) return { kind: 'too_many', left: state.left };
  return null;
}
