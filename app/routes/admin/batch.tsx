import type { Route } from './+types/batch';
import { Form, Link, data, useNavigation } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import {
  cancelBatch,
  catalogProducts,
  deleteQuota,
  launchBatch,
  loadBatch,
  releaseHeldNotifications,
  setBatchProducts,
  setBatchStatus,
  updateBatch,
  upsertQuota,
} from '~/lib/presale/admin.server';
import { adminReason, parseBatchForm } from '~/lib/presale/admin-forms.server';
import { presaleBulkEmailsEnabled } from '~/lib/presale/config.server';
import { BATCH_STATUS_LABEL, label } from '~/lib/presale/labels';
import { isUuid } from '~/lib/presale/views.server';
import { assertSameOrigin } from '~/lib/security.server';
import { formatEt, formatSize } from '~/lib/format';
import { BatchForm } from '~/components/admin/BatchForm';
import { StockBar } from '~/components/admin/AdminViz';
import { DemandPanels, KpiPanel } from '~/components/admin/DemandPanels';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  if (!isUuid(params.id)) throw new Response('Tirada no encontrada', { status: 404 });
  const detail = await loadBatch(params.id);
  if (!detail) throw new Response('Tirada no encontrada', { status: 404 });
  return {
    ...detail,
    products: catalogProducts(),
    bulkEmails: presaleBulkEmailsEnabled(),
    created: new URL(request.url).searchParams.has('creada'),
  };
}

type ActionResult = { ok: boolean; message: string };

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireAdmin(request);
  if (!isUuid(params.id)) throw new Response('Tirada no encontrada', { status: 404 });
  const id = params.id;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const done = (ok: boolean, message: string) => data<ActionResult>({ ok, message }, { status: ok ? 200 : 400 });

  switch (intent) {
    case 'update': {
      const { fields, errors } = parseBatchForm(form);
      if (errors.length) return done(false, errors.join(' · '));
      const res = await updateBatch(id, fields, user.id);
      return res.ok ? done(true, 'Tirada guardada. Los cambios solo afectan a reservas nuevas.') : done(false, adminReason(res.reason));
    }
    case 'products': {
      const valid = new Set(catalogProducts().map((p) => p.slug));
      const res = await setBatchProducts(id, form.getAll('products').map(String).filter((s) => valid.has(s)), user.id);
      return res.ok ? done(true, 'Modelos actualizados.') : done(false, adminReason(res.reason));
    }
    case 'quota_upsert': {
      const variant = String(form.get('variant_id') ?? '');
      const product = catalogProducts().find((p) => p.slug === String(form.get('product_slug')));
      if (!product) return done(false, 'Modelo no válido.');
      const v = product.variants.find((x) => x.id === variant);
      const finish = v ? v.finishId : String(form.get('finish_id') ?? '');
      if (finish && !product.finishes.some((f) => f.id === finish)) return done(false, 'Acabado no válido.');
      const capacity = Number(form.get('capacity_sets'));
      if (!Number.isInteger(capacity) || capacity < 0) return done(false, 'Cupo no válido.');
      const res = await upsertQuota(id, {
        product_slug: product.slug,
        finish_id: finish || null,
        variant_id: v ? v.id : null,
        capacity_sets: capacity,
        note: String(form.get('note') ?? '').slice(0, 300),
      }, user.id);
      return res.ok ? done(true, 'Cupo guardado.') : done(false, adminReason(res.reason));
    }
    case 'quota_delete': {
      const quotaId = String(form.get('quota_id') ?? '');
      if (!isUuid(quotaId)) return done(false, 'Cupo no válido.');
      const res = await deleteQuota(quotaId, user.id);
      return res.ok ? done(true, 'Cupo eliminado.') : done(false, adminReason(res.reason));
    }
    case 'status': {
      const to = String(form.get('to') ?? '');
      const res = await setBatchStatus(id, to, user.id);
      return res.ok ? done(true, `Estado cambiado a «${label(BATCH_STATUS_LABEL, to)}».`) : done(false, adminReason(res.reason));
    }
    case 'launch': {
      if (form.get('confirm') !== 'on') return done(false, 'Marca la casilla de confirmación del lanzamiento.');
      const res = await launchBatch(id, user.id);
      return res.ok
        ? done(true, `Lanzamiento activado. ${res.reservations} reserva(s) con plazo de pago abierto.${presaleBulkEmailsEnabled() ? '' : ' Los correos de lanzamiento quedan RETENIDOS hasta activar PRESALE_BULK_EMAILS_ENABLED.'}`)
        : done(false, adminReason(res.reason));
    }
    case 'cancel': {
      if (form.get('confirm') !== 'on') return done(false, 'Marca la casilla de confirmación.');
      const reason = String(form.get('reason') ?? '').trim();
      const res = await cancelBatch(id, reason, user.id);
      return res.ok
        ? done(true, `Tirada cancelada: ${res.reservations_cancelled} reserva(s) cancelada(s) con la reserva abonada marcada para devolver; ${res.paid_orders_to_review} pedido(s) pagado(s) a revisar.`)
        : done(false, adminReason(res.reason));
    }
    case 'release_emails': {
      if (!presaleBulkEmailsEnabled()) return done(false, 'Activa antes PRESALE_BULK_EMAILS_ENABLED=true en el entorno.');
      const res = await releaseHeldNotifications(id, user.id);
      return done(true, `${res.released ?? 0} correo(s) liberado(s): saldrán en la próxima ejecución programada.`);
    }
    default:
      return done(false, 'Acción no reconocida.');
  }
}

const NEXT_STATUS: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: 'presale_open', label: 'Abrir preventa' }],
  presale_open: [{ to: 'presale_closed', label: 'Cerrar preventa' }],
  presale_closed: [{ to: 'presale_open', label: 'Reabrir preventa' }],
  launched: [
    { to: 'in_production', label: 'Marcar «En producción»' },
    { to: 'available', label: 'Marcar «Disponible»' },
  ],
  in_production: [{ to: 'available', label: 'Marcar «Disponible»' }],
  available: [{ to: 'completed', label: 'Finalizar tirada' }],
};

const RELEASE_LABEL: Record<string, string> = {
  hold_expired: 'Retenciones caducadas',
  checkout_expired: 'Checkouts caducados',
  checkout_cancelled: 'Checkouts cancelados',
  payment_failed: 'Pagos fallidos',
  stripe_error: 'Errores de Stripe',
  reservation_expired: 'Reservas caducadas',
  reservation_cancelled: 'Reservas canceladas',
  order_cancelled: 'Pedidos cancelados',
  batch_cancelled: 'Tirada cancelada',
};

export default function AdminBatch({ loaderData, actionData }: Route.ComponentProps) {
  const { batch, inventory, stats, audit, released, statusCounts, products, productSlugs, bulkEmails, created } = loaderData;
  const busy = useNavigation().state !== 'idle';
  const canLaunch = ['draft', 'presale_open', 'presale_closed'].includes(batch.status);
  const closed = ['completed', 'cancelled'].includes(batch.status);
  const included = products.filter((p) => productSlugs.includes(p.slug));

  return (
    <>
      <p className="admin-muted"><Link to="/admin/tiradas">← Tiradas</Link></p>
      <h1 className="admin-title">{batch.name}</h1>
      <p className="admin-sub">
        {batch.code} · {label(BATCH_STATUS_LABEL, batch.status)}
        {batch.launched_at && <> · Lanzada el <LocalDateTime iso={batch.launched_at} /></>}
      </p>

      {created && <div className="admin-notice admin-notice--ok">Tirada creada en borrador. Revisa las condiciones y ábrela cuando esté lista.</div>}
      {actionData && (
        <div className={`admin-notice ${actionData.ok ? 'admin-notice--ok' : 'admin-notice--error'}`} role="status">{actionData.message}</div>
      )}

      <section className="admin-section">
        <h2>Stock (juegos de {batch.units_per_set})</h2>
        <StockBar
          capacity={inventory.capacity_sets}
          available={inventory.available_sets}
          segments={[
            { key: 'sold', label: 'Vendidos', value: inventory.sold_sets },
            { key: 'reserved', label: 'Reservados', value: inventory.reserved_sets },
            { key: 'held', label: 'En checkout', value: inventory.held_sets },
          ]}
        />
        <p className="admin-muted" style={{ marginTop: 'var(--space-3)' }}>
          Vendidos: {inventory.sold_presale_sets} por preventa · {inventory.sold_direct_sets} en venta directa. Las retenciones de checkout caducan solas a los pocos minutos.
        </p>
        {Object.keys(inventory.released).length > 0 && (
          <dl className="admin-kv" style={{ marginTop: 'var(--space-4)' }}>
            {Object.entries(inventory.released).map(([reason, n]) => (
              <div key={reason} style={{ display: 'contents' }}>
                <dt>{RELEASE_LABEL[reason] ?? reason}</dt><dd>{n} juego(s) liberado(s)</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="admin-section">
        <h2>Hitos</h2>
        <p className="admin-muted">Las transiciones las confirma el administrador. Solo el cierre automático de la preventa (al llegar su fecha de cierre) es automático.</p>
        <div className="admin-actions" style={{ marginBottom: 'var(--space-4)' }}>
          {(NEXT_STATUS[batch.status] ?? []).map((n) => (
            <Form method="post" key={n.to}>
              <input type="hidden" name="intent" value="status" />
              <input type="hidden" name="to" value={n.to} />
              <button type="submit" className="btn btn-outline btn-sm" disabled={busy}>{n.label}</button>
            </Form>
          ))}
        </div>

        {canLaunch && (
          <div className="admin-danger" style={{ marginBottom: 'var(--space-4)' }}>
            <h3>Activar el lanzamiento oficial</h3>
            <p className="admin-muted">
              Fija hoy como fecha efectiva, abre el plazo de pago de {statusCounts.confirmed ?? 0} reserva(s) confirmada(s)
              ({batch.balance_window_days} días: fecha límite exacta en UTC), habilita la venta directa del stock no reservado y encola el correo de lanzamiento
              {bulkEmails ? '.' : ' (RETENIDO hasta activar los envíos automáticos).'} No se cobra nada automáticamente.
            </p>
            <Form method="post" className="admin-actions">
              <input type="hidden" name="intent" value="launch" />
              <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo el lanzamiento oficial</label>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Lanzar</button>
            </Form>
          </div>
        )}

        {!closed && (
          <details>
            <summary className="admin-muted">Cancelar la tirada…</summary>
            <div className="admin-danger" style={{ marginTop: 'var(--space-3)' }}>
              <p className="admin-muted">
                Libera las plazas retenidas y reservadas, cancela las reservas y marca su reserva abonada para devolver (la devolución se ejecuta después, reserva a reserva). Los pedidos ya pagados no se tocan: quedan para revisión.
              </p>
              <Form method="post" className="admin-form">
                <input type="hidden" name="intent" value="cancel" />
                <label className="admin-field">Motivo (se guarda en el historial)<textarea name="reason" required style={{ minHeight: 60 }} /></label>
                <label className="admin-check"><input type="checkbox" name="confirm" required /> Confirmo la cancelación de la tirada</label>
                <div><button type="submit" className="btn btn-outline btn-sm" disabled={busy}>Cancelar tirada</button></div>
              </Form>
            </div>
          </details>
        )}
      </section>

      <section className="admin-section">
        <h2>Indicadores de la tirada</h2>
        <KpiPanel stats={stats} />
        <p className="admin-muted" style={{ marginTop: 'var(--space-3)' }}>
          <Link to={`/admin/reservas?batch=${batch.id}`}>Ver las reservas de esta tirada</Link> ·{' '}
          <a href={`/admin/reservas.csv?batch=${batch.id}`}>Exportar CSV (planificación de fabricación)</a>
        </p>
      </section>

      <section className="admin-section">
        <h2>Configuraciones más demandadas</h2>
        <DemandPanels stats={stats} />
      </section>

      <div className="admin-grid-2">
        <section className="admin-section">
          <h2>Modelos incluidos</h2>
          <Form method="post" className="admin-form">
            <input type="hidden" name="intent" value="products" />
            {products.map((p) => (
              <label key={p.slug} className="admin-check">
                <input type="checkbox" name="products" value={p.slug} defaultChecked={productSlugs.includes(p.slug)} disabled={closed} />
                {p.name}
              </label>
            ))}
            {!closed && <div><button type="submit" className="btn btn-outline btn-sm" disabled={busy}>Guardar modelos</button></div>}
          </Form>
        </section>

        <section className="admin-section">
          <h2>Cupos por acabado o referencia (opcional)</h2>
          <p className="admin-muted">Limitan una parte de la capacidad. Un cupo 0 bloquea una configuración que no puede fabricarse en esta tirada.</p>
          {inventory.quotas.length > 0 && (
            <table className="admin-table" style={{ marginBottom: 'var(--space-4)' }}>
              <thead><tr><th>Ámbito</th><th className="num">Cupo</th><th className="num">Libre</th><th /></tr></thead>
              <tbody>
                {inventory.quotas.map((q) => {
                  const product = products.find((p) => p.slug === q.product_slug);
                  const finish = product?.finishes.find((f) => f.id === q.finish_id);
                  const variant = product?.variants.find((v) => v.id === q.variant_id);
                  return (
                    <tr key={q.id}>
                      <td>
                        {product?.name ?? q.product_slug}
                        {finish ? ` · ${finish.name}` : ''}
                        {variant ? ` · ${formatSize(variant.diameter, variant.width)} ${formatEt(variant.et)}` : ''}
                        {q.note && <div className="admin-muted">{q.note}</div>}
                      </td>
                      <td className="num">{q.capacity_sets}</td>
                      <td className="num">{Math.max(0, q.remaining)}</td>
                      <td>
                        {!closed && (
                          <Form method="post">
                            <input type="hidden" name="intent" value="quota_delete" />
                            <input type="hidden" name="quota_id" value={q.id} />
                            <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>Quitar</button>
                          </Form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!closed && included.length > 0 && (
            <Form method="post" className="admin-form">
              <input type="hidden" name="intent" value="quota_upsert" />
              <div className="admin-form-row">
                <label className="admin-field">Modelo
                  <select name="product_slug" defaultValue={included[0].slug}>
                    {included.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                  </select>
                </label>
                <label className="admin-field">Acabado (opcional)
                  <select name="finish_id" defaultValue="">
                    <option value="">Todos</option>
                    {included.flatMap((p) => p.finishes.map((f) => <option key={`${p.slug}-${f.id}`} value={f.id}>{f.name}</option>))}
                  </select>
                </label>
                <label className="admin-field">Referencia (opcional)
                  <select name="variant_id" defaultValue="">
                    <option value="">Todas</option>
                    {included.flatMap((p) =>
                      p.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {p.finishes.find((f) => f.id === v.finishId)?.name} {formatSize(v.diameter, v.width)} {formatEt(v.et)}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="admin-field">Cupo (juegos)<input name="capacity_sets" type="number" min={0} required /></label>
              </div>
              <label className="admin-field">Nota<input name="note" maxLength={300} placeholder="Motivo del cupo" /></label>
              <div><button type="submit" className="btn btn-outline btn-sm" disabled={busy}>Guardar cupo</button></div>
            </Form>
          )}
        </section>
      </div>

      {released.length > 0 && (
        <section className="admin-section">
          <h2>Unidades liberadas (de vuelta a la venta)</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Fecha</th><th>Motivo</th><th>Referencia</th><th className="num">Juegos</th><th>Reserva</th></tr></thead>
              <tbody>
                {released.map((a: any) => (
                  <tr key={a.id}>
                    <td><LocalDateTime iso={a.released_at} /></td>
                    <td>{RELEASE_LABEL[a.release_reason] ?? a.release_reason}</td>
                    <td className="admin-muted">{a.variant_id}</td>
                    <td className="num">{a.quantity_sets}</td>
                    <td>{a.reservation_id ? <Link to={`/admin/reservas/${a.reservation_id}`}>{a.reservations?.code ?? 'Ver'}</Link> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="admin-section">
        <h2>Correos automáticos de la tirada</h2>
        <Form method="post" className="admin-actions">
          <input type="hidden" name="intent" value="release_emails" />
          <button type="submit" className="btn btn-outline btn-sm" disabled={busy || !bulkEmails}>Liberar correos retenidos de esta tirada</button>
          {!bulkEmails && <span className="admin-muted">Requiere PRESALE_BULK_EMAILS_ENABLED=true (validación expresa).</span>}
        </Form>
      </section>

      <section className="admin-section">
        <h2>Configuración</h2>
        <BatchForm intent="update" batch={batch} products={products} submitLabel="Guardar cambios" busy={busy} />
      </section>

      <section className="admin-section">
        <h2>Historial</h2>
        {audit.length === 0 ? <p className="viz-empty">Sin eventos.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Fecha</th><th>Acción</th><th>Quién</th><th>Detalle</th></tr></thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td><LocalDateTime iso={e.created_at} /></td>
                    <td>{e.action}</td>
                    <td>{e.actor_type}</td>
                    <td><pre className="admin-pre">{JSON.stringify(e.data, null, 1)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
