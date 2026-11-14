/**
 * Persistencia de pedidos (solo servidor).
 *
 * Si Supabase está configurado (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
 * inserta el pedido en las tablas `orders` / `order_items` (esquema en
 * `supabase/migrations/`) y deja en consola solo un resumen sin datos
 * personales. Sin Supabase (desarrollo) el pedido completo queda en consola.
 * La escritura usa la service-role key (salta RLS) y es idempotente por
 * `stripe_session_id` (unique) para tolerar reintentos del webhook.
 */
import { getSupabaseAdmin, isSupabaseConfigured } from '~/lib/supabase/server';
import { cartOrderCode } from './test-purchase';

export interface OrderLineRecord {
  variantId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  /** Detalle de la referencia (para el panel y la preparación del envío). */
  finishId?: string | null;
  finishName?: string | null;
  diameter?: number | null;
  width?: number | null;
  et?: number | null;
}

/** Dirección postal normalizada (envío o facturación). */
export interface OrderAddress {
  name: string | null;
  line1: string | null;
  line2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface OrderRecord {
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  amountTotalCents: number | null;
  /** Importe de los productos antes de envío/impuestos, si Stripe lo informa. */
  amountSubtotalCents: number | null;
  /** Coste de envío cobrado (hoy 0: envío gratuito). */
  shippingCents: number | null;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** Dirección de envío (la que hay que usar para mandar el pedido). */
  shippingAddress: OrderAddress | null;
  /** Dirección de facturación. */
  billingAddress: OrderAddress | null;
  paymentStatus: string;
  lines: OrderLineRecord[];
  createdAt: string;
  /** Compra de prueba de 1 € (ver ~/lib/orders/test-purchase). */
  isTest?: boolean;
  /** Idioma del cliente (correo de confirmación). Por defecto, castellano. */
  locale?: 'es' | 'en';
}

/**
 * Registra el pedido. Devuelve `isNew: false` cuando el pedido YA estaba
 * guardado (reintento de webhook), para que el llamante no repita efectos
 * secundarios como enviar los correos de compra.
 *
 * Sin Supabase configurado no hay forma de deduplicar: devuelve `isNew: true`
 * siempre (situación de desarrollo; en producción Supabase es obligatorio).
 */
export async function recordOrder(order: OrderRecord): Promise<{ isNew: boolean; orderId: string | null }> {
  // Sin Supabase (desarrollo) el log es el único registro del pedido.
  if (!isSupabaseConfigured()) {
    console.log('[stripe][order]', JSON.stringify(order));
    return { isNew: true, orderId: null };
  }

  // Con base de datos, el log no lleva datos personales (RGPD: minimización).
  // Basta para cruzarlo con Stripe y con la fila guardada.
  console.log(
    '[stripe][order]',
    JSON.stringify({
      session: order.stripeSessionId,
      paymentIntent: order.stripePaymentIntentId,
      amountTotalCents: order.amountTotalCents,
      paymentStatus: order.paymentStatus,
      lines: order.lines.map((l) => `${l.variantId}×${l.quantity}`),
      ...(order.isTest ? { test: true } : {}),
    })
  );

  const supabase = getSupabaseAdmin();

  // Idempotencia: si ya existe el pedido (reintento de webhook), no duplicar.
  const { data: existing, error: lookupError } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_session_id', order.stripeSessionId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  let orderId = existing?.id as string | undefined;
  const isNew = !existing;

  if (!orderId) {
    const base = {
      stripe_session_id: order.stripeSessionId,
      stripe_payment_intent_id: order.stripePaymentIntentId,
      amount_total_cents: order.amountTotalCents,
      currency: order.currency,
      customer_email: order.customerEmail,
      payment_status: order.paymentStatus,
    };
    // Columnas añadidas por la migración de preventa (panel de pedidos). Si
    // aún no está aplicada, se guarda el pedido con el formato anterior.
    const extended = {
      ...base,
      // Misma referencia que ve el cliente en el correo (#XXXXXXXX).
      code: cartOrderCode(order.stripeSessionId, Boolean(order.isTest)),
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      shipping_address: order.shippingAddress,
      billing_address: order.billingAddress,
      subtotal_cents: order.amountSubtotalCents,
      amount_paid_cents: order.amountTotalCents,
    };
    let { data, error } = await supabase.from('orders').insert(extended).select('id').single();
    if (error && (error.code === 'PGRST204' || error.code === '42703')) {
      ({ data, error } = await supabase.from('orders').insert(base).select('id').single());
    }
    if (error) throw error;
    orderId = data!.id;
  }

  // Las líneas se insertan solo si faltan: si un intento anterior guardó la
  // cabecera pero falló al insertar los items, el reintento las completa
  // (y nunca las duplica).
  if (order.lines.length > 0) {
    const { count, error: countError } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId);
    if (countError) throw countError;

    if (!count) {
      const base = order.lines.map((l) => ({
        order_id: orderId,
        variant_id: l.variantId,
        product_name: l.productName,
        quantity: l.quantity,
        unit_price_cents: l.unitPriceCents,
      }));
      // Detalle de la referencia (columnas de la migración de preventa).
      const extended = order.lines.map((l, i) => ({
        ...base[i],
        finish_id: l.finishId ?? null,
        finish_name: l.finishName ?? null,
        diameter: l.diameter ?? null,
        width: l.width ?? null,
        et: l.et ?? null,
      }));
      let { error: itemsError } = await supabase.from('order_items').insert(extended);
      if (itemsError && (itemsError.code === 'PGRST204' || itemsError.code === '42703')) {
        ({ error: itemsError } = await supabase.from('order_items').insert(base));
      }
      if (itemsError) throw itemsError;
    }
  }

  return { isNew, orderId: orderId ?? null };
}
