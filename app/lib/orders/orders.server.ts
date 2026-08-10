/**
 * Persistencia de pedidos (solo servidor).
 *
 * Siempre registra el pedido por consola. Si Supabase está configurado
 * (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), además lo inserta en las
 * tablas `orders` / `order_items` (esquema en `app/lib/orders/schema.sql`).
 * La escritura usa la service-role key (salta RLS) y es idempotente por
 * `stripe_session_id` (unique) para tolerar reintentos del webhook.
 */
import { getSupabaseAdmin, isSupabaseConfigured } from '~/lib/supabase/server';

export interface OrderLineRecord {
  variantId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
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
}

/**
 * Registra el pedido. Devuelve `isNew: false` cuando el pedido YA estaba
 * guardado (reintento de webhook), para que el llamante no repita efectos
 * secundarios como enviar los correos de compra.
 *
 * Sin Supabase configurado no hay forma de deduplicar: devuelve `isNew: true`
 * siempre (situación de desarrollo; en producción Supabase es obligatorio).
 */
export async function recordOrder(order: OrderRecord): Promise<{ isNew: boolean }> {
  // Registro estructurado (visible en los logs del servidor / `stripe listen`).
  console.log('[stripe][order]', JSON.stringify(order));

  // Si Supabase no está configurado, nos quedamos con el log (dev / sin BD).
  if (!isSupabaseConfigured()) return { isNew: true };

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
    const { data, error } = await supabase
      .from('orders')
      .insert({
        stripe_session_id: order.stripeSessionId,
        stripe_payment_intent_id: order.stripePaymentIntentId,
        amount_total_cents: order.amountTotalCents,
        currency: order.currency,
        customer_email: order.customerEmail,
        payment_status: order.paymentStatus,
      })
      .select('id')
      .single();
    if (error) throw error;
    orderId = data.id;
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
      const { error: itemsError } = await supabase.from('order_items').insert(
        order.lines.map((l) => ({
          order_id: orderId,
          variant_id: l.variantId,
          product_name: l.productName,
          quantity: l.quantity,
          unit_price_cents: l.unitPriceCents,
        }))
      );
      if (itemsError) throw itemsError;
    }
  }

  return { isNew };
}
