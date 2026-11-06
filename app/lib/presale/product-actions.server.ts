/**
 * Acción de la ficha de producto: «Reservar mi juego» y «Comprar ahora».
 * Todo lo que llega del formulario se trata como no fiable: solo se usan el
 * id de la referencia, el número de juegos y los datos de contacto; precios,
 * descuentos y stock se resuelven en el servidor y en PostgreSQL.
 */
import { data, redirect } from 'react-router';
import { getProductBySlug } from '~/data/products';
import { getSessionUser } from '~/lib/auth/session.server';
import { assertSameOrigin, cleanText, clientFingerprint, normalizeEmail } from '~/lib/security.server';
import { assertPresaleEnabled } from './config.server';
import { startDirectCheckout, startReservationCheckout, type CheckoutResult } from './checkout.server';

export interface PurchaseActionData {
  intent: 'reserve' | 'buy';
  error: string;
  max?: number;
  available?: number;
}

function parseSets(value: FormDataEntryValue | null): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) ? n : 0;
}

export async function handleProductPurchase(request: Request, slug: string) {
  assertPresaleEnabled();
  assertSameOrigin(request);
  const product = getProductBySlug(slug);
  if (!product) throw new Response('Producto no encontrado', { status: 404 });

  const form = await request.formData();
  const intent = form.get('intent') === 'buy' ? 'buy' : 'reserve';
  const fail = (error: string, extra: Partial<PurchaseActionData> = {}) =>
    data<PurchaseActionData>({ intent, error, ...extra }, { status: 400 });

  // Honeypot: un bot rellena el campo oculto.
  if (String(form.get('company') ?? '').trim() !== '') return fail('unavailable');

  const variantId = String(form.get('variantId') ?? '').slice(0, 120);
  const sets = parseSets(form.get('sets'));
  const { user } = await getSessionUser(request);
  const fingerprint = clientFingerprint(request);

  let result: CheckoutResult;
  if (intent === 'reserve') {
    const email = normalizeEmail(form.get('email')) ?? (user?.email ? normalizeEmail(user.email) : null);
    if (!email) return fail('email_required');

    const rawYear = String(form.get('vehicleYear') ?? '').trim();
    let vehicleYear: number | null = null;
    if (rawYear) {
      vehicleYear = Number.parseInt(rawYear, 10);
      if (!Number.isInteger(vehicleYear) || vehicleYear < 1950 || vehicleYear > 2100) return fail('invalid_vehicle');
    }

    result = await startReservationCheckout({
      product,
      variantId,
      sets,
      acceptedTerms: form.get('acceptTerms') === 'on',
      userId: user?.id ?? null,
      clientFingerprint: fingerprint,
      contact: {
        email,
        customerName: cleanText(form.get('name'), 120),
        phone: cleanText(form.get('phone'), 40),
        vehicleMake: cleanText(form.get('vehicleMake'), 60),
        vehicleModel: cleanText(form.get('vehicleModel'), 80),
        vehicleYear,
        locale: 'es',
      },
    });
  } else {
    result = await startDirectCheckout({
      product,
      variantId,
      sets,
      email: user?.email ?? null,
      userId: user?.id ?? null,
      clientFingerprint: fingerprint,
    });
  }

  if (result.ok) return redirect(result.url, 303);
  return fail(result.error, { max: result.max, available: result.available });
}
