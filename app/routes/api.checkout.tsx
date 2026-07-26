import type { Route } from './+types/api.checkout';
import { redirect } from 'react-router';
import type Stripe from 'stripe';
import { getStripe } from '~/lib/stripe/stripe.server';
import { getVariantById, getFinish } from '~/data/products';
import { CURRENCY } from '~/lib/money';
import { unitPriceCentsForWidth, priceTierKeyForWidth } from '~/lib/pricing';
import { formatSize, formatEt } from '~/lib/format';
import { fallbackPriceCents, siteUrl, stripePriceId } from '~/lib/env.server';

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
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const summaryParts: string[] = [];
  let missingPrice = false;

  for (const line of lines) {
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 0));
    // Validación en el servidor: la referencia debe existir.
    const found = getVariantById(String(line.variantId));
    if (!found) continue;

    const { product, variant } = found;

    // El precio lo decide SIEMPRE el servidor a partir del ancho de la
    // referencia (IVA incluido). El importe del frontend nunca es autoridad.
    const expected = unitPriceCentsForWidth(variant.width);
    const unitAmount = variant.priceCents ?? expected ?? fallback;

    // Coherencia: el precio guardado debe coincidir con la regla de ancho.
    if (unitAmount == null || (variant.priceCents != null && variant.priceCents !== expected)) {
      missingPrice = true;
      continue;
    }

    const finishName = getFinish(product, variant.finishId)?.name ?? variant.color;
    const size = formatSize(variant.diameter, variant.width);
    summaryParts.push(`${product.model} ${finishName} ${size} ${formatEt(variant.et)} ×${quantity}`);

    // Si hay un Price real de Stripe para este nivel, se usa su ID (fuente de
    // verdad en Stripe). Si no, se cae a price_data con el importe del servidor.
    const priceId = stripePriceId(priceTierKeyForWidth(variant.width));
    if (priceId) {
      lineItems.push({ price: priceId, quantity });
    } else {
      lineItems.push({
        quantity,
        price_data: {
          currency: CURRENCY,
          // Importe FINAL con IVA incluido; sin impuesto añadido encima.
          unit_amount: expected,
          product_data: {
            name: `${product.name} · ${finishName} · ${size} ${formatEt(variant.et)}`,
            metadata: {
              model: product.model,
              finish: finishName,
              finishId: variant.finishId,
              size,
              et: formatEt(variant.et),
              variantId: variant.id,
              taxIncluded: 'true',
            },
          },
        },
      });
    }
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
        // `cart` es la fuente autoritativa (el webhook resuelve todo desde el
        // variantId); `summary` es legible e incluye modelo/acabado/medida/ET.
        cart: lines.map((l) => `${l.variantId}:${l.quantity}`).join(','),
        summary: summaryParts.join('; ').slice(0, 490),
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
