/**
 * Formateo de valores para la interfaz en español.
 *
 * Los valores numéricos se ALMACENAN normalizados (8.5, 9, 9.5, 72.6) y
 * solo se muestran con coma decimal en la interfaz (8,5 · 72,6 mm).
 */

const decimalEs = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** 8.5 → "8,5" · 72.6 → "72,6" · 9 → "9". */
export function formatDecimalEs(n: number): string {
  return decimalEs.format(n);
}

/** Medida comercial: (18, 8.5) → "18x8,5". */
export function formatSize(diameter: number, width: number): string {
  return `${diameter}x${formatDecimalEs(width)}`;
}

/** Buje central: 72.6 → "72,6 mm". */
export function formatCenterBore(cb: number): string {
  return `${formatDecimalEs(cb)} mm`;
}

/** Offset: 35 → "ET35". */
export function formatEt(et: number): string {
  return `ET${et}`;
}
