/**
 * Lectura de pedidos para el panel (solo servidor, service-role). Las cifras
 * se calculan en `store-stats.ts` (lógica pura).
 */
import { getSupabaseAdmin } from '~/lib/supabase/server';
import { computeStoreStats, type StoreItem, type StoreOrder } from './store-stats';

const ORDER_COLUMNS =
  'id, code, kind, status, customer_name, customer_email, amount_total_cents, amount_paid_cents, refunded_cents, created_at, stripe_session_id';
const ITEM_COLUMNS = 'order_id, variant_id, product_name, quantity, unit_price_cents, finish_name, diameter, width, et';

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return (res.data ?? []) as T;
}

/** Todos los pedidos y sus líneas (volumen de una tienda pequeña: miles, no millones). */
export async function loadStoreRows(): Promise<{ orders: StoreOrder[]; items: StoreItem[] }> {
  const db = getSupabaseAdmin();
  const [orders, items] = await Promise.all([
    db.from('orders').select(ORDER_COLUMNS).order('created_at', { ascending: false }).limit(5000),
    db.from('order_items').select(ITEM_COLUMNS).limit(20000),
  ]);
  return { orders: check(orders) as StoreOrder[], items: check(items) as StoreItem[] };
}

export async function loadStoreStats(now: Date = new Date()) {
  const { orders, items } = await loadStoreRows();
  return computeStoreStats(orders, items, now);
}

/** Líneas de un conjunto de pedidos (para la lista y el CSV). */
export async function loadItemsFor(orderIds: string[]): Promise<StoreItem[]> {
  if (orderIds.length === 0) return [];
  const db = getSupabaseAdmin();
  const out: StoreItem[] = [];
  // Por tandas: la lista de ids viaja en la URL de la petición.
  for (let i = 0; i < orderIds.length; i += 150) {
    const chunk = orderIds.slice(i, i + 150);
    out.push(...(check(await db.from('order_items').select(ITEM_COLUMNS).in('order_id', chunk)) as StoreItem[]));
  }
  return out;
}
