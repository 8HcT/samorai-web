/**
 * Envío (compartido entre el checkout del servidor y los datos estructurados
 * de las páginas, que también se generan en el navegador).
 */

/** Países a los que se permite envío (España + UE principal). Ajustable. */
export const SHIPPING_COUNTRIES = [
  'ES', 'PT', 'FR', 'DE', 'IT', 'NL', 'BE', 'AT', 'IE', 'LU', 'FI',
] as const;

/** El envío es gratuito: el precio con IVA es el total que paga el cliente. */
export const SHIPPING_COST_CENTS = 0;
