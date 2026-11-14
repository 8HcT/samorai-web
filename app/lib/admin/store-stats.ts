/**
 * Cifras de la tienda para el panel (lógica pura: sin base de datos, se
 * prueba con datos de ejemplo). Las compras de prueba (`PRUEBA-…`) y los
 * pagos en modo test de Stripe nunca cuentan en ventas, ingresos ni unidades.
 */
import { getFinish, getVariantById, products } from '~/data/products';
import { formatEt, formatSize } from '~/lib/format';
import { priceVariant, type AppliedPromotion, type PricingSnapshot } from '~/lib/pricing';
import { TEST_PRODUCT_NAME, isTestOrder, isTestOrderCode, isTestVariantId } from '~/lib/orders/test-purchase';

export interface StoreOrder {
  id: string;
  code: string | null;
  kind: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  amount_total_cents: number | null;
  amount_paid_cents: number | null;
  refunded_cents: number;
  created_at: string;
  stripe_session_id: string;
}

export interface StoreItem {
  order_id: string;
  variant_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  finish_name?: string | null;
  diameter?: number | string | null;
  width?: number | string | null;
  et?: number | null;
}

/** Estados en los que el pedido sigue pendiente de salir del almacén. */
export const TO_SHIP_STATUSES = ['paid', 'in_production', 'ready_to_ship'] as const;
const CLOSED = new Set(['cancelled', 'refunded']);

/** Fecha (AAAA-MM-DD) en hora de Madrid: los «hoy» del panel son días de Madrid. */
export function madridDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Nombre legible de una referencia: «Black Metallic · 18x9 · ET35». */
export function referenceLabel(variantId: string): string {
  if (isTestVariantId(variantId)) return TEST_PRODUCT_NAME;
  const found = getVariantById(variantId);
  if (!found) return variantId;
  const { product, variant } = found;
  const finish = getFinish(product, variant.finishId)?.name ?? variant.color;
  return `${product.name} ${finish} · ${formatSize(variant.diameter, variant.width)} · ${formatEt(variant.et)}`;
}

/**
 * Datos de una línea de pedido. Usa lo guardado en el pedido y, en pedidos
 * antiguos que no lo tienen, lo deduce del catálogo.
 */
function itemFacts(item: StoreItem): { finish: string | null; size: string | null; et: string | null } {
  const found = getVariantById(item.variant_id);
  const finish = item.finish_name ?? (found ? getFinish(found.product, found.variant.finishId)?.name ?? found.variant.color : null);
  const diameter = item.diameter != null ? Number(item.diameter) : found?.variant.diameter ?? null;
  const width = item.width != null ? Number(item.width) : found?.variant.width ?? null;
  const et = item.et ?? found?.variant.et ?? null;
  return {
    finish,
    size: diameter != null && width != null ? formatSize(diameter, width) : null,
    et: et != null ? formatEt(et) : null,
  };
}

/** Título y detalle de una línea de pedido para el panel. */
export function describeOrderItem(item: StoreItem): { title: string; detail: string } {
  if (isTestVariantId(item.variant_id)) {
    return { title: TEST_PRODUCT_NAME, detail: 'Referencia de prueba · no se envía' };
  }
  const f = itemFacts(item);
  return {
    title: `${item.product_name}${f.finish ? ` · ${f.finish}` : ''}`,
    detail: [f.size, f.et, item.variant_id].filter(Boolean).join(' · '),
  };
}

/** Resumen corto de los artículos de un pedido: «4× Victoria Black Metallic 18x9 ET35». */
export function itemsSummary(items: StoreItem[]): string {
  return items
    .map((i) => {
      if (isTestVariantId(i.variant_id)) return `${i.quantity}× prueba 1 €`;
      const f = itemFacts(i);
      return `${i.quantity}× ${[i.product_name, f.finish, f.size, f.et].filter(Boolean).join(' ')}`;
    })
    .join(', ');
}

function paidCents(o: StoreOrder): number {
  return o.amount_paid_cents ?? o.amount_total_cents ?? 0;
}

export interface ReferenceSales {
  variantId: string;
  label: string;
  units: number;
  revenueCents: number;
}

export interface StoreStats {
  orders: { today: number; last7: number; last30: number; total: number; cancelled: number };
  /** Cobrado menos devuelto (lo que de verdad ha entrado). */
  netRevenueCents: number;
  netRevenue30Cents: number;
  refundedCents: number;
  unitsSold: number;
  averageOrderCents: number | null;
  /** Pedidos por estado de preparación/envío. */
  pipeline: { paid: number; inProduction: number; readyToShip: number; shipped: number; delivered: number };
  toShip: number;
  byReference: ReferenceSales[];
  byFinish: { label: string; units: number }[];
  recent: (StoreOrder & { summary: string; isTest: boolean })[];
  lastTest: (StoreOrder & { summary: string }) | null;
}

export function computeStoreStats(orders: StoreOrder[], items: StoreItem[], now: Date = new Date()): StoreStats {
  const itemsByOrder = new Map<string, StoreItem[]>();
  for (const i of items) {
    const list = itemsByOrder.get(i.order_id) ?? [];
    list.push(i);
    itemsByOrder.set(i.order_id, list);
  }

  const real = orders.filter((o) => !isTestOrder(o));
  const today = madridDayKey(now);
  const ms = (days: number) => now.getTime() - days * 86_400_000;
  const createdAt = (o: StoreOrder) => new Date(o.created_at).getTime();

  const net = (list: StoreOrder[]) => list.reduce((s, o) => s + paidCents(o) - (o.refunded_cents ?? 0), 0);
  const active = real.filter((o) => !CLOSED.has(o.status));

  const byRef = new Map<string, ReferenceSales>();
  const byFinish = new Map<string, number>();
  let unitsSold = 0;
  for (const o of active) {
    for (const i of itemsByOrder.get(o.id) ?? []) {
      unitsSold += i.quantity;
      const ref = byRef.get(i.variant_id) ?? { variantId: i.variant_id, label: referenceLabel(i.variant_id), units: 0, revenueCents: 0 };
      ref.units += i.quantity;
      ref.revenueCents += i.unit_price_cents * i.quantity;
      byRef.set(i.variant_id, ref);
      const finish = itemFacts(i).finish ?? i.product_name;
      byFinish.set(finish, (byFinish.get(finish) ?? 0) + i.quantity);
    }
  }

  const count = (status: string) => real.filter((o) => o.status === status).length;
  const withSummary = (o: StoreOrder) => ({ ...o, summary: itemsSummary(itemsByOrder.get(o.id) ?? []) });
  const sorted = [...orders].sort((a, b) => createdAt(b) - createdAt(a));
  const lastTest = sorted.find((o) => isTestOrderCode(o.code));

  return {
    orders: {
      today: real.filter((o) => madridDayKey(new Date(o.created_at)) === today).length,
      last7: real.filter((o) => createdAt(o) >= ms(7)).length,
      last30: real.filter((o) => createdAt(o) >= ms(30)).length,
      total: real.length,
      cancelled: real.filter((o) => CLOSED.has(o.status)).length,
    },
    netRevenueCents: net(real),
    netRevenue30Cents: net(real.filter((o) => createdAt(o) >= ms(30))),
    refundedCents: real.reduce((s, o) => s + (o.refunded_cents ?? 0), 0),
    unitsSold,
    averageOrderCents: active.length > 0 ? Math.round(active.reduce((s, o) => s + paidCents(o), 0) / active.length) : null,
    pipeline: {
      paid: count('paid'),
      inProduction: count('in_production'),
      readyToShip: count('ready_to_ship'),
      shipped: count('shipped'),
      delivered: count('delivered'),
    },
    toShip: real.filter((o) => (TO_SHIP_STATUSES as readonly string[]).includes(o.status)).length,
    byReference: [...byRef.values()].sort((a, b) => b.units - a.units || b.revenueCents - a.revenueCents),
    byFinish: [...byFinish.entries()].map(([label, units]) => ({ label, units })).sort((a, b) => b.units - a.units),
    recent: sorted.slice(0, 8).map((o) => ({ ...withSummary(o), isTest: isTestOrder(o) })),
    lastTest: lastTest ? withSummary(lastTest) : null,
  };
}

export interface ReferencePrice {
  variantId: string;
  productName: string;
  finishName: string;
  size: string;
  et: string;
  baseCents: number | null;
  finalCents: number | null;
  promotion: AppliedPromotion | null;
}

/** Precio vigente de cada referencia a la venta (con la promoción aplicada). */
export function referencePrices(snapshot: PricingSnapshot, now: Date = new Date()): ReferencePrice[] {
  return products
    .filter((p) => p.status === 'active')
    .flatMap((product) =>
      product.variants.map((v) => {
        const price = priceVariant(snapshot, product.slug, v, now);
        return {
          variantId: v.id,
          productName: product.name,
          finishName: getFinish(product, v.finishId)?.name ?? v.color,
          size: formatSize(v.diameter, v.width),
          et: formatEt(v.et),
          baseCents: price?.baseCents ?? null,
          finalCents: price?.finalCents ?? null,
          promotion: price?.promotion ?? null,
        };
      })
    );
}
