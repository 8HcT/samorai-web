import type { Route } from './+types/api.checkout';
import { redirect } from 'react-router';
import type Stripe from 'stripe';
import { getStripe } from '~/lib/stripe/stripe.server';
import { getVariantById, getFinish } from '~/data/products';
import { CURRENCY, formatPrice } from '~/lib/money';
import { priceVariant, type PricingSnapshot } from '~/lib/pricing';
import { loadPricing } from '~/lib/pricing.server';
import { isTestVariantId } from '~/lib/orders/test-purchase';
import { startTestCheckout } from '~/lib/orders/test-checkout.server';
import { isLocale, resolveLocale, t as translations, type Locale } from '~/i18n/config';
import { formatSize, formatEt } from '~/lib/format';
import { fallbackPriceCents, siteUrl } from '~/lib/env.server';
import { shippingCheckoutParams } from '~/lib/stripe/checkout-options.server';
import { isManagedByBatches } from '~/lib/presale/offers.server';

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

  // Idioma del cliente: el del carrito (campo oculto) o, si no, el de su
  // navegador. Stripe muestra el pago en ese idioma y el correo sale en él.
  const formLocale = String(form.get('locale') ?? '');
  const locale: Locale = isLocale(formLocale)
    ? formLocale
    : resolveLocale(request.headers.get('Cookie'), request.headers.get('Accept-Language'));
  const tr = translations(locale);

  // Compra de prueba de 1 € (solo administradores, ver /admin/estado).
  if (lines.some((l) => isTestVariantId(String(l?.variantId)))) {
    return startTestCheckout(request, lines);
  }

  // Precios y promociones vigentes. Si la base de datos falla, NO se cobra:
  // podría aplicarse un precio que ya no es el correcto.
  let pricing: PricingSnapshot;
  try {
    pricing = await loadPricing({ strict: true });
  } catch {
    return redirect('/cart?error=price');
  }

  const fallback = fallbackPriceCents();
  const now = new Date();
  const charged: string[] = [];
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const summaryParts: string[] = [];
  let missingPrice = false;
  const managedChecked = new Map<string, boolean>();

  for (const line of lines) {
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 0));
    // Validación en el servidor: la referencia debe existir.
    const found = getVariantById(String(line.variantId));
    if (!found) continue;

    const { product, variant } = found;

    // Los productos con tirada de fabricación tienen stock limitado y se
    // venden por juegos desde su ficha (reserva o compra directa), nunca por
    // este carrito sin control de stock.
    if (!managedChecked.has(product.slug)) {
      managedChecked.set(product.slug, await isManagedByBatches(product));
    }
    if (managedChecked.get(product.slug)) {
      return redirect('/cart?error=managed');
    }

    // El precio lo decide SIEMPRE el servidor: precio vigente del modelo y
    // ancho (editable en /admin) menos la promoción activa, si la hay. El
    // importe del frontend nunca es autoridad.
    const price =
      priceVariant(pricing, product.slug, variant, now) ??
      (fallback != null ? { baseCents: fallback, finalCents: fallback, promotion: null } : null);
    if (!price) {
      missingPrice = true;
      continue;
    }

    const finishName = tr.finishNames[variant.finishId] ?? getFinish(product, variant.finishId)?.name ?? variant.color;
    const size = formatSize(variant.diameter, variant.width, locale);
    const promo = price.promotion;
    // Resumen para la tienda (dashboard de Stripe): siempre en castellano.
    const finishEs = getFinish(product, variant.finishId)?.name ?? variant.color;
    summaryParts.push(
      `${product.model} ${finishEs} ${formatSize(variant.diameter, variant.width)} ${formatEt(variant.et)} ×${quantity}${promo ? ` (${promo.badge} -${promo.percentOff}%)` : ''}`
    );
    charged.push(`${variant.id}:${quantity}:${price.finalCents}`);

    // Siempre price_data: el importe puede cambiar desde /admin o por una
    // promoción, así que no se usan Prices fijos de Stripe.
    lineItems.push({
      quantity,
      price_data: {
        currency: CURRENCY,
        // Importe FINAL con IVA incluido; sin impuesto añadido encima.
        unit_amount: price.finalCents,
        product_data: {
          name: `${product.name} · ${finishName} · ${size} ${formatEt(variant.et)}${promo ? ` · ${promo.badge} −${promo.percentOff}%` : ''}`,
          ...(promo
            ? {
                description:
                  locale === 'en'
                    ? `Previous price ${formatPrice(price.baseCents)} per wheel. ${promo.badge}: −${promo.percentOff}%.`
                    : `Precio anterior ${formatPrice(price.baseCents)} por llanta. ${promo.badge}: −${promo.percentOff}%.`,
              }
            : {}),
          metadata: {
            model: product.model,
            finish: finishName,
            finishId: variant.finishId,
            size,
            et: formatEt(variant.et),
            variantId: variant.id,
            taxIncluded: 'true',
            basePriceCents: String(price.baseCents),
            ...(promo ? { promotionId: promo.id, promotion: `${promo.badge} -${promo.percentOff}%` } : {}),
          },
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
      locale,
      line_items: lineItems,
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cancel`,
      ...shippingCheckoutParams(locale),
      automatic_tax: { enabled: false }, // activar tras configurar Stripe Tax
      // El resumen también en el pago, para verlo desde el dashboard de Stripe.
      payment_intent_data: {
        description: summaryParts.join('; ').slice(0, 300),
        metadata: {
          cart: charged.join(',').slice(0, 490),
        },
      },
      metadata: {
        // `cart` es la fuente autoritativa (el webhook resuelve todo desde el
        // variantId); `summary` es legible e incluye modelo/acabado/medida/ET.
        // variantId:cantidad:precioUnitarioCobrado (céntimos, con promoción).
        cart: charged.join(',').slice(0, 490),
        summary: summaryParts.join('; ').slice(0, 490),
        itemCount: String(lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)),
        // Idioma del correo de confirmación al cliente.
        locale,
      },
    });

    if (!session.url) return redirect('/cart?error=stripe');
    return redirect(session.url, 303);
  } catch (err) {
    console.error('[stripe][checkout] error', err);
    return redirect('/cart?error=stripe');
  }
}
