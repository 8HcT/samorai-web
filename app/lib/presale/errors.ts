/**
 * Mensajes para el cliente de los motivos que devuelven las funciones de
 * preventa (seguro para el navegador).
 */
export const PRESALE_ERROR_MESSAGES: Record<string, string> = {
  insufficient_stock: 'Ya no quedan juegos suficientes para esta configuración. Prueba con menos juegos u otra configuración.',
  presale_not_open: 'La preventa no está abierta en este momento.',
  presale_window_closed: 'El periodo de preventa ha terminado.',
  direct_sale_not_open: 'La venta directa aún no ha comenzado.',
  invalid_quantity: 'Cantidad de juegos no válida.',
  invalid_configuration: 'Esa configuración no está disponible. Elige acabado, medida y ET.',
  product_not_in_batch: 'Este modelo no forma parte de la tirada.',
  terms_required: 'Debes aceptar las condiciones de reserva para continuar.',
  email_required: 'Introduce un email válido.',
  invalid_vehicle: 'Revisa los datos del vehículo (el año debe ser válido).',
  too_many_pending: 'Ya tienes pagos de reserva pendientes. Complétalos o espera unos minutos.',
  pricing_mismatch: 'Las condiciones de la tirada acaban de cambiar. Revisa el precio y vuelve a intentarlo.',
  payments_disabled: 'Los pagos de esta tirada todavía no están activados.',
  not_configured: 'La tienda no está configurada todavía. Inténtalo más tarde.',
  stripe_error: 'No se pudo iniciar el pago. Inténtalo de nuevo en unos minutos.',
  hold_not_active: 'La retención de tu plaza ha caducado. Vuelve a intentarlo.',
  deadline_passed: 'El plazo de pago de esta reserva ha vencido.',
  not_payable: 'Esta reserva no admite pagos en este momento.',
  already_paid: 'Esta reserva ya está pagada por completo.',
  payment_processing: 'Hay un pago en proceso para esta reserva. Te avisaremos por email.',
  unavailable: 'La compra no está disponible en este momento. Inténtalo más tarde.',
};

export function presaleErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return PRESALE_ERROR_MESSAGES[code] ?? PRESALE_ERROR_MESSAGES.unavailable;
}
