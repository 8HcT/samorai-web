import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { regionIfDistinct, regionName } from '~/lib/address';
import { shippingReviewReason } from '~/lib/shipping';
import { sessionAddresses } from '~/lib/orders/cart-webhook.server';

describe('provincia legible en etiquetas y correos', () => {
  it('traduce el código de Stripe en España', () => {
    expect(regionName('ES', 'M')).toBe('Madrid');
    expect(regionName('ES', 'B')).toBe('Barcelona');
    expect(regionName('ES', 'gc')).toBe('Las Palmas');
  });
  it('fuera de España lo deja tal cual', () => {
    expect(regionName('IT', 'MI')).toBe('MI');
  });
  it('no repite la ciudad («Madrid, Madrid»)', () => {
    expect(regionIfDistinct('ES', 'M', 'Madrid')).toBeNull();
    expect(regionIfDistinct('ES', 'M', 'Alcorcón')).toBe('Madrid');
  });
});

describe('destinos que se cobran pero hay que revisar antes de enviar', () => {
  it('Canarias por código postal o provincia', () => {
    expect(shippingReviewReason({ country: 'ES', postalCode: '35001', state: null })).toMatch(/Canarias/);
    expect(shippingReviewReason({ country: 'ES', postalCode: '38200', state: 'TF' })).toMatch(/Canarias/);
  });
  it('Ceuta y Melilla', () => {
    expect(shippingReviewReason({ country: 'ES', postalCode: '51001' })).toMatch(/Ceuta/);
    expect(shippingReviewReason({ country: 'ES', postalCode: '52001' })).toMatch(/Melilla/);
  });
  it('Madeira y Azores', () => {
    expect(shippingReviewReason({ country: 'PT', postalCode: '9000-018' })).toMatch(/Madeira/);
  });
  it('península, Baleares y resto de la UE: sin aviso', () => {
    expect(shippingReviewReason({ country: 'ES', postalCode: '28013', state: 'M' })).toBeNull();
    expect(shippingReviewReason({ country: 'ES', postalCode: '07001', state: 'PM' })).toBeNull();
    expect(shippingReviewReason({ country: 'PT', postalCode: '1100-148' })).toBeNull();
    expect(shippingReviewReason({ country: 'FR', postalCode: '35000' })).toBeNull();
  });
});

describe('datos de la sesión de Stripe que pasan al pedido', () => {
  const address = { city: 'Madrid', country: 'ES', line1: 'Calle Mayor, 12', line2: '3º B', postal_code: '28013', state: 'M' };
  const base = {
    collected_information: { shipping_details: { name: 'Cliente Prueba', address } },
    customer_details: { name: 'Cliente Prueba', address, email: 'c@example.com', phone: '+34612345678', business_name: null, tax_ids: [] },
  } as unknown as Stripe.Checkout.Session;

  it('particular: facturación igual que el envío (sin campos de empresa)', () => {
    const { shipping, billing } = sessionAddresses(base);
    expect(shipping).toMatchObject({ name: 'Cliente Prueba', line2: '3º B', postalCode: '28013', state: 'M' });
    expect(JSON.stringify(billing)).toBe(JSON.stringify(shipping));
  });

  it('empresa: razón social y NIF en la facturación', () => {
    const session = {
      ...base,
      customer_details: { ...base.customer_details!, business_name: 'Talleres Ejemplo SL', tax_ids: [{ type: 'es_cif', value: 'B12345678' }] },
    } as unknown as Stripe.Checkout.Session;
    const { shipping, billing } = sessionAddresses(session);
    expect(billing).toMatchObject({ company: 'Talleres Ejemplo SL', taxId: 'B12345678', line1: 'Calle Mayor, 12' });
    expect(shipping).not.toHaveProperty('company');
  });
});
