/**
 * Utilidades de precio. Toda cantidad monetaria se maneja en
 * **céntimos de EUR** (la unidad mínima que espera Stripe).
 */
export const CURRENCY = 'eur';

const formatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  // Sin decimales forzados: importes enteros → "275 €", "1.100 €".
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formatea céntimos → "275 €" / "1.234,56 €". `null`/`undefined` → "Precio a consultar". */
export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return 'Precio a consultar';
  return formatter.format(cents / 100);
}
