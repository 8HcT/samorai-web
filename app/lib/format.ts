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

/**
 * Medida comercial: (18, 8.5) → "18x8,5". En inglés, con punto decimal:
 * (18, 8.5, 'en') → "18x8.5".
 */
export function formatSize(diameter: number, width: number, locale: 'es' | 'en' = 'es'): string {
  return `${diameter}x${locale === 'en' ? String(width) : formatDecimalEs(width)}`;
}

/** Offset: 35 → "ET35". */
export function formatEt(et: number): string {
  return `ET${et}`;
}
