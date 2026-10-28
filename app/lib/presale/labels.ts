/**
 * Textos visibles de estados (ES). Seguros para el navegador.
 */
import type { BatchStatus, DepositStatus, OrderStatus, ReservationStatus } from './types';

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  draft: 'Borrador',
  presale_open: 'Preventa abierta',
  presale_closed: 'Preventa cerrada',
  launched: 'Lanzamiento oficial',
  in_production: 'En producción',
  available: 'Disponible',
  completed: 'Finalizada',
  cancelled: 'Cancelada',
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending_deposit: 'Pendiente de pago de la reserva',
  deposit_processing: 'Pago de la reserva en proceso',
  confirmed: 'Reserva confirmada',
  balance_due: 'Pendiente del pago final',
  balance_processing: 'Pago final en proceso',
  completed: 'Pagada por completo',
  expired: 'Caducada',
  cancelled: 'Cancelada',
  abandoned: 'No completada',
  needs_review: 'En revisión',
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  unpaid: 'Sin pagar',
  paid: 'Pagada',
  applied: 'Descontada del precio final',
  refund_pending: 'Devolución en trámite',
  refunded: 'Devuelta',
  retained: 'Retenida según condiciones',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  paid: 'Pagado',
  in_production: 'En fabricación',
  ready_to_ship: 'Listo para enviar',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

export function label<T extends string>(map: Record<T, string>, key: string | null | undefined): string {
  return (key && (map as Record<string, string>)[key]) || key || '—';
}
