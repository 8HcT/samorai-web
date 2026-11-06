import type { Route } from './+types/emails';
import { Form, Link, data, useNavigation } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { listNotifications, releaseHeldNotifications, requeueNotification } from '~/lib/presale/admin.server';
import { adminReason } from '~/lib/presale/admin-forms.server';
import { presaleBulkEmailsEnabled, assertPresaleEnabled } from '~/lib/presale/config.server';
import { dispatchNotifications } from '~/lib/email/outbox.server';
import { isUuid } from '~/lib/presale/views.server';
import { assertSameOrigin } from '~/lib/security.server';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export async function loader({ request }: Route.LoaderArgs) {
  assertPresaleEnabled();
  await requireAdmin(request);
  const status = new URL(request.url).searchParams.get('status') || null;
  return { notifications: await listNotifications(status), status, bulkEnabled: presaleBulkEmailsEnabled() };
}

export async function action({ request }: Route.ActionArgs) {
  assertPresaleEnabled();
  assertSameOrigin(request);
  const { user } = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (intent === 'requeue') {
    const id = String(form.get('id') ?? '');
    if (!isUuid(id)) return data({ ok: false, message: 'Correo no válido.' }, { status: 400 });
    const res = await requeueNotification(id, user.id);
    if (!res.ok) return data({ ok: false, message: adminReason(res.reason) }, { status: 400 });
    const sent = await dispatchNotifications({ ids: [id] });
    return { ok: true, message: sent.sent ? 'Correo enviado.' : 'Correo en cola para el próximo envío.' };
  }
  if (intent === 'release_held') {
    if (!presaleBulkEmailsEnabled()) {
      return data({ ok: false, message: 'Activa antes PRESALE_BULK_EMAILS_ENABLED=true (validación expresa de envíos automáticos).' }, { status: 400 });
    }
    const res = await releaseHeldNotifications(null, user.id);
    return { ok: true, message: `${res.released ?? 0} correo(s) liberado(s). Saldrán en la próxima ejecución programada (cada 5 min).` };
  }
  if (intent === 'dispatch') {
    const sent = await dispatchNotifications({ limit: 40 });
    return { ok: true, message: sent.skipped ? 'Resend no está configurado.' : `Enviados ${sent.sent}, con error ${sent.failed}, cancelados ${sent.cancelled}.` };
  }
  return data({ ok: false, message: 'Acción no reconocida.' }, { status: 400 });
}

const STATUSES = ['pending', 'held', 'sending', 'sent', 'failed', 'cancelled'];

export default function AdminEmails({ loaderData, actionData }: Route.ComponentProps) {
  const { notifications, status, bulkEnabled } = loaderData;
  const busy = useNavigation().state !== 'idle';
  return (
    <>
      <h1 className="admin-title">Correos</h1>
      <p className="admin-sub">
        Registro de cada envío con Resend: intentos, errores y reintentos automáticos. Los correos automáticos o masivos quedan
        retenidos mientras PRESALE_BULK_EMAILS_ENABLED no sea «true».
      </p>
      {actionData && <div className={`admin-notice ${actionData.ok ? 'admin-notice--ok' : 'admin-notice--error'}`} role="status">{actionData.message}</div>}

      <div className="admin-filters">
        <Form method="get" className="admin-actions">
          <label className="admin-field">Estado
            <select name="status" defaultValue={status ?? ''}>
              <option value="">Todos</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-outline btn-sm">Filtrar</button>
        </Form>
        <Form method="post"><input type="hidden" name="intent" value="dispatch" /><button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Enviar pendientes ahora</button></Form>
        <Form method="post"><input type="hidden" name="intent" value="release_held" /><button type="submit" className="btn btn-ghost btn-sm" disabled={busy || !bulkEnabled}>Liberar retenidos</button></Form>
      </div>

      <div className="admin-table-wrap admin-section" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead><tr><th>Plantilla</th><th>Para</th><th>Estado</th><th className="num">Intentos</th><th>Error</th><th>Fecha</th><th /></tr></thead>
          <tbody>
            {notifications.length === 0 && <tr><td colSpan={7} className="admin-muted">Sin correos.</td></tr>}
            {notifications.map((n) => (
              <tr key={n.id}>
                <td>
                  {n.template}{n.is_bulk && <span className="admin-muted"> · automático</span>}
                  <div className="admin-muted">
                    {n.reservation_id && <Link to={`/admin/reservas/${n.reservation_id}`}>reserva</Link>}
                    {n.order_id && <> <Link to={`/admin/pedidos/${n.order_id}`}>pedido</Link></>}
                  </div>
                </td>
                <td>{n.audience === 'shop' ? 'Tienda' : n.to_email}</td>
                <td>{n.status}</td>
                <td className="num">{n.attempts}/{n.max_attempts}</td>
                <td className="admin-muted" style={{ maxWidth: 320 }}>{n.last_error ?? '—'}</td>
                <td>{n.sent_at ? <LocalDateTime iso={n.sent_at} /> : <LocalDateTime iso={n.created_at} />}</td>
                <td>
                  {(n.status === 'failed' || n.status === 'cancelled') && (
                    <Form method="post"><input type="hidden" name="intent" value="requeue" /><input type="hidden" name="id" value={n.id} /><button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Reintentar</button></Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
