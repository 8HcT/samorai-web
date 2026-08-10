import type { Route } from './+types/api.email-preview';
import { isProduction } from '~/lib/env.server';
import { renderOrderEmailPreview } from '~/lib/email/email.server';
import type { OrderRecord } from '~/lib/orders/orders.server';

/**
 * Vista previa de los correos de compra SOLO EN DESARROLLO, para poder
 * revisar el diseño sin tener que hacer una compra real.
 *
 *   /api/email-preview            → correo del cliente
 *   /api/email-preview?to=shop    → aviso interno de venta
 *
 * En producción responde 404: no debe existir como endpoint público.
 */
const SAMPLE: OrderRecord = {
  stripeSessionId: 'cs_test_a1b2c3d4e5f6g7h8I9J0KLMN',
  stripePaymentIntentId: 'pi_3Ex4mpl3Pay1nt3nt',
  amountTotalCents: 115000,
  amountSubtotalCents: 115000,
  shippingCents: 0,
  currency: 'eur',
  customerEmail: 'cliente@ejemplo.com',
  customerName: 'Ana Martín Ruiz',
  customerPhone: '+34 600 123 456',
  shippingAddress: {
    name: 'Ana Martín Ruiz',
    line1: 'Calle Mayor 14, 3º B',
    line2: 'Portal izquierda',
    postalCode: '28013',
    city: 'Madrid',
    state: 'Madrid',
    country: 'ES',
  },
  billingAddress: {
    name: 'Ana Martín Ruiz',
    line1: 'Calle Mayor 14, 3º B',
    line2: null,
    postalCode: '28013',
    city: 'Madrid',
    state: 'Madrid',
    country: 'ES',
  },
  paymentStatus: 'paid',
  lines: [
    {
      variantId: 'victoria-anthracite-grey-18x9-et45',
      productName: 'Victoria',
      quantity: 2,
      unitPriceCents: 30000,
    },
    {
      variantId: 'victoria-anthracite-grey-18x8-5-et35',
      productName: 'Victoria',
      quantity: 2,
      unitPriceCents: 27500,
    },
  ],
  createdAt: new Date().toISOString(),
};

export async function loader({ request }: Route.LoaderArgs) {
  if (isProduction()) throw new Response('Not found', { status: 404 });

  const variant = new URL(request.url).searchParams.get('to') === 'shop' ? 'shop' : 'customer';
  return new Response(renderOrderEmailPreview(SAMPLE, variant), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
