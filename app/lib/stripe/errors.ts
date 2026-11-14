/**
 * Mensajes claros para los errores de Stripe que puede encontrarse el
 * administrador (sin exponer detalles internos ni claves).
 */
export function stripeErrorMessage(err: unknown): string | null {
  const e = (err ?? {}) as { type?: string; code?: string; rawType?: string };
  const type = e.type ?? e.rawType;
  if (type === 'StripePermissionError' || type === 'permission_error') {
    return 'La clave de Stripe no tiene permiso para esta operación. En Stripe → Developers → API keys, edita la clave restringida y añade el permiso que falta (para devoluciones: «Refunds: Write»).';
  }
  if (type === 'StripeAuthenticationError' || type === 'authentication_error') {
    return 'La clave de Stripe (STRIPE_SECRET_KEY) no es válida o está revocada.';
  }
  if (e.code === 'charge_already_refunded') return 'Este pago ya estaba devuelto en Stripe.';
  if (type === 'StripeConnectionError' || type === 'StripeAPIError') {
    return 'Stripe no responde ahora mismo. Inténtalo de nuevo en unos minutos.';
  }
  return null;
}

/** ¿Es un error de permisos de una clave restringida? */
export function isStripePermissionError(err: unknown): boolean {
  const e = (err ?? {}) as { type?: string; rawType?: string };
  return e.type === 'StripePermissionError' || e.rawType === 'permission_error';
}
