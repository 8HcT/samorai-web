/**
 * Opciones comunes de Stripe Checkout para las ventas con envío físico
 * (carrito, compra directa y pago final de la preventa).
 */
import type Stripe from 'stripe';
import { CURRENCY } from '~/lib/money';
import { siteUrl } from '~/lib/env.server';
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

/**
 * Aspecto de la página de pago de Stripe con la identidad de SAMORAI
 * (nombre, Montserrat y esquinas rectas como la web). Botón en el negro de
 * la marca: con el dorado, Stripe pone el texto en blanco y apenas se lee.
 * El icono solo se envía con dominio https: Stripe tiene que descargarlo.
 */
export function checkoutBranding(): Stripe.Checkout.SessionCreateParams.BrandingSettings {
  const site = siteUrl().replace(/\/$/, '');
  return {
    display_name: 'SAMORAI',
    button_color: '#1D1D1D',
    background_color: '#FFFFFF',
    border_style: 'rectangular',
    font_family: 'montserrat',
    ...(site.startsWith('https://') ? { icon: { type: 'url' as const, url: `${site}/apple-touch-icon.png` } } : {}),
  };
}

/**
 * Aviso junto a la dirección: el autocompletado de Google rellena calle,
 * código postal y ciudad, pero no el piso ni la puerta (van en la línea 2,
 * que es opcional). Sin ellos el transportista puede no poder entregar.
 */
function addressHint(locale: 'es' | 'en'): string {
  return locale === 'en'
    ? 'Add your floor, door or staircase in “Address line 2” so the courier can deliver your wheels.'
    : 'Indica piso, puerta o escalera en «Línea 2 de dirección» para que el transportista pueda entregarte las llantas.';
}

/** Recogida de datos de envío y facturación para pedidos físicos. */
export function shippingCheckoutParams(locale: 'es' | 'en' = 'es'): Pick<
  Stripe.Checkout.SessionCreateParams,
  | 'billing_address_collection'
  | 'shipping_address_collection'
  | 'phone_number_collection'
  | 'shipping_options'
  | 'tax_id_collection'
  | 'custom_text'
  | 'branding_settings'
> {
  return {
    billing_address_collection: 'required',
    shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] },
    // Obligatorio en Stripe cuando se activa: el transportista lo necesita.
    phone_number_collection: { enabled: true },
    shipping_options: [freeShippingOption(locale)],
    // Casilla «Compro como empresa»: razón social y NIF/IVA para la factura.
    tax_id_collection: { enabled: true },
    custom_text: { shipping_address: { message: addressHint(locale) } },
    branding_settings: checkoutBranding(),
  };
}
