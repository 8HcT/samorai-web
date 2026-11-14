/**
 * Operaciones del panel de administración (solo servidor, service-role).
 *
 * Cada ruta de /admin llama antes a `requireAdmin(request)` en su loader y en
 * su action: aquí se asume un administrador ya autorizado. Las escrituras
 * pasan por funciones SQL que validan transiciones y registran auditoría con
 * el id del administrador.
 */
import type Stripe from 'stripe';
import { products } from '~/data/products';
import { getStripe } from '~/lib/stripe/stripe.server';
import { getSupabaseAdmin } from '~/lib/supabase/server';
import { dispatchNotifications } from '~/lib/email/outbox.server';
import { orderLink, reservationLink } from './access.server';
import { adminRpc } from './rpc.server';
import { TEST_ORDER_FILTER } from '~/lib/orders/test-purchase';
import { isAccessLinkSecretConfigured, presaleEnabled } from './config.server';
import type { AuditRow, BatchRow, NotificationRow, OrderItemRow, OrderRow, PaymentRow, ReservationRow } from './rows';

const db = () => getSupabaseAdmin();

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/** Productos del catálogo que pueden incluirse en una tirada. */
export function catalogProducts() {
  return products
    .filter((p) => p.category === 'wheel')
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      finishes: p.finishes.map((f) => ({ id: f.id, name: f.name })),
      variants: p.variants.map((v) => ({ id: v.id, finishId: v.finishId, width: v.width, et: v.et, diameter: v.diameter })),
    }));
}

// ------------------------------------------------------------------
// Panel general
// ------------------------------------------------------------------

export interface InventorySummary {
  capacity_sets: number;
  held_sets: number;
  reserved_sets: number;
  sold_sets: number;
  sold_direct_sets: number;
  sold_presale_sets: number;
  available_sets: number;
  released: Record<string, number>;
  quotas: { id: string; product_slug: string; finish_id: string | null; variant_id: string | null; capacity_sets: number; note: string | null; remaining: number }[];
}

export type Stats = Record<string, any>;

export async function loadDashboard() {
  const [stats, batches, review, decisions, held, failed, stripeFailed] = await Promise.all([
    adminRpc<Stats>('presale_admin_stats', {}),
    db().from('production_batches').select('*').order('created_at', { ascending: false }),
    db().from('reservations').select('id', { count: 'exact', head: true }).eq('status', 'needs_review'),
    db()
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .in('status', ['expired', 'cancelled', 'needs_review'])
      .in('deposit_status', ['paid', 'refund_pending']),
    db().from('email_notifications').select('id', { count: 'exact', head: true }).eq('status', 'held'),
    db().from('email_notifications').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    db().from('stripe_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  const batchRows = check(batches) as BatchRow[];
  const inventories = await Promise.all(
    batchRows.map((b) => adminRpc<InventorySummary>('presale_admin_batch_inventory', { p_batch_id: b.id }))
  );
  return {
    stats,
    batches: batchRows.map((b, i) => ({ batch: b, inventory: inventories[i] })),
    alerts: {
      needsReview: review.count ?? 0,
      depositDecisions: decisions.count ?? 0,
      heldEmails: held.count ?? 0,
      failedEmails: failed.count ?? 0,
      failedStripeEvents: stripeFailed.count ?? 0,
    },
  };
}

// ------------------------------------------------------------------
// Tiradas
// ------------------------------------------------------------------

export async function listBatches() {
  const batches = check(await db().from('production_batches').select('*').order('created_at', { ascending: false })) as BatchRow[];
  const inventories = await Promise.all(
    batches.map((b) => adminRpc<InventorySummary>('presale_admin_batch_inventory', { p_batch_id: b.id }))
  );
  return batches.map((b, i) => ({ batch: b, inventory: inventories[i] }));
}

export async function loadBatch(id: string) {
  const batch = check(await db().from('production_batches').select('*').eq('id', id).maybeSingle()) as BatchRow | null;
  if (!batch) return null;
  const [productsRes, inventory, stats, audit, released, statusCounts] = await Promise.all([
    db().from('production_batch_products').select('product_slug').eq('batch_id', id),
    adminRpc<InventorySummary>('presale_admin_batch_inventory', { p_batch_id: id }),
    adminRpc<Stats>('presale_admin_stats', { p_batch_id: id }),
    db().from('audit_events').select('*').eq('entity_type', 'batch').eq('entity_id', id).order('created_at', { ascending: false }).limit(50),
    db()
      .from('inventory_allocations')
      .select('id, quantity_sets, release_reason, released_at, variant_id, channel, reservation_id, reservations(code)')
      .eq('batch_id', id)
      .eq('status', 'released')
      .in('release_reason', ['reservation_expired', 'reservation_cancelled', 'order_cancelled', 'batch_cancelled'])
      .order('released_at', { ascending: false })
      .limit(50),
    db().from('reservations').select('status').eq('batch_id', id),
  ]);
  const counts: Record<string, number> = {};
  for (const row of (check(statusCounts) as { status: string }[]) ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return {
    batch,
    productSlugs: (check(productsRes) as { product_slug: string }[]).map((p) => p.product_slug),
    inventory,
    stats,
    audit: (check(audit) as AuditRow[]) ?? [],
    released: (check(released) as any[]) ?? [],
    statusCounts: counts,
  };
}

type RpcResult = { ok: boolean; reason?: string; [k: string]: unknown };

export const createBatch = (fields: Record<string, unknown>, actor: string) =>
  adminRpc<RpcResult>('presale_admin_create_batch', { p_fields: fields, p_actor: actor });

export const updateBatch = (id: string, fields: Record<string, unknown>, actor: string) =>
  adminRpc<RpcResult>('presale_admin_update_batch', { p_batch_id: id, p_fields: fields, p_actor: actor });

export const setBatchProducts = (id: string, slugs: string[], actor: string) =>
  adminRpc<RpcResult>('presale_admin_set_batch_products', { p_batch_id: id, p_product_slugs: slugs, p_actor: actor });

export const upsertQuota = (id: string, quota: Record<string, unknown>, actor: string) =>
  adminRpc<RpcResult>('presale_admin_upsert_quota', { p_batch_id: id, p_quota: quota, p_actor: actor });

export const deleteQuota = (quotaId: string, actor: string) =>
  adminRpc<RpcResult>('presale_admin_delete_quota', { p_quota_id: quotaId, p_actor: actor });

export const setBatchStatus = (id: string, status: string, actor: string) =>
  adminRpc<RpcResult>('presale_set_batch_status', { p_batch_id: id, p_status: status, p_actor: actor });

/**
 * Lanzamiento oficial. Los correos de lanzamiento quedan en la cola; solo se
 * envían si PRESALE_BULK_EMAILS_ENABLED=true (si no, quedan retenidos).
 */
export async function launchBatch(id: string, actor: string) {
  const res = await adminRpc<RpcResult>('presale_launch_batch', { p_batch_id: id, p_actor: actor });
  if (res.ok) await dispatchNotifications({ limit: 40 }).catch((err) => console.error('[admin] envío tras lanzamiento', err));
  return res;
}

export const cancelBatch = (id: string, reason: string, actor: string) =>
  adminRpc<RpcResult>('presale_cancel_batch', { p_batch_id: id, p_reason: reason, p_actor: actor });

// ------------------------------------------------------------------
// Reservas
// ------------------------------------------------------------------

export interface ReservationFilters {
  batch?: string | null;
  product?: string | null;
  finish?: string | null;
  width?: string | null;
  et?: string | null;
  status?: string | null;
  q?: string | null;
}

export function reservationFiltersFromUrl(url: URL): ReservationFilters {
  const get = (k: string) => url.searchParams.get(k)?.trim() || null;
  return { batch: get('batch'), product: get('product'), finish: get('finish'), width: get('width'), et: get('et'), status: get('status'), q: get('q') };
}

export async function listReservations(filters: ReservationFilters, limit = 200) {
  let query = db()
    .from('reservations')
    .select(
      'id, code, status, deposit_status, email, customer_name, product_name, finish_id, finish_name, diameter, width, et, ' +
        'quantity_sets, total_cents, deposit_cents, balance_cents, balance_due_at, created_at, config_review_status, ' +
        'vehicle_make, vehicle_model, batch_id, production_batches(name, code)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.batch) query = query.eq('batch_id', filters.batch);
  if (filters.product) query = query.eq('product_slug', filters.product);
  if (filters.finish) query = query.eq('finish_id', filters.finish);
  if (filters.width && Number.isFinite(Number(filters.width))) query = query.eq('width', Number(filters.width));
  if (filters.et && Number.isInteger(Number(filters.et))) query = query.eq('et', Number(filters.et));
  if (filters.status === 'active') query = query.in('status', ['confirmed', 'balance_due', 'balance_processing']);
  else if (filters.status) query = query.eq('status', filters.status);
  if (filters.q) {
    const q = filters.q.replace(/[%,()]/g, ' ').trim();
    if (q) query = query.or(`code.ilike.%${q}%,email.ilike.%${q}%,customer_name.ilike.%${q}%`);
  }
  return (check(await query) as any[]) ?? [];
}

export async function loadReservation(id: string) {
  const reservation = check(await db().from('reservations').select('*').eq('id', id).maybeSingle()) as ReservationRow | null;
  if (!reservation) return null;
  const [batch, allocations, payments, notifications, order] = await Promise.all([
    db().from('production_batches').select('id, name, code, status, policies_legally_validated').eq('id', reservation.batch_id).maybeSingle(),
    db().from('inventory_allocations').select('*').eq('reservation_id', id).order('created_at'),
    db().from('payments').select('*').eq('reservation_id', id).order('created_at'),
    db().from('email_notifications').select('*').eq('reservation_id', id).order('created_at', { ascending: false }),
    reservation.order_id ? db().from('orders').select('id, code, status').eq('id', reservation.order_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const allocationIds = ((check(allocations) as { id: string }[]) ?? []).map((a) => a.id);
  const paymentIds = ((check(payments) as { id: string }[]) ?? []).map((p) => p.id);
  const entityIds = [id, ...allocationIds, ...paymentIds];
  const audit = check(
    await db().from('audit_events').select('*').in('entity_id', entityIds).order('created_at', { ascending: false }).limit(100)
  ) as AuditRow[];
  return {
    reservation,
    batch: check(batch) as { id: string; name: string; code: string; status: string; policies_legally_validated: boolean } | null,
    allocations: check(allocations) as any[],
    payments: check(payments) as PaymentRow[],
    notifications: check(notifications) as NotificationRow[],
    order: check(order) as { id: string; code: string | null; status: string } | null,
    audit,
    guestLink: reservationLink(reservation.id, reservation.access_version),
  };
}

export const reviewConfig = (id: string, status: string, note: string | null, actor: string) =>
  adminRpc<RpcResult>('presale_admin_review_config', { p_reservation_id: id, p_status: status, p_note: note, p_actor: actor });

export const setDepositDisposition = (id: string, disposition: 'retained' | 'refund_pending', note: string | null, actor: string) =>
  adminRpc<RpcResult>('presale_admin_set_deposit_disposition', { p_reservation_id: id, p_disposition: disposition, p_note: note, p_actor: actor });

export const rotateAccess = (kind: 'reservation' | 'order', id: string, actor: string) =>
  adminRpc<RpcResult>('presale_admin_rotate_access', { p_kind: kind, p_id: id, p_actor: actor });

export async function resendEmail(template: string, target: { reservationId?: string; orderId?: string }, actor: string) {
  const res = await adminRpc<{ ok: boolean; notification_id?: string; reason?: string }>('presale_enqueue_manual', {
    p_template: template,
    p_reservation_id: target.reservationId ?? null,
    p_order_id: target.orderId ?? null,
    p_actor: actor,
  });
  if (res.ok && res.notification_id) {
    const sent = await dispatchNotifications({ ids: [res.notification_id] });
    return { ...res, sent: sent.sent > 0, skipped: sent.skipped };
  }
  return res;
}

// ------------------------------------------------------------------
// Reembolsos (Stripe Refunds API · requiere permiso Refunds: Write)
// ------------------------------------------------------------------

/**
 * Devuelve un pago (total o parcial) en Stripe y lo registra. La
 * idempotencia evita devolver dos veces si se pulsa el botón dos veces.
 */
export async function refundPayment(paymentIntentId: string, amountCents: number | null, stripe: Stripe = getStripe()) {
  const payment = check(
    await db().from('payments').select('*').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  ) as PaymentRow | null;
  if (!payment) throw new Error('Pago no encontrado');
  const remaining = payment.amount_cents - payment.refunded_cents;
  const amount = amountCents == null ? remaining : Math.min(amountCents, remaining);
  if (amount <= 0) return { ok: false, reason: 'nothing_to_refund' };

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount, reason: 'requested_by_customer', metadata: { source: 'samorai-admin' } },
    { idempotencyKey: `samorai-refund-${paymentIntentId}-${payment.refunded_cents}-${amount}` }
  );
  if (refund.status === 'failed' || refund.status === 'canceled') {
    return { ok: false, reason: `refund_${refund.status}` };
  }
  await adminRpc('presale_record_refund', {
    p_payment_intent_id: paymentIntentId,
    p_refunded_total_cents: payment.refunded_cents + refund.amount,
  });
  await dispatchNotifications({ limit: 10 }).catch(() => {});
  return { ok: true, refundId: refund.id, amount: refund.amount };
}

/** Cancelar una reserva (y, si se indica, devolver la reserva abonada). */
export async function cancelReservation(id: string, reason: string, refund: boolean, actor: string) {
  const res = await adminRpc<RpcResult & { deposit_payment_intent_id?: string; open_session_id?: string }>(
    'presale_admin_cancel_reservation',
    { p_reservation_id: id, p_reason: reason, p_refund_deposit: refund, p_actor: actor }
  );
  if (!res.ok) return res;
  // Un checkout que siguiera abierto deja de poder pagarse.
  if (res.open_session_id) {
    await getStripe().checkout.sessions.expire(res.open_session_id).catch(() => {});
  }
  let refunded: unknown = null;
  if (refund && res.deposit_payment_intent_id) {
    refunded = await refundPayment(res.deposit_payment_intent_id, null);
  }
  await dispatchNotifications({ limit: 10 }).catch(() => {});
  return { ...res, refunded };
}

// ------------------------------------------------------------------
// Pedidos
// ------------------------------------------------------------------

export interface OrderFilters {
  status?: string | null;
  /** cart | direct | presale | test (compras de prueba). */
  kind?: string | null;
  q?: string | null;
}

export function orderFiltersFromUrl(url: URL): OrderFilters {
  return {
    status: url.searchParams.get('status') || null,
    kind: url.searchParams.get('kind') || null,
    q: url.searchParams.get('q') || null,
  };
}

export type OrderListRow = Pick<
  OrderRow,
  | 'id' | 'code' | 'kind' | 'status' | 'customer_email' | 'customer_name' | 'customer_phone' | 'shipping_address'
  | 'amount_total_cents' | 'amount_paid_cents' | 'refunded_cents' | 'created_at' | 'review_reason' | 'batch_id'
  | 'stripe_session_id' | 'carrier' | 'tracking_number' | 'shipped_at' | 'delivered_at'
>;

export async function listOrders(filters: OrderFilters, limit = 200): Promise<OrderListRow[]> {
  let query = db()
    .from('orders')
    .select(
      'id, code, kind, status, customer_email, customer_name, customer_phone, shipping_address, amount_total_cents, amount_paid_cents, refunded_cents, created_at, review_reason, batch_id, stripe_session_id, carrier, tracking_number, shipped_at, delivered_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.kind === 'test') query = query.or(TEST_ORDER_FILTER);
  else if (filters.kind) query = query.eq('kind', filters.kind);
  if (filters.q) {
    const q = filters.q.replace(/[%,()]/g, ' ').trim();
    if (q) query = query.or(`code.ilike.%${q}%,customer_email.ilike.%${q}%,customer_name.ilike.%${q}%`);
  }
  return ((check(await query) as unknown as OrderListRow[]) ?? []);
}

export async function loadOrder(id: string) {
  const order = check(await db().from('orders').select('*').eq('id', id).maybeSingle()) as OrderRow | null;
  if (!order) return null;
  const [items, payments, notifications, audit, reservation] = await Promise.all([
    db().from('order_items').select('*').eq('order_id', id),
    db().from('payments').select('*').eq('order_id', id).order('created_at'),
    db().from('email_notifications').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    db().from('audit_events').select('*').eq('entity_type', 'order').eq('entity_id', id).order('created_at', { ascending: false }),
    order.reservation_id ? db().from('reservations').select('id, code').eq('id', order.reservation_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  return {
    order,
    items: check(items) as OrderItemRow[],
    payments: check(payments) as PaymentRow[],
    notifications: check(notifications) as NotificationRow[],
    audit: check(audit) as AuditRow[],
    reservation: check(reservation) as { id: string; code: string } | null,
    // La página /pedido/:id solo existe con la preventa activa, y firmar el
    // enlace exige ACCESS_LINK_SECRET (sin él, lanzaría y tumbaría la ficha).
    guestLink: presaleEnabled() && isAccessLinkSecretConfigured() ? orderLink(order.id, order.access_version) : null,
  };
}

export async function updateOrderStatus(id: string, status: string, carrier: string | null, tracking: string | null, notify: boolean, actor: string) {
  const res = await adminRpc<RpcResult & { notification_id?: string }>('presale_admin_update_order', {
    p_order_id: id, p_status: status, p_carrier: carrier, p_tracking: tracking, p_notify: notify, p_actor: actor,
  });
  if (res.ok && res.notification_id) await dispatchNotifications({ ids: [res.notification_id] }).catch(() => {});
  return res;
}

export const cancelOrder = (id: string, reason: string, releaseStock: boolean, actor: string) =>
  adminRpc<RpcResult>('presale_admin_cancel_order', { p_order_id: id, p_reason: reason, p_release_stock: releaseStock, p_actor: actor });

/**
 * Devuelve todo lo cobrado en un pedido: los pagos de preventa o compra
 * directa (tabla `payments`) o, en los pedidos del carrito, que no tienen
 * filas en `payments`, el pago de Stripe del propio pedido.
 */
export async function refundOrder(id: string, stripe: Stripe = getStripe()): Promise<{ ok: boolean; reason?: string; refundedCents?: number }> {
  const order = check(
    await db()
      .from('orders')
      .select('id, stripe_payment_intent_id, amount_total_cents, amount_paid_cents, refunded_cents')
      .eq('id', id)
      .maybeSingle()
  ) as Pick<OrderRow, 'id' | 'stripe_payment_intent_id' | 'amount_total_cents' | 'amount_paid_cents' | 'refunded_cents'> | null;
  if (!order) return { ok: false, reason: 'not_found' };

  const payments = check(
    await db().from('payments').select('*').eq('order_id', id).in('status', ['succeeded', 'partially_refunded'])
  ) as PaymentRow[];

  if (payments.length > 0) {
    let refunded = 0;
    for (const p of payments) {
      if (!p.stripe_payment_intent_id) continue;
      const r = await refundPayment(p.stripe_payment_intent_id, null, stripe);
      if (!r.ok) return { ok: false, reason: r.reason };
      refunded += r.amount ?? 0;
    }
    return refunded > 0 ? { ok: true, refundedCents: refunded } : { ok: false, reason: 'nothing_to_refund' };
  }

  // Pedido del carrito: un único pago, guardado en el propio pedido.
  const pi = order.stripe_payment_intent_id;
  if (!pi) return { ok: false, reason: 'no_payment' };
  const paid = order.amount_paid_cents ?? order.amount_total_cents ?? 0;
  const remaining = paid - order.refunded_cents;
  if (remaining <= 0) return { ok: false, reason: 'nothing_to_refund' };

  const refund = await stripe.refunds.create(
    { payment_intent: pi, amount: remaining, reason: 'requested_by_customer', metadata: { source: 'samorai-admin', order_id: id } },
    { idempotencyKey: `samorai-refund-order-${id}-${order.refunded_cents}-${remaining}` }
  );
  if (refund.status === 'failed' || refund.status === 'canceled') {
    return { ok: false, reason: `refund_${refund.status}` };
  }
  // El webhook charge.refunded lo registraría igual; así el panel lo ve ya.
  await adminRpc('presale_record_refund', {
    p_payment_intent_id: pi,
    p_refunded_total_cents: order.refunded_cents + refund.amount,
  });
  return { ok: true, refundedCents: refund.amount };
}

// ------------------------------------------------------------------
// Correos
// ------------------------------------------------------------------

export async function listNotifications(status: string | null, limit = 200) {
  let query = db()
    .from('email_notifications')
    .select('id, template, audience, to_email, status, attempts, max_attempts, last_error, is_bulk, created_at, sent_at, next_attempt_at, reservation_id, order_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) query = query.eq('status', status);
  return (check(await query) as any[]) ?? [];
}

export const requeueNotification = (id: string, actor: string) =>
  adminRpc<RpcResult>('notification_requeue', { p_id: id, p_actor: actor });

export const releaseHeldNotifications = (batchId: string | null, actor: string) =>
  adminRpc<RpcResult>('notification_release_held', { p_batch_id: batchId, p_actor: actor });
