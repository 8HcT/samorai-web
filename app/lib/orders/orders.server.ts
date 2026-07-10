/**
 * Persistencia de pedidos (solo servidor).
 *
 * Hoy registra el pedido por consola de forma estructurada. El punto de
 * enganche para guardarlo en Supabase está marcado abajo — el esquema de
 * tablas está en `app/lib/orders/schema.sql`. Supabase aún no está
 * implementado en este proyecto (ver app/lib/supabase/client.ts), por eso
 * se deja como TODO de configuración manual.
 */

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

  // TODO (config manual · Supabase):
  //   1. npm install @supabase/supabase-js
  //   2. Definir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env
  //   3. Aplicar app/lib/orders/schema.sql en el proyecto Supabase
  //   4. Descomentar e implementar la inserción, p. ej.:
  //
  //   const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  //   const { data, error } = await supabase
  //     .from('orders')
  //     .insert({
  //       stripe_session_id: order.stripeSessionId,
  //       stripe_payment_intent_id: order.stripePaymentIntentId,
  //       amount_total_cents: order.amountTotalCents,
  //       currency: order.currency,
  //       customer_email: order.customerEmail,
  //       payment_status: order.paymentStatus,
  //     })
  //     .select('id')
  //     .single();
  //   if (error) throw error;
  //   await supabase.from('order_items').insert(
  //     order.lines.map((l) => ({ order_id: data.id, ...l }))
  //   );
}
