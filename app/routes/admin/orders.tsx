import type { Route } from './+types/orders';
import { Form, Link, useLocation, useNavigation, useSubmit } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { listOrders, orderFiltersFromUrl } from '~/lib/presale/admin.server';
import { loadItemsFor } from '~/lib/admin/store.server';
import { itemsSummary, type StoreItem } from '~/lib/admin/store-stats';
import { ORDER_STATUS_LABEL } from '~/lib/presale/labels';
import { formatPrice } from '~/lib/money';
import { cartOrderRef, isTestOrder } from '~/lib/orders/test-purchase';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { OrderStatusChip, StatusChip } from '~/components/admin/AdminViz';
import { IconDownload } from '~/components/admin/icons';
import { SubmitButton } from '~/components/ui/SubmitButton';

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
  const { search, pathname } = useLocation();
  const navigation = useNavigation();
  const submit = useSubmit();
  const filtering = navigation.state === 'loading' && navigation.location?.pathname === pathname;
  const toShip = orders.filter((o) => ['paid', 'in_production', 'ready_to_ship'].includes(o.status) && !o.isTest).length;
  const hasFilters = Boolean(filters.status || filters.kind || filters.q);

  return (
    <>
      <div className="admin-pagehead">
        <div>
          <h1 className="admin-title">Pedidos</h1>
          <p className="admin-sub">
            {orders.length === 1 ? '1 pedido' : `${orders.length} pedidos`}
            {toShip > 0 ? ` · ${toShip} pendiente(s) de enviar` : ''}
            {hasFilters ? ' con estos filtros' : ''}. Abre uno para pasarlo a fabricación, marcarlo como enviado,
            cancelarlo o devolver el pago.
          </p>
        </div>
        {/* Descarga directa del CSV con los mismos filtros (no es una navegación de la app). */}
        <a className="btn btn-outline btn-sm" href={`/admin/pedidos.csv${search}`} download>
          <IconDownload />
          Descargar CSV
        </a>
      </div>

      <Form method="get" className="admin-filters" role="search" aria-label="Filtrar pedidos">
        <label className="admin-field">
          Estado
          <select name="status" defaultValue={filters.status ?? ''} onChange={(e) => submit(e.currentTarget.form)}>
            <option value="">Todos</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="admin-field">
          Tipo
          <select name="kind" defaultValue={filters.kind ?? ''} onChange={(e) => submit(e.currentTarget.form)}>
            <option value="">Todos</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="admin-field admin-field--grow">
          Buscar
          <input name="q" type="search" defaultValue={filters.q ?? ''} placeholder="Código, email o nombre" enterKeyHint="search" />
        </label>
        <div className="admin-filters__actions">
          <SubmitButton className="btn btn-primary" pending={filtering} pendingText="Buscando…">Buscar</SubmitButton>
          {hasFilters && <Link to="/admin/pedidos" className="btn btn-ghost">Quitar filtros</Link>}
        </div>
      </Form>

      <section className="admin-section admin-section--flush">
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack admin-table--orders">
            <thead>
              <tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Artículos</th><th>Estado</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px 20px' }}>
                    <p className="viz-empty" style={{ margin: 0 }}>
                      {hasFilters ? 'No hay pedidos con estos filtros.' : 'Todavía no hay pedidos.'}{' '}
                      {hasFilters && <Link to="/admin/pedidos">Ver todos</Link>}
                    </p>
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="is-link">
                  <td className="c-code">
                    <Link to={`/admin/pedidos/${o.id}`} prefetch="intent">{o.code ?? cartOrderRef(o.stripe_session_id)}</Link>
                    {o.isTest && <> <StatusChip tone="neutral" size="sm">Prueba</StatusChip></>}
                    {o.review_reason && <span className="cell-sub">⚠ {o.review_reason}</span>}
                  </td>
                  <td className="c-date nowrap"><LocalDateTime iso={o.created_at} compact /></td>
                  <td className="c-customer">
                    {o.customer_name ?? '—'}
                    <span className="cell-sub">{o.customer_email ?? ''}</span>
                  </td>
                  <td className="c-items">{o.summary || '—'}</td>
                  <td className="c-status">
                    <OrderStatusChip status={o.status} size="sm" />
                    {o.tracking_number && <span className="cell-sub">{o.carrier ?? ''} {o.tracking_number}</span>}
                  </td>
                  <td className="c-total num">
                    {formatPrice(o.amount_total_cents)}
                    {o.refunded_cents > 0 && <span className="cell-sub">devuelto {formatPrice(o.refunded_cents)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
