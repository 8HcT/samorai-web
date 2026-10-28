/**
 * Datos de las páginas públicas de reserva y de pedido (solo servidor).
 *
 * Acceso: enlace seguro firmado (comprador invitado) o sesión del dueño. Si
 * no se cumple ninguno se responde 404, sin revelar si el id existe.
 */
import { getSessionUser } from '~/lib/auth/session.server';
import { getSupabaseAdmin } from '~/lib/supabase/server';
import { orderLink, verifyAccessToken } from './access.server';
import type { AddressJson, BatchRow, OrderItemRow, OrderRow, PaymentRow, ReservationRow } from './rows';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export type ViewerKind = 'token' | 'owner';

export interface PublicPayment {
  purpose: PaymentRow['purpose'];
  status: PaymentRow['status'];
  amountCents: number;
  refundedCents: number;
  paidAt: string | null;
}

function publicPayments(rows: PaymentRow[]): PublicPayment[] {
  return rows
    .filter((p) => ['succeeded', 'processing', 'refunded', 'partially_refunded'].includes(p.status))
    .map((p) => ({
      purpose: p.purpose,
      status: p.status,
      amountCents: p.amount_cents,
      refundedCents: p.refunded_cents,
      paidAt: p.paid_at,
    }));
}

export interface ReservationView {
  viewer: ViewerKind;
  token: string | null;
  reservation: ReservationRow;
  batch: Pick<
    BatchRow,
    'name' | 'status' | 'planned_launch_at' | 'launched_at' | 'estimated_delivery_on' | 'estimated_delivery_note'
  > | null;
  payments: PublicPayment[];
  order: { id: string; code: string | null; status: string; link: string } | null;
  canPay: boolean;
}

async function viewerFor(
  request: Request,
  kind: 'reservation' | 'order',
  id: string,
  version: number,
  ownerId: string | null,
  token: string | null
): Promise<ViewerKind | null> {
  if (token && verifyAccessToken(kind, id, version, token)) return 'token';
  if (ownerId) {
    const { user } = await getSessionUser(request);
    if (user && user.id === ownerId) return 'owner';
  }
  return null;
}

export async function loadReservationView(
  request: Request,
  id: string,
  token: string | null,
  now = new Date()
): Promise<ReservationView | null> {
  if (!isUuid(id)) return null;
  const db = getSupabaseAdmin();
  const { data: reservation, error } = await db.from('reservations').select('*').eq('id', id).maybeSingle<ReservationRow>();
  if (error) throw error;
  if (!reservation) return null;

  const viewer = await viewerFor(request, 'reservation', reservation.id, reservation.access_version, reservation.user_id, token);
  if (!viewer) return null;

  const [{ data: batch }, { data: payments }, orderRes] = await Promise.all([
    db
      .from('production_batches')
      .select('name, status, planned_launch_at, launched_at, estimated_delivery_on, estimated_delivery_note')
      .eq('id', reservation.batch_id)
      .maybeSingle(),
    db.from('payments').select('*').eq('reservation_id', reservation.id).order('created_at'),
    reservation.order_id
      ? db.from('orders').select('id, code, status, access_version').eq('id', reservation.order_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const order = orderRes.data as { id: string; code: string | null; status: string; access_version: number } | null;

  return {
    viewer,
    token: viewer === 'token' ? token : null,
    reservation,
    batch: batch ?? null,
    payments: publicPayments((payments ?? []) as PaymentRow[]),
    order: order ? { id: order.id, code: order.code, status: order.status, link: orderLink(order.id, order.access_version, '') } : null,
    canPay:
      reservation.status === 'balance_due' &&
      reservation.balance_due_at != null &&
      new Date(reservation.balance_due_at) > now,
  };
}

export interface OrderView {
  viewer: ViewerKind;
  order: Omit<OrderRow, 'shipping_address' | 'billing_address'> & {
    shipping_address: AddressJson | null;
  };
  items: OrderItemRow[];
  payments: PublicPayment[];
  reservation: Pick<ReservationRow, 'id' | 'code' | 'deposit_cents' | 'discount_bps'> | null;
  batch: Pick<BatchRow, 'name' | 'status' | 'estimated_delivery_on' | 'estimated_delivery_note'> | null;
}

/** Con enlace (invitado) solo se muestra lo justo de la dirección. */
function redactAddress(address: AddressJson | null): AddressJson | null {
  if (!address) return null;
  return { name: address.name ?? null, postalCode: address.postalCode ?? null, city: address.city ?? null, country: address.country ?? null };
}

export async function loadOrderView(request: Request, id: string, token: string | null): Promise<OrderView | null> {
  if (!isUuid(id)) return null;
  const db = getSupabaseAdmin();
  const { data: order, error } = await db.from('orders').select('*').eq('id', id).maybeSingle<OrderRow>();
  if (error) throw error;
  if (!order) return null;

  const viewer = await viewerFor(request, 'order', order.id, order.access_version, order.user_id, token);
  if (!viewer) return null;

  const [{ data: items }, { data: payments }, resRes, batchRes] = await Promise.all([
    db.from('order_items').select('*').eq('order_id', order.id),
    db.from('payments').select('*').eq('order_id', order.id).order('created_at'),
    order.reservation_id
      ? db.from('reservations').select('id, code, deposit_cents, discount_bps').eq('id', order.reservation_id).maybeSingle()
      : Promise.resolve({ data: null }),
    order.batch_id
      ? db.from('production_batches').select('name, status, estimated_delivery_on, estimated_delivery_note').eq('id', order.batch_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { billing_address: _billing, ...rest } = order;
  return {
    viewer,
    order: {
      ...rest,
      shipping_address: viewer === 'owner' ? order.shipping_address : redactAddress(order.shipping_address),
      customer_phone: viewer === 'owner' ? order.customer_phone : null,
    },
    items: (items ?? []) as OrderItemRow[],
    payments: publicPayments((payments ?? []) as PaymentRow[]),
    reservation: (resRes.data as OrderView['reservation']) ?? null,
    batch: (batchRes.data as OrderView['batch']) ?? null,
  };
}

/** Reserva por sesión de Stripe de la señal (página de vuelta del checkout). */
export async function findReservationByDepositSession(sessionId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('reservations')
    .select('id, access_version')
    .eq('stripe_deposit_session_id', sessionId)
    .maybeSingle<{ id: string; access_version: number }>();
  if (error) throw error;
  return data;
}

/** Pedido por sesión de Stripe (compra directa o pago final). */
export async function findOrderBySession(sessionId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('orders')
    .select('id, access_version')
    .eq('stripe_session_id', sessionId)
    .maybeSingle<{ id: string; access_version: number }>();
  if (error) throw error;
  if (data) return { kind: 'order' as const, ...data };
  // Pago final aún sin procesar: se sabe a qué reserva pertenece.
  const { data: payment } = await db
    .from('payments')
    .select('reservation_id, purpose, status')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle<{ reservation_id: string | null; purpose: string; status: string }>();
  return payment ? { kind: 'payment' as const, ...payment } : null;
}
