import Stripe from 'stripe';
import { requireEnv } from '~/lib/env.server';

/**
 * Cliente de Stripe (solo servidor). Se instancia de forma perezosa para
 * que el build / SSR no falle cuando aún no hay STRIPE_SECRET_KEY: el
 * error solo salta al usarlo (crear sesión de checkout o verificar webhook).
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  }
  return _stripe;
}

/** `true` si la secret key está configurada (sin instanciar el cliente). */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
