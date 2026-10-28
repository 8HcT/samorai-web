import type { Route } from './+types/reservations';
import { Form, Link } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { catalogProducts, listBatches, listReservations, reservationFiltersFromUrl } from '~/lib/presale/admin.server';
import { DEPOSIT_STATUS_LABEL, RESERVATION_STATUS_LABEL, label } from '~/lib/presale/labels';
import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const filters = reservationFiltersFromUrl(url);
  const [reservations, batches] = await Promise.all([listReservations(filters), listBatches()]);
  return { reservations, filters, batches: batches.map(({ batch }) => ({ id: batch.id, name: batch.name })), products: catalogProducts(), query: url.search };
}

const STATUSES = ['active', 'pending_deposit', 'confirmed', 'balance_due', 'balance_processing', 'completed', 'expired', 'cancelled', 'needs_review', 'abandoned'];

export default function AdminReservations({ loaderData }: Route.ComponentProps) {
  const { reservations, filters, batches, products, query } = loaderData;
  const finishes = products.flatMap((p) => p.finishes);
  const widths = [...new Set(products.flatMap((p) => p.variants.map((v) => v.width)))].sort((a, b) => a - b);
  const ets = [...new Set(products.flatMap((p) => p.variants.map((v) => v.et)))].sort((a, b) => a - b);
  const totals = reservations.reduce(
    (acc, r) => {
      const paid = r.deposit_status !== 'unpaid';
      acc.sets += r.quantity_sets;
      acc.paid += paid ? r.deposit_cents : 0;
      acc.pending += ['confirmed', 'balance_due', 'balance_processing'].includes(r.status) ? r.balance_cents : 0;
      return acc;
    },
    { sets: 0, paid: 0, pending: 0 }
  );

  return (
    <>
      <h1 className="admin-title">Reservas</h1>
      <p className="admin-sub">{reservations.length} resultado(s) · {totals.sets} juego(s) · reservas abonadas {formatPrice(totals.paid)} · pendiente de cobro {formatPrice(totals.pending)}</p>

      <Form method="get" className="admin-filters">
        <label className="admin-field">Tirada
          <select name="batch" defaultValue={filters.batch ?? ''}>
            <option value="">Todas</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="admin-field">Modelo
          <select name="product" defaultValue={filters.product ?? ''}>
            <option value="">Todos</option>
            {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
        <label className="admin-field">Color
          <select name="finish" defaultValue={filters.finish ?? ''}>
            <option value="">Todos</option>
            {finishes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="admin-field">Ancho
          <select name="width" defaultValue={filters.width ?? ''}>
            <option value="">Todos</option>
            {widths.map((w) => <option key={w} value={w}>{formatSize(18, w)}</option>)}
          </select>
        </label>
        <label className="admin-field">ET
          <select name="et" defaultValue={filters.et ?? ''}>
            <option value="">Todos</option>
            {ets.map((e) => <option key={e} value={e}>{formatEt(e)}</option>)}
          </select>
        </label>
        <label className="admin-field">Estado
          <select name="status" defaultValue={filters.status ?? ''}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'active' ? 'Activas' : label(RESERVATION_STATUS_LABEL, s)}</option>)}
          </select>
        </label>
        <label className="admin-field">Buscar
          <input name="q" defaultValue={filters.q ?? ''} placeholder="Código, email o nombre" />
        </label>
        <button type="submit" className="btn btn-outline btn-sm">Filtrar</button>
        <a href={`/admin/reservas.csv${query}`} className="btn btn-ghost btn-sm">Exportar CSV</a>
      </Form>

      <div className="admin-table-wrap admin-section" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reserva</th><th>Cliente</th><th>Configuración</th><th className="num">Juegos</th>
              <th>Estado</th><th className="num">Abonado</th><th className="num">Pendiente</th><th>Fecha límite</th>
            </tr>
          </thead>
          <tbody>
            {reservations.length === 0 && (
              <tr><td colSpan={8} className="admin-muted">No hay reservas con estos filtros.</td></tr>
            )}
            {reservations.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/admin/reservas/${r.id}`}>{r.code}</Link>
                  <div className="admin-muted"><LocalDateTime iso={r.created_at} dateOnly /> · {r.production_batches?.name}</div>
                </td>
                <td>{r.customer_name ?? '—'}<div className="admin-muted">{r.email ?? 'datos borrados (RGPD)'}</div></td>
                <td>
                  {r.product_name} · {r.finish_name}
                  <div className="admin-muted">
                    {formatSize(Number(r.diameter), Number(r.width))} {formatEt(r.et)}
                    {r.vehicle_make ? ` · ${r.vehicle_make} ${r.vehicle_model ?? ''}` : ''}
                    {r.config_review_status !== 'pending' ? ` · config. ${r.config_review_status === 'approved' ? 'validada' : 'rechazada'}` : ''}
                  </div>
                </td>
                <td className="num">{r.quantity_sets}</td>
                <td>{label(RESERVATION_STATUS_LABEL, r.status)}<div className="admin-muted">{label(DEPOSIT_STATUS_LABEL, r.deposit_status)}</div></td>
                <td className="num">{r.deposit_status === 'unpaid' ? '—' : formatPrice(r.deposit_cents)}</td>
                <td className="num">{['confirmed', 'balance_due', 'balance_processing'].includes(r.status) ? formatPrice(r.balance_cents) : '—'}</td>
                <td>{r.balance_due_at ? <LocalDateTime iso={r.balance_due_at} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
