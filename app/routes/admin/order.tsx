import type { Route } from './+types/order';
import { Form, Link, data } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { cancelOrder, loadOrder, refundOrder, resendEmail, rotateAccess, updateOrderStatus } from '~/lib/presale/admin.server';
import { adminReason } from '~/lib/presale/admin-forms.server';
import { ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';
import { isUuid } from '~/lib/presale/views.server';
import { assertSameOrigin } from '~/lib/security.server';
import { formatPrice } from '~/lib/money';
import { describeOrderItem } from '~/lib/admin/store-stats';
import { cartOrderRef, isStripeTestSession, isTestOrder } from '~/lib/orders/test-purchase';
import { stripeErrorMessage } from '~/lib/stripe/errors';
import { stripeDashboardPaymentUrl } from '~/lib/stripe/stripe.server';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { OrderStatusChip, StatusChip } from '~/components/admin/AdminViz';
import { CopyButton } from '~/components/admin/CopyButton';
import { IconArrowLeft, IconExternal } from '~/components/admin/icons';
import { SubmitButton } from '~/components/ui/SubmitButton';
import { Toast } from '~/components/ui/Toast';

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  if (!isUuid(params.id)) throw new Response('Pedido no encontrado', { status: 404 });
  const detail = await loadOrder(params.id);
  if (!detail) throw new Response('Pedido no encontrado', { status: 404 });
  return {
    ...detail,
    stripeUrl: detail.order.stripe_payment_intent_id ? stripeDashboardPaymentUrl(detail.order.stripe_payment_intent_id) : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireAdmin(request);
  if (!isUuid(params.id)) throw new Response('Pedido no encontrado', { status: 404 });
  const id = params.id;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const done = (ok: boolean, message: string) => data({ ok, message }, { status: ok ? 200 : 400 });
  try {
    switch (intent) {
      case 'status': {
        const res = await updateOrderStatus(
          id,
          String(form.get('status') ?? ''),
          String(form.get('carrier') ?? '').trim() || null,
          String(form.get('tracking') ?? '').trim() || null,
          form.get('notify') === 'on',
          user.id
        );
        return res.ok ? done(true, 'Estado actualizado.') : done(false, adminReason(res.reason));
      }
      case 'cancel': {
        if (form.get('confirm') !== 'on') return done(false, 'Marca la casilla de confirmación.');
        const res = await cancelOrder(id, String(form.get('reason') ?? ''), form.get('release') === 'on', user.id);
        return res.ok ? done(true, `Pedido cancelado. Plazas liberadas: ${res.allocations_released ?? 0}.`) : done(false, adminReason(res.reason));
      }
      case 'refund': {
        if (form.get('confirm') !== 'on') return done(false, 'Marca la casilla de confirmación.');
        const res = await refundOrder(id);
        return res.ok
          ? done(true, `Devolución de ${formatPrice(res.refundedCents ?? 0)} creada en Stripe. El cliente la verá en su banco en unos días.`)
          : done(false, REFUND_REASON[res.reason ?? ''] ?? 'La devolución no se pudo completar: revisa el pago en Stripe.');
      }
      case 'resend': {
        const res = await resendEmail('order_status_update', { orderId: id }, user.id);
        return res.ok ? done(true, 'Correo de estado enviado o en cola.') : done(false, adminReason(res.reason));
      }
      case 'rotate': {
        const res = await rotateAccess('order', id, user.id);
        return res.ok ? done(true, 'Enlaces anteriores invalidados.') : done(false, adminReason(res.reason));
      }
      default:
        return done(false, 'Acción no reconocida.');
    }
  } catch (err) {
    console.error('[admin][order]', intent, err);
    return done(false, stripeErrorMessage(err) ?? (err instanceof Error ? err.message : 'Error inesperado.'));
  }
}

const REFUND_REASON: Record<string, string> = {
  nothing_to_refund: 'No queda nada por devolver en este pedido.',
  no_payment: 'El pedido no tiene un pago de Stripe asociado.',
  not_found: 'Pedido no encontrado.',
  refund_failed: 'Stripe rechazó la devolución.',
  refund_canceled: 'La devolución se canceló en Stripe.',
};

const KIND_LABEL: Record<string, string> = { cart: 'Tienda (carrito)', direct: 'Venta directa', presale: 'Preventa' };
const EMAIL_OUTCOME: Record<string, string> = { sent: 'enviado ✓', failed: 'ERROR', skipped: 'no enviado' };
const PAYMENT_PURPOSE: Record<string, string> = { deposit: 'Reserva', balance: 'Pago final', direct: 'Compra directa' };
const PAYMENT_STATUS: Record<string, string> = {
  open: 'Abierto', processing: 'En proceso', succeeded: 'Cobrado', failed: 'Fallido', expired: 'Caducado',
  refunded: 'Devuelto', partially_refunded: 'Devuelto en parte',
};

const NEXT: Record<string, string[]> = {
  paid: ['in_production', 'ready_to_ship', 'shipped'],
  in_production: ['ready_to_ship', 'shipped'],
  ready_to_ship: ['shipped'],
  shipped: ['delivered'],
};

/** Recorrido normal de un pedido, para la barra de avance. */
const TRACK = ['paid', 'in_production', 'ready_to_ship', 'shipped', 'delivered'] as const;
const TRACK_LABEL: Record<(typeof TRACK)[number], string> = {
  paid: 'Pagado',
  in_production: 'Fabricación',
  ready_to_ship: 'Listo',
  shipped: 'Enviado',
  delivered: 'Entregado',
};

const AUDIT_LABEL: Record<string, string> = {
  order_emails: 'Correos de compra',
  refund_recorded: 'Devolución registrada',
  status_changed: 'Cambio de estado',
  cancelled: 'Pedido cancelado',
  access_links_rotated: 'Enlaces invalidados',
  direct_sale_paid: 'Venta directa pagada',
  balance_paid: 'Pago final recibido',
  deposit_paid: 'Reserva pagada',
};
const ACTOR_LABEL: Record<string, string> = { admin: 'Admin', system: 'Sistema', customer: 'Cliente', cron: 'Automático' };

function OrderTrack({ status }: { status: string }) {
  const idx = TRACK.indexOf(status as (typeof TRACK)[number]);
  if (idx < 0) return null;
  return (
    <ol className="order-track" aria-label="Avance del pedido">
      {TRACK.map((s, i) => {
        const state = i < idx ? 'is-done' : i === idx ? (s === 'delivered' ? 'is-done' : 'is-current') : '';
        return (
          <li key={s} className={state} aria-current={i === idx ? 'step' : undefined}>
            <span className="order-track__dot" aria-hidden="true">{i < idx || s === status && s === 'delivered' ? '✓' : ''}</span>
            {TRACK_LABEL[s]}
          </li>
        );
      })}
    </ol>
  );
}

export default function AdminOrder({ loaderData, actionData }: Route.ComponentProps) {
  const { order: o, items, payments, notifications, audit, reservation, guestLink, stripeUrl } = loaderData;
  const next = NEXT[o.status] ?? [];
  const closed = o.status === 'cancelled' || o.status === 'refunded';
  const address = o.shipping_address;
  const isTest = isTestOrder(o);
  const stripeTestMode = isStripeTestSession(o.stripe_session_id);
  const addressText = address
    ? [address.name, address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' '), address.state, address.country]
        .filter(Boolean)
        .join('\n')
    : '';
  const shippingLabel = [addressText, o.customer_phone ? `Tel. ${o.customer_phone}` : ''].filter(Boolean).join('\n');

  return (
    <>
      <Toast result={actionData} />
      <Link to="/admin/pedidos" className="admin-back"><IconArrowLeft /> Pedidos</Link>
      <div className="admin-pagehead">
        <div>
          <h1 className="admin-title">Pedido {o.code ?? cartOrderRef(o.stripe_session_id)}</h1>
          <p className="admin-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center' }}>
            <OrderStatusChip status={o.status} />
            <span>{KIND_LABEL[o.kind] ?? o.kind}</span>
            <span><LocalDateTime iso={o.created_at} compact /></span>
            {reservation && <span>Reserva <Link to={`/admin/reservas/${reservation.id}`}>{reservation.code}</Link></span>}
          </p>
        </div>
        {stripeUrl && (
          <a href={stripeUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            <IconExternal /> Ver el pago en Stripe
          </a>
        )}
      </div>

      {o.review_reason && (
        <div className="admin-notice admin-notice--warning" role="note"><div><strong>Requiere revisión:</strong> {o.review_reason}</div></div>
      )}
      {isTest && (
        <div className="admin-notice" role="note">
          <div>
            <StatusChip tone="warning" size="sm">{stripeTestMode ? 'Modo test de Stripe' : 'Compra de prueba'}</StatusChip>{' '}
            {stripeTestMode
              ? 'Pagado con las claves de test: no se cobró dinero real. No se envía nada y no cuenta en las cifras de ventas. Puedes cancelarlo abajo.'
              : 'No se envía nada y no cuenta en las cifras de ventas.'}
            {!closed && !stripeTestMode && ' Devuélvela abajo cuando hayas comprobado que todo ha llegado.'}
          </div>
        </div>
      )}

      {!closed && !isTest && <OrderTrack status={o.status} />}

      <div className="admin-grid-2">
        <section className="admin-section">
          <h2>Artículos</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className="cell-strong">{describeOrderItem(i).title}</span>
                      <span className="cell-sub">{describeOrderItem(i).detail}</span>
                    </td>
                    <td className="num">{i.quantity} ud.</td>
                    <td className="num">{formatPrice(i.unit_price_cents * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="admin-kv" style={{ marginTop: 16 }}>
            {o.discount_cents > 0 && (<><dt>Descuento preventa</dt><dd>−{formatPrice(o.discount_cents)}</dd></>)}
            <dt>Total</dt><dd className="total">{formatPrice(o.amount_total_cents)}</dd>
            <dt>Cobrado</dt><dd>{formatPrice(o.amount_paid_cents ?? o.amount_total_cents)}</dd>
            <dt>Devuelto</dt><dd>{o.refunded_cents > 0 ? formatPrice(o.refunded_cents) : '—'}</dd>
          </dl>
        </section>
        <section className="admin-section">
          <div className="admin-section__head">
            <h2>Cliente y envío</h2>
            {shippingLabel && <CopyButton text={shippingLabel} label="Copiar dirección" />}
          </div>
          <dl className="admin-kv">
            <dt>Nombre</dt><dd>{o.customer_name ?? '—'}</dd>
            <dt>Email</dt><dd>{o.customer_email ? <a href={`mailto:${o.customer_email}`}>{o.customer_email}</a> : '—'}</dd>
            <dt>Teléfono</dt><dd>{o.customer_phone ? <a href={`tel:${o.customer_phone.replace(/\s+/g, '')}`}>{o.customer_phone}</a> : '—'}</dd>
            <dt>Dirección</dt>
            <dd style={{ whiteSpace: 'pre-line' }}>{addressText || '—'}</dd>
            <dt>Transportista</dt><dd>{o.carrier ?? '—'}</dd>
            <dt>Seguimiento</dt><dd>{o.tracking_number ?? '—'}</dd>
          </dl>
          {guestLink && (
            <>
              <p className="admin-muted" style={{ marginTop: 12 }}>Enlace del cliente: <span className="admin-copy">{guestLink}</span></p>
              <Form method="post">
                <input type="hidden" name="intent" value="rotate" />
                <SubmitButton className="btn btn-ghost btn-sm" match={{ intent: 'rotate' }} pendingText="Invalidando…">Invalidar enlaces anteriores</SubmitButton>
              </Form>
            </>
          )}
        </section>
      </div>

      {!closed && next.length > 0 && (
        <section className="admin-section">
          <h2>Fabricación y envío</h2>
          <Form method="post" className="admin-form">
            <input type="hidden" name="intent" value="status" />
            <div className="admin-form-row">
              <label className="admin-field">Nuevo estado
                <select name="status" defaultValue={next[0]}>{next.map((s) => <option key={s} value={s}>{label(ORDER_STATUS_LABEL, s)}</option>)}</select>
              </label>
              <label className="admin-field">Transportista<input name="carrier" defaultValue={o.carrier ?? ''} maxLength={80} placeholder="p. ej. SEUR, UPS…" autoComplete="off" /></label>
              <label className="admin-field">Nº de seguimiento<input name="tracking" defaultValue={o.tracking_number ?? ''} maxLength={120} autoComplete="off" /></label>
            </div>
            <label className="admin-check"><input type="checkbox" name="notify" defaultChecked /> Avisar al cliente por email (fabricación, envío o entrega)</label>
            <div>
              <SubmitButton className="btn btn-primary" match={{ intent: 'status' }} pendingText="Guardando…">Actualizar estado</SubmitButton>
            </div>
          </Form>
        </section>
      )}

      {!closed && (
        <details className="admin-section">
          <summary>
            Cancelar o devolver
            <span className="admin-summary__hint">Acciones que no se pueden deshacer</span>
          </summary>
          <div className="admin-grid-2">
            <Form method="post" className="admin-form admin-danger">
              <h3>Devolver el importe cobrado</h3>
              <input type="hidden" name="intent" value="refund" />
              <p className="admin-muted" style={{ margin: 0 }}>Crea en Stripe la devolución de todos los pagos del pedido (incluida la reserva abonada en preventa).</p>
              <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo la devolución</label>
              <div><SubmitButton className="btn btn-danger" match={{ intent: 'refund' }} pendingText="Devolviendo…">Devolver {formatPrice((o.amount_paid_cents ?? o.amount_total_cents ?? 0) - o.refunded_cents)}</SubmitButton></div>
            </Form>
            <Form method="post" className="admin-form admin-danger">
              <h3>Cancelar el pedido</h3>
              <input type="hidden" name="intent" value="cancel" />
              <label className="admin-field">Motivo<textarea name="reason" required style={{ minHeight: 70 }} /></label>
              <label className="admin-check"><input type="checkbox" name="release" /> Devolver las unidades al stock (no enviadas o recibidas de vuelta)</label>
              <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo la cancelación</label>
              <div><SubmitButton className="btn btn-danger-outline" match={{ intent: 'cancel' }} pendingText="Cancelando…">Cancelar pedido</SubmitButton></div>
            </Form>
          </div>
        </details>
      )}

      <section className="admin-section">
        <h2>Pagos</h2>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead><tr><th>Tipo</th><th>Estado</th><th className="num">Importe</th><th className="num">Devuelto</th><th>Fecha</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td data-label="Tipo">{PAYMENT_PURPOSE[p.purpose] ?? p.purpose}</td>
                  <td data-label="Estado">{PAYMENT_STATUS[p.status] ?? p.status}</td>
                  <td data-label="Importe" className="num">{formatPrice(p.amount_cents)}</td>
                  <td data-label="Devuelto" className="num">{p.refunded_cents ? formatPrice(p.refunded_cents) : '—'}</td>
                  <td data-label="Fecha">{p.paid_at ? <LocalDateTime iso={p.paid_at} compact /> : '—'}</td>
                </tr>
              ))}
              {/* Pedidos del carrito: un único pago, guardado en el propio pedido. */}
              {payments.length === 0 && o.stripe_payment_intent_id && (
                <tr>
                  <td data-label="Tipo">Pago del pedido</td>
                  <td data-label="Estado">{o.refunded_cents >= (o.amount_paid_cents ?? o.amount_total_cents ?? 0) && o.refunded_cents > 0 ? 'Devuelto' : o.refunded_cents > 0 ? 'Devuelto en parte' : 'Cobrado'}</td>
                  <td data-label="Importe" className="num">{formatPrice(o.amount_paid_cents ?? o.amount_total_cents)}</td>
                  <td data-label="Devuelto" className="num">{o.refunded_cents ? formatPrice(o.refunded_cents) : '—'}</td>
                  <td data-label="Fecha"><LocalDateTime iso={o.created_at} compact /></td>
                </tr>
              )}
              {payments.length === 0 && !o.stripe_payment_intent_id && (
                <tr><td colSpan={5} className="viz-empty">Sin pagos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section__head">
          <h2>Correos e historial</h2>
          <Form method="post">
            <input type="hidden" name="intent" value="resend" />
            <SubmitButton className="btn btn-outline btn-sm" match={{ intent: 'resend' }} pendingText="Enviando…" disabled={!o.customer_email}>
              Reenviar estado al cliente
            </SubmitButton>
          </Form>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead><tr><th>Qué</th><th>Quién</th><th>Detalle</th><th>Fecha</th></tr></thead>
            <tbody>
              {notifications.length === 0 && audit.length === 0 && (
                <tr><td colSpan={4} className="viz-empty">Sin movimientos todavía.</td></tr>
              )}
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td data-label="Qué">Correo · {n.template}</td>
                  <td data-label="Estado">{n.status}</td>
                  <td data-label="Detalle" className="admin-muted">{n.last_error ?? '—'}</td>
                  <td data-label="Fecha" className="nowrap"><LocalDateTime iso={n.created_at} compact /></td>
                </tr>
              ))}
              {audit.map((e) =>
                e.action === 'order_emails' ? (
                  <tr key={`a${e.id}`}>
                    <td data-label="Qué">Correos de compra</td>
                    <td data-label="Quién">{ACTOR_LABEL[e.actor_type] ?? e.actor_type}</td>
                    <td data-label="Detalle">
                      Cliente: {EMAIL_OUTCOME[String(e.data?.customer)] ?? '—'} · Tienda: {EMAIL_OUTCOME[String(e.data?.shop)] ?? '—'}
                      {Array.isArray(e.data?.errors) && (e.data.errors as unknown[]).length > 0 && (
                        <span className="cell-sub">{(e.data.errors as unknown[]).map(String).join(' · ')}</span>
                      )}
                    </td>
                    <td data-label="Fecha" className="nowrap"><LocalDateTime iso={e.created_at} compact /></td>
                  </tr>
                ) : (
                  <tr key={`a${e.id}`}>
                    <td data-label="Qué">{AUDIT_LABEL[e.action] ?? e.action}</td>
                    <td data-label="Quién">{ACTOR_LABEL[e.actor_type] ?? e.actor_type}</td>
                    <td data-label="Detalle"><pre className="admin-pre">{JSON.stringify(e.data)}</pre></td>
                    <td data-label="Fecha" className="nowrap"><LocalDateTime iso={e.created_at} compact /></td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
