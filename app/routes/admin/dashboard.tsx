import type { Route } from './+types/dashboard';
import { Link } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { loadDashboard } from '~/lib/presale/admin.server';
import { BATCH_STATUS_LABEL, label } from '~/lib/presale/labels';
import { StatusChip, StockBar } from '~/components/admin/AdminViz';
import { DemandPanels, KpiPanel } from '~/components/admin/DemandPanels';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadDashboard();
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { stats, batches, alerts } = loaderData;
  return (
    <>
      <h1 className="admin-title">Panel</h1>
      <p className="admin-sub">Todas las tiradas. «Cobrado» es dinero recibido; «potencial» depende de que las reservas se completen.</p>

      {(alerts.needsReview > 0 || alerts.depositDecisions > 0 || alerts.heldEmails > 0 || alerts.failedEmails > 0 || alerts.failedStripeEvents > 0) && (
        <section className="admin-section" aria-label="Avisos">
          <h2>Requiere atención</h2>
          <div className="admin-actions">
            {alerts.needsReview > 0 && (
              <Link to="/admin/reservas?status=needs_review"><StatusChip tone="critical">{alerts.needsReview} reserva(s) en revisión</StatusChip></Link>
            )}
            {alerts.depositDecisions > 0 && (
              <Link to="/admin/reservas?status=expired"><StatusChip tone="warning">{alerts.depositDecisions} reserva(s) abonada(s) pendientes de decisión</StatusChip></Link>
            )}
            {alerts.heldEmails > 0 && (
              <Link to="/admin/correos?status=held"><StatusChip tone="warning">{alerts.heldEmails} correo(s) automático(s) retenido(s)</StatusChip></Link>
            )}
            {alerts.failedEmails > 0 && (
              <Link to="/admin/correos?status=failed"><StatusChip tone="critical">{alerts.failedEmails} correo(s) con error</StatusChip></Link>
            )}
            {alerts.failedStripeEvents > 0 && (
              <StatusChip tone="critical">{alerts.failedStripeEvents} evento(s) de Stripe fallidos (Stripe los reintenta)</StatusChip>
            )}
          </div>
        </section>
      )}

      <section className="admin-section">
        <h2>Indicadores</h2>
        <KpiPanel stats={stats} />
      </section>

      <section className="admin-section">
        <h2>Tiradas</h2>
        {batches.length === 0 ? (
          <p className="viz-empty">
            No hay tiradas. <Link to="/admin/tiradas">Crear la primera</Link>.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--stack">
              <thead>
                <tr><th>Tirada</th><th>Estado</th><th style={{ minWidth: 320 }}>Stock (juegos)</th></tr>
              </thead>
              <tbody>
                {batches.map(({ batch, inventory }) => (
                  <tr key={batch.id}>
                    <td>
                      <Link to={`/admin/tiradas/${batch.id}`}>{batch.name}</Link>
                      <div className="admin-muted">{batch.code}</div>
                    </td>
                    <td>{label(BATCH_STATUS_LABEL, batch.status)}</td>
                    <td>
                      <StockBar
                        capacity={inventory.capacity_sets}
                        available={inventory.available_sets}
                        segments={[
                          { key: 'sold', label: 'Vendidos', value: inventory.sold_sets },
                          { key: 'reserved', label: 'Reservados', value: inventory.reserved_sets },
                          { key: 'held', label: 'En checkout', value: inventory.held_sets },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Demanda (reservas pagadas y ventas directas)</h2>
        <DemandPanels stats={stats} />
      </section>
    </>
  );
}
