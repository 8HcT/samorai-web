import type { Route } from './+types/reservations-csv';
import { assertPresaleEnabled } from '~/lib/presale/config.server';
import { requireAdmin } from '~/lib/auth/session.server';
import { listReservations, reservationFiltersFromUrl } from '~/lib/presale/admin.server';

/** Exportación CSV de reservas (con los mismos filtros) para planificar la fabricación. */
export async function loader({ request }: Route.LoaderArgs) {
  assertPresaleEnabled();
  await requireAdmin(request);
  const rows = await listReservations(reservationFiltersFromUrl(new URL(request.url)), 5000);
  const header = [
    'codigo', 'fecha', 'tirada', 'estado', 'reserva_abonada', 'modelo', 'acabado', 'diametro', 'ancho', 'et',
    'juegos', 'precio_final_eur', 'abonado_eur', 'pendiente_eur', 'fecha_limite_utc', 'vehiculo', 'validacion', 'email', 'nombre',
  ];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Evita inyección de fórmulas al abrirlo en una hoja de cálculo.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const euros = (c: number) => (c / 100).toFixed(2);
  const lines = rows.map((r) =>
    [
      r.code, r.created_at, r.production_batches?.code, r.status, r.deposit_status, r.product_name, r.finish_name,
      r.diameter, r.width, r.et, r.quantity_sets, euros(r.total_cents),
      r.deposit_status === 'unpaid' ? '0.00' : euros(r.deposit_cents),
      ['confirmed', 'balance_due', 'balance_processing'].includes(r.status) ? euros(r.balance_cents) : '0.00',
      r.balance_due_at ?? '', [r.vehicle_make, r.vehicle_model].filter(Boolean).join(' '), r.config_review_status,
      r.email ?? '', r.customer_name ?? '',
    ].map(esc).join(';')
  );
  const csv = '﻿' + [header.join(';'), ...lines].join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reservas-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
