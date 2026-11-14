/**
 * Pedido del carrito (flujo anterior a la preventa) a partir de una sesión de
 * Stripe Checkout pagada. Movido tal cual desde routes/api.stripe-webhook.tsx
 * para que el webhook pueda enrutar varios flujos.
 */
import type Stripe from 'stripe';
import { getFinish, getVariantById } from '~/data/products';
import { unitPriceCentsForWidth } from '~/lib/pricing';
import { sendOrderEmails } from '~/lib/email/email.server';
import { adminRpc, isPresaleDbConfigured } from '~/lib/presale/rpc.server';
import { recordOrder, type OrderAddress, type OrderLineRecord, type OrderRecord } from './orders.server';
import { TEST_PRICE_CENTS, TEST_PRODUCT_NAME, isTestVariantId } from './test-purchase';

/**
 * Reconstruye las líneas desde `metadata.cart`:
 * `variantId:cantidad[:precioUnitarioCobrado]`. El precio (céntimos) lo
 * escribe el servidor al crear la sesión: es el realmente cobrado, con la
 * promoción aplicada. Las sesiones antiguas no lo llevan.
 */
export function parseCartMeta(
  raw: string | null | undefined
): { variantId: string; quantity: number; unitPriceCents: number | null }[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => {
      const [variantId, qty, unit] = pair.split(':');
      const cents = Number(unit);
      return {
        variantId,
        quantity: Math.max(1, Math.floor(Number(qty) || 1)),
        unitPriceCents: unit != null && Number.isInteger(cents) && cents > 0 ? cents : null,
      };
    })
    .filter((l) => l.variantId);
}

/** Normaliza una dirección de Stripe al formato que usan correos y pedidos. */
export function toAddress(
  address: Stripe.Address | null | undefined,
  name: string | null | undefined
): OrderAddress | null {
  if (!address && !name) return null;
  return {
    name: name ?? null,
    line1: address?.line1 ?? null,
    line2: address?.line2 ?? null,
    postalCode: address?.postal_code ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    country: address?.country ?? null,
  };
}

/** Dirección de envío de la sesión (o la de facturación si no la hubiera). */
export function sessionAddresses(session: Stripe.Checkout.Session): {
  shipping: OrderAddress | null;
  billing: OrderAddress | null;
} {
  const shipping = session.collected_information?.shipping_details ?? null;
  const customer = session.customer_details ?? null;
  return {
    shipping:
      toAddress(shipping?.address, shipping?.name) ?? toAddress(customer?.address, customer?.name),
    billing: toAddress(customer?.address, customer?.name),
  };
}

export async function processCartSession(session: Stripe.Checkout.Session): Promise<void> {
  // Solo se registra y se avisa cuando el pago está efectivamente cobrado.
  if (session.payment_status !== 'paid') {
    console.log('[stripe][webhook] sesión sin cobrar todavía, se ignora', session.id, session.payment_status);
    return;
  }

  const parsed = parseCartMeta(session.metadata?.cart);
  // La sesión la crea siempre nuestro servidor: el metadato no lo puede poner el cliente.
  const isTest = session.metadata?.test === '1' || parsed.some((l) => isTestVariantId(l.variantId));

  const lines: OrderLineRecord[] = parsed.map((l) => {
    if (isTestVariantId(l.variantId)) {
      return {
        variantId: l.variantId,
        productName: TEST_PRODUCT_NAME,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents ?? TEST_PRICE_CENTS,
      };
    }
    const found = getVariantById(l.variantId);
    return {
      variantId: l.variantId,
      productName: found ? found.product.name : 'Desconocido',
      quantity: l.quantity,
      // Precio cobrado (con promoción). Sesiones antiguas sin él: precio por
      // defecto de la referencia.
      unitPriceCents:
        l.unitPriceCents ??
        found?.variant.priceCents ??
        (found ? unitPriceCentsForWidth(found.variant.width) : null) ??
        0,
      finishId: found?.variant.finishId ?? null,
      finishName: found ? getFinish(found.product, found.variant.finishId)?.name ?? found.variant.color : null,
      diameter: found?.variant.diameter ?? null,
      width: found?.variant.width ?? null,
      et: found?.variant.et ?? null,
    };
  });

  const shipping = session.collected_information?.shipping_details ?? null;
  const customer = session.customer_details ?? null;
  const { shipping: shippingAddress, billing } = sessionAddresses(session);

  const order: OrderRecord = {
    stripeSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    amountTotalCents: session.amount_total ?? null,
    amountSubtotalCents: session.amount_subtotal ?? null,
    shippingCents: session.shipping_cost?.amount_total ?? null,
    currency: session.currency ?? 'eur',
    customerEmail: customer?.email ?? session.customer_email ?? null,
    customerName: shipping?.name ?? customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    shippingAddress,
    billingAddress: billing,
    paymentStatus: session.payment_status ?? 'unknown',
    lines,
    createdAt: new Date().toISOString(),
    isTest,
    locale: session.metadata?.locale === 'en' ? 'en' : 'es',
  };

  const { isNew, orderId } = await recordOrder(order);

  // Correos de compra (best-effort: no debe tumbar el 200 a Stripe).
  // Solo en el primer procesado: Stripe reintenta el evento si algo falla
  // y el cliente no debe recibir la confirmación dos veces.
  if (!isNew) return;
  const emails = await sendOrderEmails(order);

  // Constancia en el historial del pedido (panel /admin y /admin/estado).
  if (orderId && isPresaleDbConfigured()) {
    await adminRpc('presale_audit', {
      p_entity_type: 'order',
      p_entity_id: orderId,
      p_action: 'order_emails',
      p_actor_type: 'system',
      p_actor_id: null,
      p_data: { customer: emails.customer, shop: emails.shop, errors: emails.errors, test: isTest },
    }).catch((err) => console.error('[stripe][webhook] no se pudo registrar el envío de correos', err));
  }
}
