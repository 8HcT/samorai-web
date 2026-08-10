import type { Route } from './+types/api.stripe-webhook';
import type Stripe from 'stripe';
import { getStripe } from '~/lib/stripe/stripe.server';
import { requireEnv } from '~/lib/env.server';
import {
  recordOrder,
  type OrderAddress,
  type OrderLineRecord,
  type OrderRecord,
} from '~/lib/orders/orders.server';
import { sendOrderEmails } from '~/lib/email/email.server';
import { getVariantById } from '~/data/products';
import { unitPriceCentsForWidth } from '~/lib/pricing';

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
function toAddress(
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

/**
 * Endpoint de webhook de Stripe. Verifica la firma con
 * STRIPE_WEBHOOK_SECRET sobre el cuerpo CRUDO (request.text()) y procesa
 * `checkout.session.completed` registrando el pedido.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 });

  const payload = await request.text(); // cuerpo crudo, imprescindible para la firma

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(payload, signature, requireEnv('STRIPE_WEBHOOK_SECRET'));
  } catch (err) {
    console.error('[stripe][webhook] firma inválida', err);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  try {
    // `completed` cubre el pago inmediato (tarjeta). `async_payment_succeeded`
    // llega cuando el método es diferido (p. ej. transferencia/SEPA) y el
    // dinero se confirma más tarde: en ese caso `completed` llegó con
    // `payment_status: 'unpaid'` y NO debe registrarse como venta.
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;

      // Solo se registra y se avisa cuando el pago está efectivamente cobrado.
      if (session.payment_status !== 'paid') {
        console.log(
          '[stripe][webhook] sesión sin cobrar todavía, se ignora',
          session.id,
          session.payment_status
        );
        return new Response(null, { status: 200 });
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
            found?.variant.priceCents ??
            (found ? unitPriceCentsForWidth(found.variant.width) : null) ??
            0,
        };
      });

      // Datos del comprador. El envío va en `collected_information`; si no
      // viniera, se cae a la dirección de facturación de `customer_details`.
      const shipping = session.collected_information?.shipping_details ?? null;
      const customer = session.customer_details ?? null;

      const order: OrderRecord = {
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
        amountTotalCents: session.amount_total ?? null,
        amountSubtotalCents: session.amount_subtotal ?? null,
        shippingCents: session.shipping_cost?.amount_total ?? null,
        currency: session.currency ?? 'eur',
        customerEmail: customer?.email ?? session.customer_email ?? null,
        customerName: shipping?.name ?? customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        shippingAddress:
          toAddress(shipping?.address, shipping?.name) ??
          toAddress(customer?.address, customer?.name),
        billingAddress: toAddress(customer?.address, customer?.name),
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
    // Otros eventos (payment_intent.*, charge.refunded…) se pueden añadir aquí.
  } catch (err) {
    console.error('[stripe][webhook] error procesando el evento', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(null, { status: 200 });
}
