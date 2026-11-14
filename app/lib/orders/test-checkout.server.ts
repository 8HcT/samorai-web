/**
 * Checkout de la compra de prueba (1 €). Lo lanza un administrador desde
 * /admin/estado y pasa por /api/checkout, igual que un carrito real.
 */
import { redirect } from 'react-router';
import type Stripe from 'stripe';
import { requireAdmin } from '~/lib/auth/session.server';
import { siteUrl } from '~/lib/env.server';
import { CURRENCY } from '~/lib/money';
import { assertSameOrigin } from '~/lib/security.server';
import { shippingCheckoutParams } from '~/lib/stripe/checkout-options.server';
import { getStripe } from '~/lib/stripe/stripe.server';
import { TEST_PRICE_CENTS, TEST_PRODUCT_NAME, TEST_VARIANT_ID, isTestVariantId } from './test-purchase';

const LOGIN = '/cuenta/acceso?next=%2Fadmin%2Festado';

export async function startTestCheckout(
  request: Request,
  lines: { variantId?: unknown; quantity?: unknown }[],
  stripe: () => Stripe = getStripe
): Promise<Response> {
  // Solo desde un formulario de la propia web (no desde otra página).
  assertSameOrigin(request);

  // Solo un administrador puede comprar la referencia de prueba.
  let email: string | undefined;
  try {
    const { user } = await requireAdmin(request);
    email = user.email ?? undefined;
  } catch {
    return redirect(LOGIN);
  }

  // La prueba va sola: nunca mezclada con llantas reales.
  if (lines.length !== 1 || !isTestVariantId(String(lines[0]?.variantId))) {
    return redirect('/admin/estado?prueba=error');
  }

  const base = siteUrl();
  const cart = `${TEST_VARIANT_ID}:1:${TEST_PRICE_CENTS}`;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      ...(email ? { customer_email: email } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: TEST_PRICE_CENTS,
            product_data: {
              name: TEST_PRODUCT_NAME,
              description: 'Verificación del sistema de pagos. No se envía nada y se devuelve desde el panel.',
              metadata: { variantId: TEST_VARIANT_ID, test: '1' },
            },
          },
        },
      ],
      // Mismo formulario que una compra real (dirección, teléfono, envío).
      ...shippingCheckoutParams(),
      automatic_tax: { enabled: false },
      success_url: `${base}/admin/estado?prueba={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/admin/estado?prueba=cancelada`,
      payment_intent_data: {
        description: 'Compra de prueba SAMORAI (verificación del sistema)',
        metadata: { cart, test: '1' },
      },
      metadata: { cart, summary: 'Compra de prueba 1 €', itemCount: '1', test: '1' },
    });
    if (!session.url) return redirect('/admin/estado?prueba=error');
    return redirect(session.url, 303);
  } catch (err) {
    console.error('[stripe][checkout][prueba] error', err);
    return redirect('/admin/estado?prueba=error');
  }
}
