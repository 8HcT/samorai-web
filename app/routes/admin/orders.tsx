import type { Route } from './+types/orders';
import { Form, Link, useLocation } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { listOrders, orderFiltersFromUrl } from '~/lib/presale/admin.server';
import { loadItemsFor } from '~/lib/admin/store.server';
import { itemsSummary, type StoreItem } from '~/lib/admin/store-stats';
import { ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';
import { formatPrice } from '~/lib/money';
import { cartOrderRef, isTestOrder } from '~/lib/orders/test-purchase';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { StatusChip } from '~/components/admin/AdminViz';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const filters = orderFiltersFromUrl(new URL(request.url));
  const orders = await listOrders(filters);
  const items = await loadItemsFor(orders.map((o) => o.id));
  const byOrder = new Map<string, StoreItem[]>();
  for (const i of items) byOrder.set(i.order_id, [...(byOrder.get(i.order_id) ?? []), i]);
  return {
    orders: orders.map((o) => ({
      ...o,
      summary: itemsSummary(byOrder.get(o.id) ?? []),
      isTest: isTestOrder(o),
    })),
    filters,
  };
}

const KIND_LABEL: Record<string, string> = { cart: 'Tienda', direct: 'Venta directa', presale: 'Preventa', test: 'Compras de prueba' };

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { orders, filters } = loaderData;
  const { search } = useLocation();
  const toShip = orders.filter((o) => ['paid', 'in_production', 'ready_to_ship'].includes(o.status) && !o.isTest).length;

  return (
    <>
      <h1 className="admin-title">Pedidos</h1>
      <p className="admin-sub">
        {orders.length} pedido(s){toShip > 0 ? ` · ${toShip} pendiente(s) de enviar` : ''}. Abre uno para pasarlo a fabricación,
        marcarlo como enviado (con nº de seguimiento), cancelarlo o devolver el pago.
      </p>
      <Form method="get" className="admin-filters">
        <label className="admin-field">Estado
          <select name="status" defaultValue={filters.status ?? ''}>
            <option value="">Todos</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="admin-field">Tipo
          <select name="kind" defaultValue={filters.kind ?? ''}>
            <option value="">Todos</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="admin-field">Buscar<input name="q" defaultValue={filters.q ?? ''} placeholder="Código, email o nombre" /></label>
        <button type="submit" className="btn btn-outline btn-sm">Filtrar</button>
        {/* Descarga directa del CSV con los mismos filtros (no es una navegación de la app). */}
        <a className="btn btn-ghost btn-sm" href={`/admin/pedidos.csv${search}`} download>Descargar CSV</a>
      </Form>
      <div className="admin-table-wrap admin-section" style={{ padding: 0 }}>
        <table className="admin-table admin-table--stack">
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Artículos</th><th>Estado</th><th className="num">Total</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={6} className="admin-muted">No hay pedidos con estos filtros.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/admin/pedidos/${o.id}`}>{o.code ?? cartOrderRef(o.stripe_session_id)}</Link>
                  {o.isTest && <div><StatusChip tone="neutral">Prueba</StatusChip></div>}
                  {o.review_reason && <div className="admin-muted">⚠ {o.review_reason}</div>}
                </td>
                <td><LocalDateTime iso={o.created_at} /></td>
                <td>{o.customer_name ?? '—'}<div className="admin-muted">{o.customer_email ?? ''}</div></td>
                <td>{o.summary || '—'}</td>
                <td>
                  {label(ORDER_STATUS_LABEL, o.status)}
                  {o.tracking_number && <div className="admin-muted">{o.carrier ?? ''} {o.tracking_number}</div>}
                </td>
                <td className="num">
                  {formatPrice(o.amount_total_cents)}
                  {o.refunded_cents > 0 && <div className="admin-muted">devuelto {formatPrice(o.refunded_cents)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
