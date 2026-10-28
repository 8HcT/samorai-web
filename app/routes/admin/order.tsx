import type { Route } from './+types/order';
import { Form, Link, data, useNavigation } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { cancelOrder, loadOrder, refundOrder, resendEmail, rotateAccess, updateOrderStatus } from '~/lib/presale/admin.server';
import { adminReason } from '~/lib/presale/admin-forms.server';
import { ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';
import { isUuid } from '~/lib/presale/views.server';
import { assertSameOrigin } from '~/lib/security.server';
import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  if (!isUuid(params.id)) throw new Response('Pedido no encontrado', { status: 404 });
  const detail = await loadOrder(params.id);
  if (!detail) throw new Response('Pedido no encontrado', { status: 404 });
  return detail;
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
        return res.ok ? done(true, 'Devolución creada en Stripe para todos los pagos del pedido.') : done(false, 'Alguna devolución falló: revisa los pagos.');
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
    return done(false, err instanceof Error ? err.message : 'Error inesperado.');
  }
}

const NEXT: Record<string, string[]> = {
  paid: ['in_production', 'ready_to_ship', 'shipped'],
  in_production: ['ready_to_ship', 'shipped'],
  ready_to_ship: ['shipped'],
  shipped: ['delivered'],
};

export default function AdminOrder({ loaderData, actionData }: Route.ComponentProps) {
  const { order: o, items, payments, notifications, audit, reservation, guestLink } = loaderData;
  const busy = useNavigation().state !== 'idle';
  const next = NEXT[o.status] ?? [];
  const closed = o.status === 'cancelled' || o.status === 'refunded';
  const address = o.shipping_address;

  return (
    <>
      <p className="admin-muted"><Link to="/admin/pedidos">← Pedidos</Link></p>
      <h1 className="admin-title">Pedido {o.code ?? o.stripe_session_id.slice(-8).toUpperCase()}</h1>
      <p className="admin-sub">
        {label(ORDER_STATUS_LABEL, o.status)} · {o.kind}
        {reservation && <> · Reserva <Link to={`/admin/reservas/${reservation.id}`}>{reservation.code}</Link></>}
        {o.review_reason && <> · ⚠ {o.review_reason}</>}
      </p>
      {actionData && <div className={`admin-notice ${actionData.ok ? 'admin-notice--ok' : 'admin-notice--error'}`} role="status">{actionData.message}</div>}

      <div className="admin-grid-2">
        <section className="admin-section">
          <h2>Artículos</h2>
          <table className="admin-table">
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.product_name}{i.finish_name ? ` · ${i.finish_name}` : ''}
                    <div className="admin-muted">
                      {i.diameter != null && i.width != null ? formatSize(Number(i.diameter), Number(i.width)) : ''} {i.et != null ? formatEt(i.et) : ''} · {i.variant_id}
                    </div>
                  </td>
                  <td className="num">{i.quantity} uds.</td>
                  <td className="num">{formatPrice(i.unit_price_cents * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="admin-kv" style={{ marginTop: 'var(--space-4)' }}>
            {o.discount_cents > 0 && (<><dt>Descuento preventa</dt><dd>−{formatPrice(o.discount_cents)}</dd></>)}
            <dt>Total</dt><dd>{formatPrice(o.amount_total_cents)}</dd>
            <dt>Cobrado</dt><dd>{formatPrice(o.amount_paid_cents ?? o.amount_total_cents)}</dd>
            <dt>Devuelto</dt><dd>{formatPrice(o.refunded_cents)}</dd>
          </dl>
        </section>
        <section className="admin-section">
          <h2>Cliente y envío</h2>
          <dl className="admin-kv">
            <dt>Nombre</dt><dd>{o.customer_name ?? '—'}</dd>
            <dt>Email</dt><dd>{o.customer_email ?? '—'}</dd>
            <dt>Teléfono</dt><dd>{o.customer_phone ?? '—'}</dd>
            <dt>Dirección</dt>
            <dd>{address ? [address.name, address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' '), address.state, address.country].filter(Boolean).join(', ') : '—'}</dd>
            <dt>Transportista</dt><dd>{o.carrier ?? '—'}</dd>
            <dt>Seguimiento</dt><dd>{o.tracking_number ?? '—'}</dd>
            <dt>Fecha</dt><dd><LocalDateTime iso={o.created_at} /></dd>
          </dl>
          <p className="admin-muted" style={{ marginTop: 'var(--space-3)' }}>Enlace del cliente: <span className="admin-copy">{guestLink}</span></p>
          <Form method="post"><input type="hidden" name="intent" value="rotate" /><button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Invalidar enlaces anteriores</button></Form>
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
              <label className="admin-field">Transportista<input name="carrier" defaultValue={o.carrier ?? ''} maxLength={80} /></label>
              <label className="admin-field">Nº de seguimiento<input name="tracking" defaultValue={o.tracking_number ?? ''} maxLength={120} /></label>
            </div>
            <label className="admin-check"><input type="checkbox" name="notify" defaultChecked /> Avisar al cliente por email (fabricación / envío / entrega)</label>
            <div><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Actualizar</button></div>
          </Form>
        </section>
      )}

      {!closed && (
        <section className="admin-section">
          <h2>Cancelación y devolución</h2>
          <div className="admin-grid-2">
            <Form method="post" className="admin-form admin-danger">
              <h3>Devolver el importe cobrado</h3>
              <input type="hidden" name="intent" value="refund" />
              <p className="admin-muted">Crea en Stripe la devolución de todos los pagos del pedido (incluida la reserva abonada en preventa).</p>
              <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo la devolución</label>
              <div><button type="submit" className="btn btn-outline btn-sm" disabled={busy}>Devolver</button></div>
            </Form>
            <Form method="post" className="admin-form admin-danger">
              <h3>Cancelar el pedido</h3>
              <input type="hidden" name="intent" value="cancel" />
              <label className="admin-field">Motivo<textarea name="reason" required style={{ minHeight: 60 }} /></label>
              <label className="admin-check"><input type="checkbox" name="release" /> Devolver las unidades al stock (no enviadas o recibidas de vuelta)</label>
              <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo la cancelación</label>
              <div><button type="submit" className="btn btn-outline btn-sm" disabled={busy}>Cancelar pedido</button></div>
            </Form>
          </div>
        </section>
      )}

      <section className="admin-section">
        <h2>Pagos</h2>
        <table className="admin-table">
          <thead><tr><th>Tipo</th><th>Estado</th><th className="num">Importe</th><th className="num">Devuelto</th><th>Fecha</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.purpose}</td><td>{p.status}</td>
                <td className="num">{formatPrice(p.amount_cents)}</td>
                <td className="num">{p.refunded_cents ? formatPrice(p.refunded_cents) : '—'}</td>
                <td>{p.paid_at ? <LocalDateTime iso={p.paid_at} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Correos e historial</h2>
        <Form method="post" className="admin-actions" style={{ marginBottom: 'var(--space-4)' }}>
          <input type="hidden" name="intent" value="resend" />
          <button type="submit" className="btn btn-ghost btn-sm" disabled={busy || !o.customer_email}>Reenviar estado del pedido al cliente</button>
        </Form>
        <table className="admin-table">
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id}><td>{n.template}</td><td>{n.status}</td><td className="admin-muted">{n.last_error ?? ''}</td><td><LocalDateTime iso={n.created_at} /></td></tr>
            ))}
            {audit.map((e) => (
              <tr key={`a${e.id}`}><td>{e.action}</td><td>{e.actor_type}</td><td><pre className="admin-pre">{JSON.stringify(e.data)}</pre></td><td><LocalDateTime iso={e.created_at} /></td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
