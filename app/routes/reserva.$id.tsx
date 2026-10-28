import type { Route } from './+types/reserva.$id';
import { Form, Link, data, redirect, useActionData, useNavigation } from 'react-router';
import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { DEPOSIT_STATUS_LABEL, ORDER_STATUS_LABEL, RESERVATION_STATUS_LABEL, label } from '~/lib/presale/labels';
import { presaleErrorMessage } from '~/lib/presale/errors';
import { loadReservationView } from '~/lib/presale/views.server';
import { startBalanceCheckout } from '~/lib/presale/checkout.server';
import { PRIVATE_PAGE_HEADERS, assertSameOrigin } from '~/lib/security.server';
import { PriceBreakdown } from '~/components/presale/PriceBreakdown';
import { LocalDateTime, CalendarDate } from '~/components/presale/LocalDateTime';
import { usePolling } from '~/components/presale/usePolling';

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: data?.view ? `Reserva ${data.view.reservation.code} | SAMORAI` : 'Reserva | SAMORAI' },
    { name: 'robots', content: 'noindex, nofollow' },
  ];
}

export function headers() {
  return PRIVATE_PAGE_HEADERS;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const view = await loadReservationView(request, params.id, url.searchParams.get('t'));
  if (!view) throw new Response('Reserva no encontrada', { status: 404 });
  return { view, justPaid: url.searchParams.has('pagada'), now: new Date().toISOString() };
}

/** Pagar el importe restante: se crea la sesión de Stripe en el momento. */
export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();
  const token = String(form.get('t') ?? '') || null;
  const view = await loadReservationView(request, params.id, token);
  if (!view) throw new Response('Reserva no encontrada', { status: 404 });
  if (form.get('intent') !== 'pay') return data({ error: 'not_payable' }, { status: 400 });
  if (!view.canPay) {
    const status = view.reservation.status;
    const error =
      status === 'completed' ? 'already_paid'
      : status === 'balance_processing' ? 'payment_processing'
      : status === 'balance_due' ? 'deadline_passed'
      : 'not_payable';
    return data({ error }, { status: 400 });
  }

  const result = await startBalanceCheckout(view.reservation.id);
  if (result.ok) return redirect(result.url, 303);
  return data({ error: result.error }, { status: 400 });
}

const REVIEW_LABEL = {
  pending: 'Pendiente de validación por nuestro equipo',
  approved: 'Validada por nuestro equipo',
  rejected: 'No fabricable: te contactaremos',
} as const;

export default function ReservationPage({ loaderData }: Route.ComponentProps) {
  const { view, justPaid } = loaderData;
  const r = view.reservation;
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';

  const waitingDeposit = r.status === 'pending_deposit' || r.status === 'deposit_processing';
  const waitingBalance = r.status === 'balance_processing';
  usePolling((justPaid && waitingDeposit) || waitingBalance, 3000, 25);

  const terms = r.terms_snapshot ?? {};
  const depositPaid = r.deposit_status !== 'unpaid';
  const daysLeft = r.balance_due_at
    ? Math.max(0, Math.ceil((new Date(r.balance_due_at).getTime() - new Date(loaderData.now).getTime()) / 86_400_000))
    : null;

  return (
    <div className="section">
      <div className="container account-page">
        <p className="eyebrow">{view.batch?.name ?? 'Reserva'}</p>
        <h1 className="account-page__title">Reserva {r.code}</h1>
        <p className={`presale-chip presale-chip--status-${r.status}`}>{label(RESERVATION_STATUS_LABEL, r.status)}</p>

        {waitingDeposit && (
          <div className="notice" role="status">
            {r.status === 'deposit_processing'
              ? 'Tu pago está en proceso con tu banco. Te avisaremos por email en cuanto se confirme.'
              : justPaid
                ? 'Estamos confirmando tu pago con Stripe… Esta página se actualizará sola.'
                : 'El pago de la reserva no se ha completado. Si cerraste el pago por error, puedes volver a reservar desde la ficha del producto.'}
          </div>
        )}
        {r.status === 'confirmed' && (
          <div className="notice notice--ok" role="status">
            Tu juego está reservado. Te escribiremos en el lanzamiento oficial para completar el pago.
          </div>
        )}
        {r.status === 'needs_review' && (
          <div className="notice" role="status">
            Hemos recibido tu pago y estamos revisando tu reserva. Te contactaremos por email en breve.
          </div>
        )}
        {r.status === 'expired' && (
          <div className="notice notice--warn" role="status">
            El plazo de pago terminó y la reserva ha caducado. Estado de la reserva abonada:{' '}
            <strong>{label(DEPOSIT_STATUS_LABEL, r.deposit_status)}</strong>.
          </div>
        )}
        {r.status === 'cancelled' && (
          <div className="notice notice--warn" role="status">
            Reserva cancelada. Estado de la reserva abonada: <strong>{label(DEPOSIT_STATUS_LABEL, r.deposit_status)}</strong>.
          </div>
        )}

        <div className="account-grid">
          <section className="account-card">
            <h2 className="account-card__title">Tu configuración</h2>
            <dl className="kv">
              <div><dt>Modelo</dt><dd>{r.product_name}</dd></div>
              <div><dt>Acabado</dt><dd>{r.finish_name}</dd></div>
              <div><dt>Medida</dt><dd>{formatSize(Number(r.diameter), Number(r.width))}″</dd></div>
              <div><dt>ET</dt><dd>{formatEt(r.et)}</dd></div>
              <div><dt>Anclaje · buje</dt><dd>{r.pcd} · {String(r.center_bore).replace('.', ',')} mm</dd></div>
              <div><dt>Cantidad</dt><dd>{r.quantity_sets} {r.quantity_sets === 1 ? 'juego' : 'juegos'} ({r.quantity_sets * r.units_per_set} llantas)</dd></div>
              {(r.vehicle_make || r.vehicle_model) && (
                <div><dt>Vehículo</dt><dd>{[r.vehicle_make, r.vehicle_model, r.vehicle_year].filter(Boolean).join(' ')}</dd></div>
              )}
              <div><dt>Validación</dt><dd>{REVIEW_LABEL[r.config_review_status]}{r.config_review_note ? ` · ${r.config_review_note}` : ''}</dd></div>
              <div><dt>Fecha de reserva</dt><dd><LocalDateTime iso={r.created_at} /></dd></div>
            </dl>
          </section>

          <section className="account-card">
            <h2 className="account-card__title">Importes</h2>
            <PriceBreakdown
              subtotalCents={r.subtotal_cents}
              discountBps={r.discount_bps}
              discountCents={r.discount_cents}
              totalCents={r.total_cents}
              depositCents={r.deposit_cents}
              balanceCents={r.balance_cents}
              units={r.quantity_sets * r.units_per_set}
              depositState={depositPaid ? 'paid' : 'today'}
              fullyPaid={r.status === 'completed'}
            />

            {r.balance_due_at && r.status !== 'completed' && (
              <p className="deadline">
                Fecha límite de pago: <strong><LocalDateTime iso={r.balance_due_at} /></strong>
                {r.status === 'balance_due' && daysLeft != null && <> · {daysLeft === 1 ? 'queda 1 día' : `quedan ${daysLeft} días`}</>}
              </p>
            )}
            {!r.balance_due_at && depositPaid && r.status === 'confirmed' && (
              <p className="caption">
                Tendrás {terms.balance_window_days ?? 30} días naturales desde el lanzamiento oficial para completar el pago.
                {view.batch?.planned_launch_at && <> Lanzamiento previsto: <LocalDateTime iso={view.batch.planned_launch_at} dateOnly />.</>}
              </p>
            )}

            {view.canPay && (
              <Form method="post" className="pay-form">
                <input type="hidden" name="intent" value="pay" />
                {view.token && <input type="hidden" name="t" value={view.token} />}
                {actionData?.error && <p className="presale-form__error" role="alert">{presaleErrorMessage(actionData.error)}</p>}
                <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting}>
                  {submitting ? 'Conectando con el pago seguro…' : `Pagar ${formatPrice(r.balance_cents)}`}
                </button>
                <p className="caption">Pago seguro con Stripe. Se cobra solo cuando completas el pago.</p>
              </Form>
            )}
            {waitingBalance && <p className="caption">Pago final en proceso. Te avisaremos por email.</p>}

            {view.order && (
              <p className="pay-form">
                <Link to={view.order.link} className="btn btn-outline w-full">
                  Ver pedido {view.order.code ?? ''} · {label(ORDER_STATUS_LABEL, view.order.status)}
                </Link>
              </p>
            )}
          </section>
        </div>

        {(view.batch?.estimated_delivery_on || view.batch?.estimated_delivery_note) && (
          <p className="caption">
            Entrega estimada:{' '}
            {view.batch.estimated_delivery_on && <CalendarDate value={view.batch.estimated_delivery_on} />}
            {view.batch.estimated_delivery_note ? ` ${view.batch.estimated_delivery_note}` : ''}
          </p>
        )}

        {view.payments.length > 0 && (
          <section className="account-card">
            <h2 className="account-card__title">Pagos</h2>
            <table className="simple-table">
              <tbody>
                {view.payments.map((p, i) => (
                  <tr key={i}>
                    <td>{p.purpose === 'deposit' ? 'Reserva' : p.purpose === 'balance' ? 'Pago final' : 'Compra'}</td>
                    <td>{p.paidAt ? <LocalDateTime iso={p.paidAt} /> : 'En proceso'}</td>
                    <td className="num">{formatPrice(p.amountCents)}{p.refundedCents > 0 ? ` (devuelto ${formatPrice(p.refundedCents)})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="account-card">
          <h2 className="account-card__title">Condiciones aceptadas</h2>
          <p className="caption">Copia de las condiciones vigentes cuando reservaste (<LocalDateTime iso={r.terms_accepted_at} />).</p>
          {[
            ['Condiciones de reserva', terms.reservation_terms],
            ['Cancelación', terms.cancellation_policy],
            ['Devoluciones', terms.refund_policy],
            ['Caducidad', terms.expiry_policy],
          ]
            .filter(([, text]) => text)
            .map(([title, text]) => (
              <details key={title as string} className="presale-terms__item">
                <summary>{title}</summary>
                <p>{text}</p>
              </details>
            ))}
        </section>

        {view.viewer === 'token' && (
          <p className="caption">
            ¿Quieres tener todas tus reservas y pedidos en un sitio?{' '}
            <Link to="/cuenta/acceso">Accede con tu email</Link>: las compras hechas con él se vinculan a tu cuenta.
          </p>
        )}
      </div>
    </div>
  );
}
