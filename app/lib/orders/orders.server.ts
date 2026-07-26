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

export interface OrderRecord {
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  amountTotalCents: number | null;
  currency: string;
  customerEmail: string | null;
  paymentStatus: string;
  lines: OrderLineRecord[];
  createdAt: string;
}

export async function recordOrder(order: OrderRecord): Promise<void> {
  // Registro estructurado (visible en los logs del servidor / `stripe listen`).
  console.log('[stripe][order]', JSON.stringify(order));

  // Si Supabase no está configurado, nos quedamos con el log (dev / sin BD).
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseAdmin();

  // Idempotencia: si ya existe el pedido (reintento de webhook), no duplicar.
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_session_id', order.stripeSessionId)
    .maybeSingle();
  if (existing) return;

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

  if (order.lines.length > 0) {
    const { error: itemsError } = await supabase.from('order_items').insert(
      order.lines.map((l) => ({
        order_id: data.id,
        variant_id: l.variantId,
        product_name: l.productName,
        quantity: l.quantity,
        unit_price_cents: l.unitPriceCents,
      }))
    );
    if (itemsError) throw itemsError;
  }
}
