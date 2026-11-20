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

/**
 * Destinos que Stripe acepta (el país está permitido) pero que no son un
 * envío normal: Canarias, Ceuta y Melilla están fuera del territorio del IVA
 * (aduana e IGIC/IPSI) y, como Madeira y Azores, necesitan transporte
 * especial. El pedido se marca «Requiere revisión» antes de enviarlo.
 */
export function shippingReviewReason(
  address: { country?: string | null; postalCode?: string | null; state?: string | null } | null | undefined
): string | null {
  if (!address) return null;
  const cp = (address.postalCode ?? '').replace(/\s/g, '');
  const state = (address.state ?? '').toUpperCase();
  const outsideVat = 'está fuera del territorio del IVA (aduana e impuestos propios) y el transporte es especial. Revisa precio, impuestos y envío antes de prepararlo.';
  if (address.country === 'ES') {
    if (/^(35|38)/.test(cp) || state === 'GC' || state === 'TF') return `Envío a Canarias: ${outsideVat}`;
    if (/^51/.test(cp) || state === 'CE') return `Envío a Ceuta: ${outsideVat}`;
    if (/^52/.test(cp) || state === 'ML') return `Envío a Melilla: ${outsideVat}`;
  }
  if (address.country === 'PT' && /^9/.test(cp)) {
    return 'Envío a Madeira o Azores: el transporte es especial. Revisa el envío antes de prepararlo.';
  }
  return null;
}
