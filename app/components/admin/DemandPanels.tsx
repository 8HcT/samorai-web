import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { BarList, HeroFigure, StatTile } from './AdminViz';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Stats = Record<string, any>;

function sets(n: number) {
  return `${n} ${n === 1 ? 'juego' : 'juegos'}`;
}

/** Indicadores: lo COBRADO (real) separado de lo POTENCIAL (aún no cobrado). */
export function KpiPanel({ stats }: { stats: Stats }) {
  const conversion = stats.conversion_rate == null ? '—' : `${(Number(stats.conversion_rate) * 100).toFixed(1).replace('.', ',')} %`;
  return (
    <div className="viz-kpis">
      <HeroFigure
        label="Cobrado (neto de devoluciones)"
        value={formatPrice(stats.collected_total_cents)}
        hint="Dinero real recibido: señales, pagos finales y compras directas."
      />
      <StatTile
        label="Facturación potencial"
        value={formatPrice(stats.potential_revenue_cents)}
        hint={`Reservas activas · pendiente de cobro ${formatPrice(stats.potential_pending_cents)}`}
      />
      <StatTile label="Señales cobradas" value={formatPrice(stats.deposits_collected_cents)} hint={`Devueltas ${formatPrice(stats.deposits_refunded_cents)}`} />
      <StatTile
        label="Ventas completadas"
        value={String(stats.sales_completed_count)}
        hint={`${formatPrice(stats.sales_completed_cents)} · ${stats.presale_sales_count} preventa · ${stats.direct_sales_count} directas`}
      />
      <StatTile label="Reservas totales" value={String(stats.reservations_total)} hint="Con la reserva pagada" />
      <StatTile label="Reservas activas" value={String(stats.reservations_active)} hint={sets(Number(stats.sets_reserved_active))} />
      <StatTile label="Reservas caducadas" value={String(stats.reservations_expired)} hint={`${stats.reservations_cancelled} canceladas`} />
      <StatTile label="Conversión reserva → compra" value={conversion} hint="Completadas / (completadas + caducadas)" />
      <StatTile label="Checkouts abandonados" value={String(stats.checkouts_abandoned)} hint={`${stats.checkouts_pending} en curso ahora`} />
    </div>
  );
}

/** Demanda: modelos, colores, medidas, ET, configuraciones y vehículos. */
export function DemandPanels({ stats }: { stats: Stats }) {
  const toBars = (rows: any[], label: (r: any) => string) =>
    (rows ?? []).map((r) => ({ label: label(r), value: Number(r.sets), display: sets(Number(r.sets)) }));

  return (
    <div className="admin-grid-3">
      <BarList title="Modelos más populares" unit="juegos" data={toBars(stats.top_models, (r) => r.label)} />
      <BarList title="Colores / acabados más populares" unit="juegos" data={toBars(stats.top_finishes, (r) => r.label)} />
      <BarList
        title="Medidas más solicitadas"
        unit="juegos"
        data={toBars(stats.top_sizes, (r) => `${formatSize(Number(r.diameter), Number(r.width))}″`)}
      />
      <BarList title="ET más solicitados" unit="juegos" data={toBars(stats.top_ets, (r) => formatEt(Number(r.et)))} />
      <BarList
        title="Configuraciones más demandadas"
        unit="juegos"
        data={toBars(
          stats.top_configs,
          (r) => `${r.finish} ${formatSize(Number(r.diameter), Number(r.width))} ${formatEt(Number(r.et))}`
        )}
      />
      <BarList
        title="Vehículos más frecuentes"
        unit="reservas"
        empty="Ningún cliente ha indicado vehículo todavía"
        data={(stats.top_vehicles ?? []).map((r: any) => ({
          label: [r.make, r.model].filter(Boolean).join(' '),
          value: Number(r.count),
          display: `${r.count}`,
        }))}
      />
    </div>
  );
}
