import type { Route } from './+types/orders';
import { Form, Link } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { listOrders } from '~/lib/presale/admin.server';
import { ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';
import { formatPrice } from '~/lib/money';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const filters = {
    status: url.searchParams.get('status') || null,
    kind: url.searchParams.get('kind') || null,
    q: url.searchParams.get('q') || null,
  };
  return { orders: await listOrders(filters), filters };
}

const KIND_LABEL: Record<string, string> = { cart: 'Carrito', direct: 'Venta directa', presale: 'Preventa' };

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { orders, filters } = loaderData;
  return (
    <>
      <h1 className="admin-title">Pedidos</h1>
      <p className="admin-sub">{orders.length} pedido(s). Los de preventa se crean al cobrarse el pago final.</p>
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
      </Form>
      <div className="admin-table-wrap admin-section" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente</th><th>Estado</th><th className="num">Total</th><th>Fecha</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={6} className="admin-muted">No hay pedidos.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/admin/pedidos/${o.id}`}>{o.code ?? o.stripe_session_id.slice(-8).toUpperCase()}</Link>
                  {o.review_reason && <div className="admin-muted">⚠ {o.review_reason}</div>}
                </td>
                <td>{KIND_LABEL[o.kind] ?? o.kind}</td>
                <td>{o.customer_name ?? '—'}<div className="admin-muted">{o.customer_email ?? ''}</div></td>
                <td>{label(ORDER_STATUS_LABEL, o.status)}</td>
                <td className="num">{formatPrice(o.amount_total_cents)}{o.refunded_cents > 0 && <div className="admin-muted">devuelto {formatPrice(o.refunded_cents)}</div>}</td>
                <td><LocalDateTime iso={o.created_at} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
