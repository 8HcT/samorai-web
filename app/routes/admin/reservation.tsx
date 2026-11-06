import type { Route } from './+types/reservation';
import { assertPresaleEnabled } from '~/lib/presale/config.server';
import { Form, Link, data, useNavigation } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import {
  cancelReservation,
  loadReservation,
  refundPayment,
  resendEmail,
  reviewConfig,
  rotateAccess,
  setDepositDisposition,
} from '~/lib/presale/admin.server';
import { adminReason } from '~/lib/presale/admin-forms.server';
import { DEPOSIT_STATUS_LABEL, ORDER_STATUS_LABEL, RESERVATION_STATUS_LABEL, label } from '~/lib/presale/labels';
import { isUuid } from '~/lib/presale/views.server';
import { assertSameOrigin } from '~/lib/security.server';
import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { PriceBreakdown } from '~/components/presale/PriceBreakdown';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export async function loader({ request, params }: Route.LoaderArgs) {
  assertPresaleEnabled();
  await requireAdmin(request);
  if (!isUuid(params.id)) throw new Response('Reserva no encontrada', { status: 404 });
  const detail = await loadReservation(params.id);
  if (!detail) throw new Response('Reserva no encontrada', { status: 404 });
  return detail;
}

const RESENDABLE: Record<string, string> = {
  reservation_confirmed: 'Confirmación de reserva',
  deposit_receipt: 'Recibo de la reserva abonada',
  balance_request: 'Solicitud de pago restante',
  reservation_expired: 'Reserva caducada',
  reservation_cancelled: 'Reserva cancelada',
  balance_paid: 'Pago completo',
};

export async function action({ request, params }: Route.ActionArgs) {
  assertPresaleEnabled();
  assertSameOrigin(request);
  const { user } = await requireAdmin(request);
  if (!isUuid(params.id)) throw new Response('Reserva no encontrada', { status: 404 });
  const id = params.id;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const done = (ok: boolean, message: string) => data({ ok, message }, { status: ok ? 200 : 400 });
  const note = String(form.get('note') ?? '').trim() || null;

  try {
    switch (intent) {
      case 'review': {
        const status = String(form.get('status') ?? '');
        const res = await reviewConfig(id, status, note, user.id);
        return res.ok ? done(true, 'Validación guardada.') : done(false, adminReason(res.reason));
      }
      case 'cancel': {
        if (form.get('confirm') !== 'on') return done(false, 'Marca la casilla de confirmación.');
        const res = await cancelReservation(id, String(form.get('reason') ?? ''), form.get('refund') === 'on', user.id);
        if (!res.ok) return done(false, adminReason(res.reason));
        const refunded = (res as { refunded?: { ok?: boolean; reason?: string } | null }).refunded;
        return done(true, refunded ? (refunded.ok ? 'Reserva cancelada y reserva abonada devuelta.' : `Reserva cancelada; la devolución falló (${adminReason(refunded.reason)}).`) : 'Reserva cancelada.');
      }
      case 'refund_deposit': {
        if (form.get('confirm') !== 'on') return done(false, 'Marca la casilla de confirmación.');
        const detail = await loadReservation(id);
        const pi = detail?.reservation.stripe_deposit_payment_intent_id;
        if (!detail || !pi) return done(false, 'No hay pago de reserva que devolver.');
        if (!['cancelled', 'expired', 'needs_review'].includes(detail.reservation.status)) {
          return done(false, 'Solo se devuelve la reserva abonada de reservas canceladas, caducadas o en revisión.');
        }
        const res = await refundPayment(pi, null);
        return res.ok ? done(true, `Devolución de ${formatPrice(res.amount ?? 0)} creada en Stripe.`) : done(false, adminReason(res.reason));
      }
      case 'retain': {
        if (form.get('confirm') !== 'on') return done(false, 'Marca la casilla de confirmación.');
        const res = await setDepositDisposition(id, 'retained', note, user.id);
        return res.ok ? done(true, 'Reserva abonada marcada como retenida.') : done(false, adminReason(res.reason));
      }
      case 'mark_refund': {
        const res = await setDepositDisposition(id, 'refund_pending', note, user.id);
        return res.ok ? done(true, 'Marcada para devolver.') : done(false, adminReason(res.reason));
      }
      case 'resend': {
        const template = String(form.get('template') ?? '');
        if (!RESENDABLE[template]) return done(false, 'Plantilla no válida.');
        const res = await resendEmail(template, { reservationId: id }, user.id);
        if (!res.ok) return done(false, adminReason(res.reason));
        const r = res as { sent?: boolean; skipped?: string };
        return done(true, r.sent ? 'Correo enviado.' : r.skipped ? 'Correo en cola (Resend no configurado).' : 'Correo en cola; revisa su estado abajo (puede no aplicar al estado actual de la reserva).');
      }
      case 'rotate': {
        const res = await rotateAccess('reservation', id, user.id);
        return res.ok ? done(true, 'Enlaces anteriores invalidados. El nuevo enlace aparece abajo.') : done(false, adminReason(res.reason));
      }
      default:
        return done(false, 'Acción no reconocida.');
    }
  } catch (err) {
    console.error('[admin][reservation]', intent, err);
    return done(false, err instanceof Error ? err.message : 'Error inesperado.');
  }
}

const STRIPE_DASHBOARD = 'https://dashboard.stripe.com';

export default function AdminReservation({ loaderData, actionData }: Route.ComponentProps) {
  const { reservation: r, batch, allocations, payments, notifications, order, audit, guestLink } = loaderData;
  const busy = useNavigation().state !== 'idle';
  const depositPaid = r.deposit_status !== 'unpaid';
  const closedWithDeposit = ['cancelled', 'expired', 'needs_review'].includes(r.status) && ['paid', 'refund_pending'].includes(r.deposit_status);
  const canCancel = !['completed', 'cancelled', 'expired', 'abandoned', 'deposit_processing', 'balance_processing'].includes(r.status);
  const termsValidated = Boolean(r.terms_snapshot?.policies_legally_validated);

  return (
    <>
      <p className="admin-muted"><Link to="/admin/reservas">← Reservas</Link></p>
      <h1 className="admin-title">Reserva {r.code}</h1>
      <p className="admin-sub">
        {label(RESERVATION_STATUS_LABEL, r.status)} · Reserva abonada: {label(DEPOSIT_STATUS_LABEL, r.deposit_status)}
        {batch && <> · <Link to={`/admin/tiradas/${batch.id}`}>{batch.name}</Link></>}
        {r.review_reason && <> · Revisión: <strong>{r.review_reason}</strong></>}
      </p>
      {actionData && (
        <div className={`admin-notice ${actionData.ok ? 'admin-notice--ok' : 'admin-notice--error'}`} role="status">{actionData.message}</div>
      )}

      <div className="admin-grid-2">
        <section className="admin-section">
          <h2>Cliente y configuración</h2>
          <dl className="admin-kv">
            <dt>Email</dt><dd>{r.email ?? '— (borrado por RGPD)'}</dd>
            <dt>Nombre</dt><dd>{r.customer_name ?? '—'}</dd>
            <dt>Teléfono</dt><dd>{r.phone ?? '—'}</dd>
            <dt>Cuenta</dt><dd>{r.user_id ? 'Vinculada' : 'Invitado'}</dd>
            <dt>Vehículo</dt><dd>{[r.vehicle_make, r.vehicle_model, r.vehicle_year].filter(Boolean).join(' ') || 'No indicado'}</dd>
            <dt>Modelo</dt><dd>{r.product_name}</dd>
            <dt>Acabado</dt><dd>{r.finish_name}</dd>
            <dt>Medida · ET</dt><dd>{formatSize(Number(r.diameter), Number(r.width))} · {formatEt(r.et)}</dd>
            <dt>PCD · buje</dt><dd>{r.pcd} · {String(r.center_bore)} mm</dd>
            <dt>Referencia</dt><dd>{r.variant_id}</dd>
            <dt>Juegos</dt><dd>{r.quantity_sets} ({r.quantity_sets * r.units_per_set} llantas)</dd>
            <dt>Reservada</dt><dd><LocalDateTime iso={r.created_at} /></dd>
            <dt>Fecha límite</dt><dd>{r.balance_due_at ? <><LocalDateTime iso={r.balance_due_at} /> <span className="admin-muted">({r.balance_due_at} UTC)</span></> : '—'}</dd>
          </dl>
        </section>

        <section className="admin-section">
          <h2>Importes (instantánea inmutable)</h2>
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
          {order && <p>Pedido: <Link to={`/admin/pedidos/${order.id}`}>{order.code}</Link> · {label(ORDER_STATUS_LABEL, order.status)}</p>}
          <dl className="admin-kv">
            <dt>Pago reserva</dt>
            <dd>{r.stripe_deposit_payment_intent_id ? <a href={`${STRIPE_DASHBOARD}/payments/${r.stripe_deposit_payment_intent_id}`} target="_blank" rel="noreferrer">{r.stripe_deposit_payment_intent_id}</a> : '—'}</dd>
            <dt>Pago final</dt>
            <dd>{r.stripe_balance_payment_intent_id ? <a href={`${STRIPE_DASHBOARD}/payments/${r.stripe_balance_payment_intent_id}`} target="_blank" rel="noreferrer">{r.stripe_balance_payment_intent_id}</a> : '—'}</dd>
          </dl>
        </section>
      </div>

      <div className="admin-grid-2">
        <section className="admin-section">
          <h2>Validar configuración y compatibilidad</h2>
          <p className="admin-muted">Estado: {r.config_review_status}{r.config_review_note ? ` · ${r.config_review_note}` : ''}</p>
          <Form method="post" className="admin-form">
            <input type="hidden" name="intent" value="review" />
            <label className="admin-field">Resultado
              <select name="status" defaultValue={r.config_review_status}>
                <option value="pending">Pendiente</option>
                <option value="approved">Validada (fabricable y compatible)</option>
                <option value="rejected">No fabricable / no compatible</option>
              </select>
            </label>
            <label className="admin-field">Nota (visible para el cliente en su reserva)<input name="note" maxLength={1000} defaultValue={r.config_review_note ?? ''} /></label>
            <div><button type="submit" className="btn btn-outline btn-sm" disabled={busy}>Guardar</button></div>
          </Form>
        </section>

        <section className="admin-section">
          <h2>Correos y enlace seguro</h2>
          <Form method="post" className="admin-actions">
            <input type="hidden" name="intent" value="resend" />
            <select name="template" className="admin-field" defaultValue={r.status === 'balance_due' ? 'balance_request' : 'reservation_confirmed'} style={{ minHeight: 36 }}>
              {Object.entries(RESENDABLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="submit" className="btn btn-outline btn-sm" disabled={busy || !r.email}>Reenviar</button>
          </Form>
          <p className="admin-muted" style={{ marginTop: 'var(--space-4)' }}>Enlace de la reserva para el cliente (sin login):</p>
          <p className="admin-copy">{guestLink}</p>
          <Form method="post">
            <input type="hidden" name="intent" value="rotate" />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Invalidar enlaces anteriores</button>
          </Form>
        </section>
      </div>

      <section className="admin-section">
        <h2>Cancelaciones y devoluciones</h2>
        {canCancel && (
          <Form method="post" className="admin-form admin-danger" style={{ marginBottom: 'var(--space-4)' }}>
            <h3>Cancelar la reserva</h3>
            <input type="hidden" name="intent" value="cancel" />
            <label className="admin-field">Motivo<textarea name="reason" required style={{ minHeight: 60 }} /></label>
            {depositPaid && <label className="admin-check"><input type="checkbox" name="refund" defaultChecked /> Devolver la reserva abonada ({formatPrice(r.deposit_cents)}) en Stripe</label>}
            <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo la cancelación (libera la plaza)</label>
            <div><button type="submit" className="btn btn-outline btn-sm" disabled={busy}>Cancelar reserva</button></div>
          </Form>
        )}
        {closedWithDeposit && (
          <div className="admin-form">
            <p className="admin-muted">
              Reserva abonada: {label(DEPOSIT_STATUS_LABEL, r.deposit_status)}. Política aceptada por el cliente: {String(r.terms_snapshot?.expiry_deposit_policy ?? 'manual_review')}
              {termsValidated ? ' (condiciones validadas legalmente)' : ' (condiciones NO validadas legalmente: no se puede retener)'}.
            </p>
            <div className="admin-actions">
              <Form method="post" className="admin-actions">
                <input type="hidden" name="intent" value="refund_deposit" />
                <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo</label>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Devolver {formatPrice(r.deposit_cents)}</button>
              </Form>
              {r.deposit_status === 'paid' && (
                <Form method="post">
                  <input type="hidden" name="intent" value="mark_refund" />
                  <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Marcar para devolver</button>
                </Form>
              )}
              {termsValidated && (
                <Form method="post" className="admin-actions">
                  <input type="hidden" name="intent" value="retain" />
                  <input name="note" placeholder="Nota" className="admin-field" style={{ minHeight: 36 }} />
                  <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo</label>
                  <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Retener según condiciones</button>
                </Form>
              )}
            </div>
          </div>
        )}
        {!canCancel && !closedWithDeposit && <p className="viz-empty">No hay acciones disponibles en el estado actual.</p>}
      </section>

      <section className="admin-section">
        <h2>Pagos</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Tipo</th><th>Estado</th><th className="num">Importe</th><th className="num">Devuelto</th><th>Fecha</th><th>Sesión</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.purpose === 'deposit' ? 'Reserva' : p.purpose === 'balance' ? 'Pago final' : p.purpose}</td>
                  <td>{p.status}</td>
                  <td className="num">{formatPrice(p.amount_cents)}</td>
                  <td className="num">{p.refunded_cents ? formatPrice(p.refunded_cents) : '—'}</td>
                  <td>{p.paid_at ? <LocalDateTime iso={p.paid_at} /> : <span className="admin-muted">creado <LocalDateTime iso={p.created_at} /></span>}</td>
                  <td className="admin-muted">{p.stripe_checkout_session_id.slice(0, 18)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="admin-muted" style={{ marginTop: 'var(--space-3)' }}>
          Plazas: {allocations.map((a: any) => `${a.channel} · ${a.status}${a.release_reason ? ` (${a.release_reason})` : ''}`).join(' · ') || '—'}
        </p>
      </section>

      <section className="admin-section">
        <h2>Correos</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Plantilla</th><th>Para</th><th>Estado</th><th className="num">Intentos</th><th>Último error</th><th>Fecha</th></tr></thead>
            <tbody>
              {notifications.length === 0 && <tr><td colSpan={6} className="admin-muted">Sin correos.</td></tr>}
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td>{n.template}{n.is_bulk ? <span className="admin-muted"> · automático</span> : null}</td>
                  <td>{n.audience === 'shop' ? 'Tienda' : n.to_email}</td>
                  <td>{n.status}</td>
                  <td className="num">{n.attempts}/{n.max_attempts}</td>
                  <td className="admin-muted">{n.last_error ?? '—'}</td>
                  <td>{n.sent_at ? <LocalDateTime iso={n.sent_at} /> : <LocalDateTime iso={n.created_at} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>Historial de eventos</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Fecha</th><th>Entidad</th><th>Acción</th><th>Quién</th><th>Detalle</th></tr></thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id}>
                  <td><LocalDateTime iso={e.created_at} /></td>
                  <td>{e.entity_type}</td>
                  <td>{e.action}</td>
                  <td>{e.actor_type}</td>
                  <td><pre className="admin-pre">{JSON.stringify(e.data, null, 1)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
