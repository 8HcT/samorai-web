import type { Route } from './+types/api.stripe-webhook';
import type Stripe from 'stripe';
import { getStripe } from '~/lib/stripe/stripe.server';
import { requireEnv } from '~/lib/env.server';
import { handleStripeEvent } from '~/lib/presale/webhook.server';

/**
 * Endpoint de webhook de Stripe. Verifica la firma con
 * STRIPE_WEBHOOK_SECRET sobre el cuerpo CRUDO (request.text()) y delega en
 * `handleStripeEvent` (preventa, compra directa, pago final, reembolsos y el
 * carrito de siempre).
 *
 * Eventos a suscribir en Stripe:
 *   checkout.session.completed · checkout.session.async_payment_succeeded ·
 *   checkout.session.async_payment_failed · checkout.session.expired ·
 *   charge.refunded
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
    const outcome = await handleStripeEvent(event);
    if (outcome.status !== 'ignored') {
      console.log('[stripe][webhook]', event.type, event.id, JSON.stringify(outcome));
    }
  } catch (err) {
    // 500 → Stripe reintenta el evento con espera creciente.
    console.error('[stripe][webhook] error procesando el evento', event.type, event.id, err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(null, { status: 200 });
}
