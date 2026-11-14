import type { Route } from './+types/orders-csv';
import { requireAdmin } from '~/lib/auth/session.server';
import { listOrders, orderFiltersFromUrl, type OrderListRow } from '~/lib/presale/admin.server';
import { loadItemsFor } from '~/lib/admin/store.server';
import { itemsSummary, type StoreItem } from '~/lib/admin/store-stats';
import { ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';
import { cartOrderRef, isTestOrder } from '~/lib/orders/test-purchase';

/**
 * Exportación CSV de pedidos (mismos filtros que la lista) para contabilidad
 * y para preparar envíos. Separador «;» y BOM: se abre bien en Excel en español.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const orders = await listOrders(orderFiltersFromUrl(new URL(request.url)), 5000);
  const items = await loadItemsFor(orders.map((o) => o.id));
  const byOrder = new Map<string, StoreItem[]>();
  for (const i of items) byOrder.set(i.order_id, [...(byOrder.get(i.order_id) ?? []), i]);

  const header = [
    'pedido', 'fecha_utc', 'estado', 'tipo', 'prueba', 'cliente', 'email', 'telefono', 'direccion_envio',
    'articulos', 'unidades', 'total_eur', 'devuelto_eur', 'neto_eur', 'transportista', 'seguimiento', 'enviado_utc',
  ];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Evita inyección de fórmulas al abrirlo en una hoja de cálculo.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const euros = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);
  const address = (a: OrderListRow['shipping_address']) =>
    a ? [a.name, a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean).join(', ') : '';

  const lines = orders.map((o) => {
    const list = byOrder.get(o.id) ?? [];
    const paid = o.amount_paid_cents ?? o.amount_total_cents ?? 0;
    return [
      o.code ?? cartOrderRef(o.stripe_session_id), o.created_at, label(ORDER_STATUS_LABEL, o.status), o.kind,
      isTestOrder(o) ? 'si' : 'no', o.customer_name, o.customer_email, o.customer_phone, address(o.shipping_address),
      itemsSummary(list), list.reduce((s, i) => s + i.quantity, 0), euros(o.amount_total_cents), euros(o.refunded_cents),
      euros(paid - (o.refunded_cents ?? 0)), o.carrier, o.tracking_number, o.shipped_at,
    ].map(esc).join(';');
  });
  const csv = '﻿' + [header.join(';'), ...lines].join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
