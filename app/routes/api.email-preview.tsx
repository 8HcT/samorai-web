import type { Route } from './+types/api.email-preview';
import { isProduction } from '~/lib/env.server';
import { renderOrderEmailPreview } from '~/lib/email/email.server';
import { renderNotification } from '~/lib/email/presale-templates.server';
import type { OrderRecord } from '~/lib/orders/orders.server';
import type { NotificationContext, OrderRow, ReservationRow } from '~/lib/presale/rows';

/**
 * Vista previa de los correos de compra SOLO EN DESARROLLO, para poder
 * revisar el diseño sin tener que hacer una compra real.
 *
 *   /api/email-preview                       → correo del cliente
 *   /api/email-preview?to=shop               → aviso interno de venta
 *   /api/email-preview?template=list         → índice de correos de preventa
 *   /api/email-preview?template=<plantilla>  → un correo de preventa con datos de ejemplo
 *
 * En producción responde 404: no debe existir como endpoint público.
 */
const SAMPLE: OrderRecord = {
  stripeSessionId: 'cs_test_a1b2c3d4e5f6g7h8I9J0KLMN',
  stripePaymentIntentId: 'pi_3Ex4mpl3Pay1nt3nt',
  amountTotalCents: 115000,
  amountSubtotalCents: 115000,
  shippingCents: 0,
  currency: 'eur',
  customerEmail: 'cliente@ejemplo.com',
  customerName: 'Ana Martín Ruiz',
  customerPhone: '+34 600 123 456',
  shippingAddress: {
    name: 'Ana Martín Ruiz',
    line1: 'Calle Mayor 14, 3º B',
    line2: 'Portal izquierda',
    postalCode: '28013',
    city: 'Madrid',
    state: 'Madrid',
    country: 'ES',
  },
  billingAddress: {
    name: 'Ana Martín Ruiz',
    line1: 'Calle Mayor 14, 3º B',
    line2: null,
    postalCode: '28013',
    city: 'Madrid',
    state: 'Madrid',
    country: 'ES',
  },
  paymentStatus: 'paid',
  lines: [
    {
      variantId: 'victoria-anthracite-grey-18x9-et45',
      productName: 'Victoria',
      quantity: 2,
      unitPriceCents: 30000,
    },
    {
      variantId: 'victoria-anthracite-grey-18x8-5-et35',
      productName: 'Victoria',
      quantity: 2,
      unitPriceCents: 27500,
    },
  ],
  createdAt: new Date().toISOString(),
};

/* ---------- Correos de preventa (/api/email-preview?template=…) ---------- */

const PRESALE_TEMPLATES = [
  'reservation_confirmed', 'deposit_receipt', 'launch_announcement', 'balance_request', 'balance_reminder',
  'expiry_warning', 'reservation_expired', 'balance_paid', 'direct_purchase', 'reservation_cancelled',
  'refund_issued', 'order_status_update', 'shop_new_reservation', 'shop_balance_paid', 'shop_direct_sale',
  'shop_review_needed',
] as const;

function presaleSample(template: string): NotificationContext {
  const now = Date.now();
  const iso = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const terms = '[Texto de ejemplo] Las condiciones definitivas las redacta y valida el negocio.';
  const status: ReservationRow['status'] =
    template === 'reservation_expired' ? 'expired'
    : template === 'reservation_cancelled' ? 'cancelled'
    : template === 'balance_paid' || template === 'shop_balance_paid' ? 'completed'
    : ['launch_announcement', 'balance_request', 'balance_reminder', 'expiry_warning'].includes(template) ? 'balance_due'
    : 'confirmed';
  const reservation: ReservationRow = {
    id: '00000000-0000-4000-8000-000000000001', code: 'SR-7F3A9C21D0', batch_id: 'b', user_id: null,
    email: 'cliente@ejemplo.com', customer_name: 'Ana Martín Ruiz', phone: '+34 600 123 456',
    vehicle_make: 'BMW', vehicle_model: 'Serie 3 (G20)', vehicle_year: 2021,
    product_slug: 'victoria', product_name: 'Victoria', variant_id: 'victoria-anthracite-grey-18x9-et35',
    finish_id: 'anthracite-grey', finish_name: 'Antracita Grey', diameter: 18, width: 9, et: 35, pcd: '5x120',
    center_bore: 72.6, config_snapshot: {}, quantity_sets: 1, units_per_set: 4, currency: 'eur',
    unit_price_cents: 30000, subtotal_cents: 120000, discount_bps: 500, discount_cents: 6000, total_cents: 114000,
    deposit_cents: 5000, balance_cents: 109000,
    terms_snapshot: { batch_name: 'First Production Run', reservation_terms: terms, cancellation_policy: terms, refund_policy: terms, expiry_policy: terms, balance_window_days: 30 },
    terms_accepted_at: iso(-40), status,
    deposit_status: status === 'completed' ? 'applied' : status === 'cancelled' ? 'refund_pending' : 'paid',
    deposit_paid_at: iso(-40),
    balance_due_at: status === 'confirmed' ? null : template === 'expiry_warning' ? iso(5) : template === 'balance_reminder' ? iso(15) : template === 'reservation_expired' ? iso(-1) : iso(30),
    balance_paid_at: null, expired_at: null, cancelled_at: null, cancellation_reason: null, review_reason: null,
    config_review_status: 'approved', config_review_note: null, stripe_deposit_session_id: 'cs_test_x',
    stripe_deposit_payment_intent_id: 'pi_3Ex4mpl3Dep0s1t', stripe_balance_session_id: null,
    stripe_balance_payment_intent_id: null, order_id: null, access_version: 1, locale: 'es',
    created_at: iso(-40), updated_at: iso(0),
  };
  const order: OrderRow = {
    id: '00000000-0000-4000-8000-000000000002', code: 'SO-4B8E21C7A9', kind: template.includes('direct') ? 'direct' : 'presale',
    stripe_session_id: 'cs_test_y', stripe_payment_intent_id: 'pi_y', amount_total_cents: template.includes('direct') ? 120000 : 114000,
    subtotal_cents: 120000, discount_cents: template.includes('direct') ? 0 : 6000, amount_paid_cents: 114000, refunded_cents: 0,
    currency: 'eur', customer_email: 'cliente@ejemplo.com', customer_name: 'Ana Martín Ruiz', customer_phone: '+34 600 123 456',
    shipping_address: { name: 'Ana Martín Ruiz', line1: 'Calle Mayor 14, 3º B', postalCode: '28013', city: 'Madrid', country: 'ES' },
    billing_address: null, payment_status: 'paid', status: template === 'order_status_update' ? 'shipped' : 'paid',
    user_id: null, reservation_id: null, batch_id: 'b', review_reason: null, carrier: 'SEUR', tracking_number: 'SEUR123456789',
    shipped_at: null, delivered_at: null, access_version: 1, created_at: iso(0), updated_at: iso(0),
  };
  const withOrder = ['balance_paid', 'shop_balance_paid', 'direct_purchase', 'shop_direct_sale', 'order_status_update'].includes(template);
  const isDirect = template === 'direct_purchase' || template === 'shop_direct_sale';
  return {
    notification: {
      id: 'n', template, dedupe_key: 'preview', audience: template.startsWith('shop_') ? 'shop' : 'customer',
      to_email: 'cliente@ejemplo.com', reservation_id: null, order_id: null, batch_id: null, is_bulk: false,
      status: 'pending', attempts: 0, max_attempts: 6, next_attempt_at: iso(0), last_error: null, provider_message_id: null,
      payload: template === 'refund_issued' ? { amount_cents: 5000 } : template === 'order_status_update' ? { status: 'shipped' } : template === 'shop_review_needed' ? { reason: 'paid_without_stock', session: 'cs_test_x' } : {},
      sent_at: null, created_at: iso(0),
    },
    reservation: isDirect ? null : reservation,
    order: withOrder ? order : null,
    order_items: withOrder
      ? [{ id: 'i', order_id: order.id, variant_id: reservation.variant_id, product_name: 'Victoria', quantity: 4, unit_price_cents: 30000, finish_id: 'anthracite-grey', finish_name: 'Antracita Grey', diameter: 18, width: 9, et: 35, sets: 1 }]
      : [],
    batch: {
      id: 'b', code: 'victoria-run-01', name: 'First Production Run', description: null, status: status === 'confirmed' ? 'presale_open' : 'launched',
      capacity_sets: 50, units_per_set: 4, max_sets_per_order: 2, presale_opens_at: null, presale_closes_at: null,
      planned_launch_at: iso(30), launched_at: status === 'confirmed' ? null : iso(-1), estimated_delivery_on: null,
      estimated_delivery_note: 'Fecha de entrega de ejemplo', deposit_cents: 5000, presale_discount_enabled: true,
      presale_discount_bps: 500, balance_window_days: 30, first_reminder_day: 15, final_reminder_day: 25,
      expiry_deposit_policy: 'manual_review', policies_legally_validated: false, reservation_terms: terms,
      cancellation_policy: terms, refund_policy: terms, expiry_policy: terms, created_at: iso(-60), updated_at: iso(0),
    },
    payments: [],
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  if (isProduction()) throw new Response('Not found', { status: 404 });

  const params = new URL(request.url).searchParams;
  const template = params.get('template');
  if (template === 'list') {
    const links = PRESALE_TEMPLATES.map((t) => `<li><a href="?template=${t}">${t}</a></li>`).join('');
    return new Response(`<!doctype html><meta charset="utf-8"><title>Correos</title><h1>Correos de preventa</h1><ul>${links}</ul>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  if (template && (PRESALE_TEMPLATES as readonly string[]).includes(template)) {
    const ctx = presaleSample(template);
    const site = 'https://www.samoraiwheels.com';
    const email = renderNotification(ctx, { site, reservation: `${site}/reserva/ejemplo?t=…`, order: `${site}/pedido/ejemplo?t=…` });
    return new Response(`<!-- ${email.subject.replace(/--/g, '—')} -->${email.html}`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const variant = params.get('to') === 'shop' ? 'shop' : 'customer';
  return new Response(renderOrderEmailPreview(SAMPLE, variant), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
