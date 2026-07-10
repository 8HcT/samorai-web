import type { Route } from './+types/api.checkout';
import { redirect } from 'react-router';
import { getStripe } from '~/lib/stripe/stripe.server';
import { getVariantById } from '~/data/products';
import { CURRENCY } from '~/lib/money';
import { fallbackPriceCents, siteUrl } from '~/lib/env.server';

/** Países a los que se permite envío (España + UE principal). Ajustable. */
const SHIPPING_COUNTRIES = [
  'ES', 'PT', 'FR', 'DE', 'IT', 'NL', 'BE', 'AT', 'IE', 'LU', 'FI',
] as const;

interface IncomingLine {
  variantId: string;
  quantity: number;
}

/**
 * Crea una sesión de Stripe Checkout a partir del carrito recibido y
 * redirige a la URL hospedada de Stripe. Los precios se resuelven
 * SIEMPRE en el servidor desde los datos de producto: el cliente solo
 * envía `variantId` + `quantity` (nunca importes).
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const form = await request.formData();
  let lines: IncomingLine[] = [];
  try {
    const parsed = JSON.parse(String(form.get('cart') ?? '[]'));
    if (Array.isArray(parsed)) lines = parsed;
  } catch {
    /* cart inválido → carrito vacío */
  }

  if (lines.length === 0) return redirect('/cart?error=empty');

  const fallback = fallbackPriceCents();
  const lineItems: {
    quantity: number;
    price_data: {
      currency: string;
      unit_amount: number;
      product_data: { name: string; metadata: Record<string, string> };
    };
  }[] = [];
  let missingPrice = false;

  for (const line of lines) {
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 0));
    const found = getVariantById(String(line.variantId));
    if (!found) continue;

    const unitAmount = found.variant.priceCents ?? fallback;
    if (unitAmount == null) {
      missingPrice = true;
      continue;
    }

    const { product, variant } = found;
    lineItems.push({
      quantity,
      price_data: {
        currency: CURRENCY,
        unit_amount: unitAmount,
        product_data: {
          name: `${product.name} — ${variant.diameter}×${variant.width}J ET${variant.et} · ${variant.color}`,
          metadata: { variantId: variant.id, productId: product.id },
        },
      },
    });
  }

  if (missingPrice || lineItems.length === 0) {
    // Alguna variante no tiene precio configurado (ver products.ts / STRIPE_FALLBACK_PRICE_CENTS).
    return redirect('/cart?error=price');
  }

  try {
    const stripe = getStripe();
    const base = siteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cancel`,
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] },
      phone_number_collection: { enabled: true },
      automatic_tax: { enabled: false }, // activar tras configurar Stripe Tax
      metadata: {
        cart: lines.map((l) => `${l.variantId}:${l.quantity}`).join(','),
        itemCount: String(lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)),
      },
    });

    if (!session.url) return redirect('/cart?error=stripe');
    return redirect(session.url, 303);
  } catch (err) {
    console.error('[stripe][checkout] error', err);
    return redirect('/cart?error=stripe');
  }
}
