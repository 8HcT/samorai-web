import type { Route } from './+types/dashboard';
import { Suspense } from 'react';
import { Await, Link } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { loadDashboard } from '~/lib/presale/admin.server';
import { presaleEnabled } from '~/lib/presale/config.server';
import { BATCH_STATUS_LABEL, label } from '~/lib/presale/labels';
import { loadStoreStats } from '~/lib/admin/store.server';
import { referencePrices } from '~/lib/admin/store-stats';
import { PriceTable } from '~/components/admin/PriceTable';
import { healthSummary, runHealthChecks } from '~/lib/admin/health.server';
import { loadPricing } from '~/lib/pricing.server';
import { formatPrice } from '~/lib/money';
import { cartOrderRef } from '~/lib/orders/test-purchase';
import { BarList, HeroFigure, OrderStatusChip, StatTile, StatusChip, StockBar } from '~/components/admin/AdminViz';
import { DemandPanels, KpiPanel } from '~/components/admin/DemandPanels';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const now = new Date();
  const [store, pricing, presale] = await Promise.all([
    loadStoreStats(now).catch((err) => {
      console.error('[admin][panel] no se pudieron leer los pedidos', err);
      return null;
    }),
    loadPricing(),
    presaleEnabled() ? loadDashboard() : Promise.resolve(null),
  ]);
  return {
    store,
    prices: referencePrices(pricing, now),
    // Diferido: el panel se pinta ya y el resumen del estado llega después.
    health: runHealthChecks(request, now)
      .then((r) => healthSummary(r.checks))
      .catch(() => null),
    presale,
  };
}

const units = (n: number) => `${n} ${n === 1 ? 'llanta' : 'llantas'}`;

function HealthChip({ health }: { health: Promise<{ errors: number; warnings: number } | null> }) {
  return (
    <Suspense
      fallback={
        <span className="admin-skel-chip skeleton" role="status" aria-label="Comprobando el estado del sistema…" />
      }
    >
      <Await resolve={health} errorElement={<StatusChip tone="neutral">Estado del sistema: sin datos</StatusChip>}>
        {(h) => (
          <Link to="/admin/estado">
            {!h ? (
              <StatusChip tone="neutral">Estado del sistema: sin datos</StatusChip>
            ) : h.errors > 0 ? (
              <StatusChip tone="critical">Estado del sistema: {h.errors} con error</StatusChip>
            ) : h.warnings > 0 ? (
              <StatusChip tone="warning">Estado del sistema: {h.warnings} a revisar</StatusChip>
            ) : (
              <StatusChip tone="good">Sistema: todo correcto</StatusChip>
            )}
          </Link>
        )}
      </Await>
    </Suspense>
  );
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { store, prices, health, presale } = loaderData;

  return (
    <>
      <div className="admin-pagehead">
        <div>
          <h1 className="admin-title">Panel</h1>
          <p className="admin-sub">Resumen de la tienda. Las compras de prueba no cuentan en las cifras.</p>
        </div>
        <HealthChip health={health} />
      </div>

      {store && store.toShip > 0 && (
        <div className="admin-notice admin-notice--warning" role="status">
          <div>
            <strong>{store.toShip === 1 ? 'Hay 1 pedido pendiente de enviar.' : `Hay ${store.toShip} pedidos pendientes de enviar.`}</strong>{' '}
            <Link to="/admin/pedidos?status=paid">Ver los pedidos por preparar →</Link>
          </div>
        </div>
      )}

      {!store ? (
        <div className="admin-notice admin-notice--error" role="alert">
          <div>
            No se pudieron leer los pedidos de la base de datos. Mira <Link to="/admin/estado">Estado</Link>.
          </div>
        </div>
      ) : (
        <>
          <section className="admin-section" aria-labelledby="kpi-title">
            <h2 id="kpi-title">Tienda</h2>
            <div className="viz-kpis">
              <HeroFigure
                label="Ingresos netos"
                value={formatPrice(store.netRevenueCents)}
                hint={<>Cobrado menos devuelto, IVA incluido.<br />Últimos 30 días: <strong>{formatPrice(store.netRevenue30Cents)}</strong></>}
              />
              <StatTile
                label="Pendientes de enviar"
                value={String(store.toShip)}
                hint={`${store.pipeline.paid} por preparar · ${store.pipeline.inProduction} en fabricación · ${store.pipeline.readyToShip} listos`}
                href={store.toShip > 0 ? '/admin/pedidos?status=paid' : undefined}
                attention={store.toShip > 0}
              />
              <StatTile label="Pedidos hoy" value={String(store.orders.today)} hint="Desde las 00:00 (hora de Madrid)" />
              <StatTile label="Pedidos (30 días)" value={String(store.orders.last30)} hint={`${store.orders.last7} en los últimos 7 días`} />
              <StatTile label="Pedidos totales" value={String(store.orders.total)} hint="Desde la apertura de la tienda" />
              <StatTile label="Llantas vendidas" value={String(store.unitsSold)} hint="Sin cancelados ni devueltos" />
              <StatTile label="Ticket medio" value={store.averageOrderCents == null ? '—' : formatPrice(store.averageOrderCents)} hint="Importe medio por pedido" />
              <StatTile label="Enviados" value={String(store.pipeline.shipped)} hint={`${store.pipeline.delivered} entregados`} />
              <StatTile
                label="Devuelto"
                value={formatPrice(store.refundedCents)}
                hint={store.orders.cancelled ? `${store.orders.cancelled} pedido(s) cancelados o devueltos` : 'Sin devoluciones'}
              />
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section__head">
              <h2>Últimos pedidos</h2>
              <Link to="/admin/pedidos">Ver todos los pedidos →</Link>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--stack admin-table--orders">
                <thead>
                  <tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Artículos</th><th>Estado</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {store.recent.length === 0 && (
                    <tr><td colSpan={6} className="viz-empty">Todavía no hay pedidos. Aparecerán aquí en cuanto entre el primero.</td></tr>
                  )}
                  {store.recent.map((o) => (
                    <tr key={o.id} className="is-link">
                      <td className="c-code">
                        <Link to={`/admin/pedidos/${o.id}`}>{o.code ?? cartOrderRef(o.stripe_session_id)}</Link>
                        {o.isTest && <> <StatusChip tone="neutral" size="sm">Prueba</StatusChip></>}
                      </td>
                      <td className="c-date nowrap"><LocalDateTime iso={o.created_at} compact /></td>
                      <td className="c-customer">
                        {o.customer_name ?? '—'}
                        <span className="cell-sub">{o.customer_email ?? ''}</span>
                      </td>
                      <td className="c-items">{o.summary || '—'}</td>
                      <td className="c-status"><OrderStatusChip status={o.status} size="sm" /></td>
                      <td className="c-total num">{formatPrice(o.amount_total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section">
            <h2>Ventas por referencia</h2>
            <div className="admin-grid-2">
              <BarList
                title="Llantas vendidas por referencia"
                unit="unidades"
                data={store.byReference.map((r) => ({ label: r.label, value: r.units, display: `${units(r.units)} · ${formatPrice(r.revenueCents)}` }))}
                empty="Aún no hay ventas"
              />
              <BarList
                title="Llantas vendidas por acabado"
                unit="unidades"
                data={store.byFinish.map((f) => ({ label: f.label, value: f.units, display: units(f.units) }))}
                empty="Aún no hay ventas"
              />
            </div>
          </section>
        </>
      )}

      <section className="admin-section">
        <div className="admin-section__head">
          <h2>Precio vigente de cada referencia</h2>
          <Link to="/admin/precios">Cambiar precios o crear una promoción →</Link>
        </div>
        <PriceTable prices={prices} />
      </section>

      {presale && (
        <>
          {(presale.alerts.needsReview > 0 || presale.alerts.depositDecisions > 0 || presale.alerts.heldEmails > 0 || presale.alerts.failedEmails > 0 || presale.alerts.failedStripeEvents > 0) && (
            <section className="admin-section" aria-label="Avisos de preventa">
              <h2>Preventa · requiere atención</h2>
              <div className="admin-actions">
                {presale.alerts.needsReview > 0 && (
                  <Link to="/admin/reservas?status=needs_review"><StatusChip tone="critical">{presale.alerts.needsReview} reserva(s) en revisión</StatusChip></Link>
                )}
                {presale.alerts.depositDecisions > 0 && (
                  <Link to="/admin/reservas?status=expired"><StatusChip tone="warning">{presale.alerts.depositDecisions} reserva(s) abonada(s) pendientes de decisión</StatusChip></Link>
                )}
                {presale.alerts.heldEmails > 0 && (
                  <Link to="/admin/correos?status=held"><StatusChip tone="warning">{presale.alerts.heldEmails} correo(s) automático(s) retenido(s)</StatusChip></Link>
                )}
                {presale.alerts.failedEmails > 0 && (
                  <Link to="/admin/correos?status=failed"><StatusChip tone="critical">{presale.alerts.failedEmails} correo(s) con error</StatusChip></Link>
                )}
                {presale.alerts.failedStripeEvents > 0 && (
                  <StatusChip tone="critical">{presale.alerts.failedStripeEvents} evento(s) de Stripe fallidos (Stripe los reintenta)</StatusChip>
                )}
              </div>
            </section>
          )}

          <section className="admin-section">
            <h2>Preventa · indicadores</h2>
            <p className="admin-sub">«Cobrado» es dinero recibido; «potencial» depende de que las reservas se completen.</p>
            <KpiPanel stats={presale.stats} />
          </section>

          <section className="admin-section">
            <h2>Tiradas</h2>
            {presale.batches.length === 0 ? (
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
                    {presale.batches.map(({ batch, inventory }) => (
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
            <h2>Preventa · demanda (reservas pagadas y ventas directas)</h2>
            <DemandPanels stats={presale.stats} />
          </section>
        </>
      )}
    </>
  );
}
