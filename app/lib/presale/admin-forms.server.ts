/**
 * Lectura del formulario de tiradas del panel → campos de
 * presale_admin_create_batch / presale_admin_update_batch. La base de datos
 * vuelve a validar todo (restricciones CHECK).
 */
import { eurosToCents, madridLocalToUtcIso, percentToBps } from './datetime';

export interface ParsedBatchForm {
  fields: Record<string, unknown>;
  errors: string[];
}

function text(form: FormData, name: string, max = 10000): string | null {
  const value = String(form.get(name) ?? '').replace(/\r\n/g, '\n').trim();
  return value ? value.slice(0, max) : null;
}

function int(form: FormData, name: string, errors: string[], label: string): number | null {
  const raw = String(form.get(name) ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    errors.push(`${label}: número entero no válido`);
    return null;
  }
  return n;
}

export function parseBatchForm(form: FormData): ParsedBatchForm {
  const errors: string[] = [];
  const fields: Record<string, unknown> = {};

  const code = text(form, 'code', 63);
  if (code !== null) fields.code = code.toLowerCase();
  const name = text(form, 'name', 80);
  if (!name) errors.push('El nombre es obligatorio');
  else fields.name = name;
  fields.description = text(form, 'description', 2000);

  const capacity = int(form, 'capacity_sets', errors, 'Capacidad');
  if (capacity === null) errors.push('La capacidad (juegos) es obligatoria');
  else fields.capacity_sets = capacity;

  const maxSets = int(form, 'max_sets_per_order', errors, 'Máximo por pedido');
  if (maxSets !== null) fields.max_sets_per_order = maxSets;

  for (const key of ['presale_opens_at', 'presale_closes_at', 'planned_launch_at'] as const) {
    const raw = String(form.get(key) ?? '').trim();
    if (!raw) fields[key] = null;
    else {
      const iso = madridLocalToUtcIso(raw);
      if (!iso) errors.push(`Fecha no válida (${key})`);
      fields[key] = iso;
    }
  }

  const delivery = String(form.get('estimated_delivery_on') ?? '').trim();
  if (delivery && !/^\d{4}-\d{2}-\d{2}$/.test(delivery)) errors.push('Fecha de entrega no válida');
  fields.estimated_delivery_on = delivery || null;
  fields.estimated_delivery_note = text(form, 'estimated_delivery_note', 200);

  const deposit = eurosToCents(String(form.get('deposit_eur') ?? ''));
  if (deposit === null) errors.push('Importe de reserva no válido');
  else fields.deposit_cents = deposit;

  fields.presale_discount_enabled = form.get('presale_discount_enabled') === 'on';
  const bps = percentToBps(String(form.get('discount_percent') ?? ''));
  if (bps === null) errors.push('Descuento (%) no válido');
  else fields.presale_discount_bps = bps;

  for (const [key, label] of [
    ['balance_window_days', 'Plazo de pago'],
    ['first_reminder_day', 'Primer recordatorio'],
    ['final_reminder_day', 'Aviso de caducidad'],
  ] as const) {
    const n = int(form, key, errors, label);
    if (n !== null) fields[key] = n;
  }

  const policy = String(form.get('expiry_deposit_policy') ?? 'manual_review');
  fields.expiry_deposit_policy = ['manual_review', 'refund', 'retain'].includes(policy) ? policy : 'manual_review';
  fields.policies_legally_validated = form.get('policies_legally_validated') === 'on';
  if (fields.expiry_deposit_policy === 'retain' && !fields.policies_legally_validated) {
    errors.push('Para conservar la reserva abonada al caducar, las condiciones deben estar validadas legalmente');
  }

  fields.reservation_terms = text(form, 'reservation_terms');
  fields.cancellation_policy = text(form, 'cancellation_policy');
  fields.refund_policy = text(form, 'refund_policy');
  fields.expiry_policy = text(form, 'expiry_policy');

  return { fields, errors };
}

/** Mensajes de los motivos que devuelven las funciones de administración. */
export const ADMIN_REASON: Record<string, string> = {
  batch_not_found: 'Tirada no encontrada.',
  batch_closed: 'La tirada está finalizada o cancelada.',
  code_taken: 'Ya existe una tirada con ese identificador.',
  code_locked: 'El identificador solo puede cambiarse en borrador.',
  window_locked: 'El plazo de pago y los recordatorios no pueden cambiarse tras el lanzamiento.',
  invalid_fields: 'Algún campo no es válido.',
  capacity_below_committed: 'La capacidad no puede ser menor que lo ya comprometido.',
  quota_below_committed: 'El cupo no puede ser menor que lo ya comprometido en esa configuración.',
  product_in_use: 'No se puede quitar un modelo con plazas comprometidas.',
  product_not_in_batch: 'El modelo no está incluido en la tirada.',
  invalid_transition: 'Ese cambio de estado no está permitido desde el estado actual.',
  terms_missing: 'Faltan las condiciones (reserva, cancelación, devolución y caducidad).',
  no_capacity: 'La tirada no tiene capacidad.',
  no_products: 'La tirada no incluye ningún modelo.',
  presale_close_date_passed: 'La fecha de cierre de la preventa ya ha pasado.',
  open_reservations: 'Quedan reservas abiertas o en revisión.',
  reason_required: 'Indica el motivo.',
  not_found: 'No encontrado.',
  use_order_cancellation: 'La reserva ya es un pedido: cancela el pedido.',
  already_closed: 'Ya está cerrada.',
  payment_in_progress: 'Hay un pago en curso: espera a que Stripe lo resuelva.',
  not_applicable: 'No aplicable en el estado actual.',
  policy_not_validated: 'Las condiciones aceptadas por el cliente no estaban validadas legalmente: no se puede retener.',
  already_shipped: 'El pedido ya se envió: no se puede liberar la plaza.',
  no_recipient: 'No hay email de destino.',
  not_requeueable: 'Ese correo no puede reintentarse.',
  nothing_to_refund: 'No queda importe por devolver.',
};

export function adminReason(reason: unknown): string {
  return (typeof reason === 'string' && ADMIN_REASON[reason]) || (typeof reason === 'string' ? reason : 'No se pudo completar la acción.');
}
