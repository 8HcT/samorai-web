/**
 * Pedido del carrito (flujo anterior a la preventa) a partir de una sesión de
 * Stripe Checkout pagada. Movido tal cual desde routes/api.stripe-webhook.tsx
 * para que el webhook pueda enrutar varios flujos.
 */
import type Stripe from 'stripe';
import { getVariantById } from '~/data/products';
import { unitPriceCentsForWidth } from '~/lib/pricing';
import { sendOrderEmails } from '~/lib/email/email.server';
import { recordOrder, type OrderAddress, type OrderLineRecord, type OrderRecord } from './orders.server';

/** Reconstruye las líneas desde `metadata.cart` ("variantId:qty,..."). */
function parseCartMeta(raw: string | null | undefined): { variantId: string; quantity: number }[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => {
      const [variantId, qty] = pair.split(':');
      return { variantId, quantity: Math.max(1, Math.floor(Number(qty) || 1)) };
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

  const lines: OrderLineRecord[] = parseCartMeta(session.metadata?.cart).map((l) => {
    const found = getVariantById(l.variantId);
    return {
      variantId: l.variantId,
      productName: found ? found.product.name : 'Desconocido',
      quantity: l.quantity,
      // El precio se recalcula desde la regla de ancho por si la
      // referencia se quedara sin `priceCents` en los datos.
      unitPriceCents:
        found?.variant.priceCents ?? (found ? unitPriceCentsForWidth(found.variant.width) : null) ?? 0,
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
  };

  const { isNew } = await recordOrder(order);

  // Correos de compra (best-effort: no debe tumbar el 200 a Stripe).
  // Solo en el primer procesado: Stripe reintenta el evento si algo falla
  // y el cliente no debe recibir la confirmación dos veces.
  if (isNew) await sendOrderEmails(order);
}
