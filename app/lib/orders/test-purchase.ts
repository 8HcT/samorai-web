/**
 * Compra de prueba («referencia trampa»).
 *
 * Una referencia oculta de 1 € que recorre el MISMO camino que una compra
 * real (/api/checkout → Stripe → webhook → pedido → correos → devolución)
 * para comprobar en producción que todo funciona. Solo puede comprarla un
 * administrador con sesión iniciada; no aparece en el catálogo, ni en el
 * sitemap, ni en las promociones, ni en las cifras de ventas del panel.
 *
 * El pedido resultante se distingue por su código (`PRUEBA-…`), así que no
 * hace falta ninguna columna nueva en la base de datos.
 */

export const TEST_VARIANT_ID = 'samorai-prueba-1eur';
export const TEST_PRICE_CENTS = 100;
export const TEST_PRODUCT_NAME = 'Compra de prueba SAMORAI (no se envía)';
export const TEST_ORDER_CODE_PREFIX = 'PRUEBA-';

export function isTestVariantId(id: string | null | undefined): boolean {
  return id === TEST_VARIANT_ID;
}

export function isTestOrderCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.startsWith(TEST_ORDER_CODE_PREFIX);
}

/** Pago hecho con las claves de TEST de Stripe: nunca es dinero real. */
export function isStripeTestSession(sessionId: string | null | undefined): boolean {
  return typeof sessionId === 'string' && sessionId.startsWith('cs_test_');
}

/**
 * Pedido que no cuenta como venta: la compra de prueba de 1 € o cualquier
 * pedido pagado en el modo test de Stripe (p. ej. los de la puesta a punto).
 */
export function isTestOrder(order: { code: string | null; stripe_session_id: string }): boolean {
  return isTestOrderCode(order.code) || isStripeTestSession(order.stripe_session_id);
}

/** Filtro de PostgREST equivalente a `isTestOrder` (para `.or(...)`). */
export const TEST_ORDER_FILTER = `code.like.${TEST_ORDER_CODE_PREFIX}*,stripe_session_id.like.cs_test_*`;

/** Referencia corta del pedido del carrito: la que ve el cliente en el correo. */
export function cartOrderRef(stripeSessionId: string): string {
  return stripeSessionId.slice(-8).toUpperCase();
}

/** Código del pedido del carrito; los de prueba llevan el prefijo `PRUEBA-`. */
export function cartOrderCode(stripeSessionId: string, test: boolean): string {
  return `${test ? TEST_ORDER_CODE_PREFIX : ''}${cartOrderRef(stripeSessionId)}`;
}
