import type { Route } from './+types/api.stripe-webhook';
import type Stripe from 'stripe';
import { getStripe } from '~/lib/stripe/stripe.server';
import { requireEnv } from '~/lib/env.server';
import { recordOrder, type OrderLineRecord, type OrderRecord } from '~/lib/orders/orders.server';
import { sendOrderEmails } from '~/lib/email/email.server';
import { getVariantById } from '~/data/products';

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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const lines: OrderLineRecord[] = parseCartMeta(session.metadata?.cart).map((l) => {
        const found = getVariantById(l.variantId);
        return {
          variantId: l.variantId,
          productName: found ? found.product.name : 'Desconocido',
          quantity: l.quantity,
          unitPriceCents: found?.variant.priceCents ?? 0,
        };
      });

      const order: OrderRecord = {
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
        amountTotalCents: session.amount_total ?? null,
        currency: session.currency ?? 'eur',
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
        paymentStatus: session.payment_status ?? 'unknown',
        lines,
        createdAt: new Date().toISOString(),
      };

      await recordOrder(order);

      // Correos de compra (best-effort: no debe tumbar el 200 a Stripe).
      await sendOrderEmails(order);
    }
    // Otros eventos (payment_intent.*, charge.refunded…) se pueden añadir aquí.
  } catch (err) {
    console.error('[stripe][webhook] error procesando el evento', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(null, { status: 200 });
}
