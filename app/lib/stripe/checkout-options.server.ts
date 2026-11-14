/**
 * Opciones comunes de Stripe Checkout para las ventas con envío físico
 * (carrito, compra directa y pago final de la preventa).
 */
import type Stripe from 'stripe';
import { CURRENCY } from '~/lib/money';
import { SHIPPING_COST_CENTS, SHIPPING_COUNTRIES } from '~/lib/shipping';

export { SHIPPING_COUNTRIES };

/**
 * Envío gratuito: se declara explícitamente para que el cliente vea en el
 * checkout que el precio con IVA es el total, sin cargos añadidos.
 */
export function freeShippingOption(locale: 'es' | 'en' = 'es'): Stripe.Checkout.SessionCreateParams.ShippingOption {
  return {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: SHIPPING_COST_CENTS, currency: CURRENCY },
      display_name: locale === 'en' ? 'Free shipping' : 'Envío gratuito',
    },
  };
}

/** Recogida de datos de envío y facturación para pedidos físicos. */
export function shippingCheckoutParams(locale: 'es' | 'en' = 'es'): Pick<
  Stripe.Checkout.SessionCreateParams,
  'billing_address_collection' | 'shipping_address_collection' | 'phone_number_collection' | 'shipping_options'
> {
  return {
    billing_address_collection: 'required',
    shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] },
    phone_number_collection: { enabled: true },
    shipping_options: [freeShippingOption(locale)],
  };
}
