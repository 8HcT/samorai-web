import type { Route } from './+types/prices';
import { Form, Link, data, redirect, useNavigation, useSearchParams } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';
import { formatPrice } from '~/lib/money';
import { formatSize } from '~/lib/format';
import { applyPercentOff } from '~/lib/pricing';
import { utcIsoToMadridLocal } from '~/lib/presale/datetime';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { StatusChip } from '~/components/admin/AdminViz';
import {
  PRICING_REASON,
  deletePromotion,
  loadPricingAdmin,
  parsePromotionForm,
  savePromotion,
  setPrice,
  setPromotionActive,
  type PromotionRow,
} from '~/lib/pricing-admin.server';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  try {
    return { ...(await loadPricingAdmin()), setupMissing: false, now: new Date().toISOString() };
  } catch (err) {
    console.error('[admin][precios] no se pudo leer', err);
    return { prices: [], promotions: [], scope: [], setupMissing: true, now: new Date().toISOString() };
  }
}

type ActionData = { ok?: string; errors?: string[] };

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const fail = (reason: string) => data<ActionData>({ errors: [PRICING_REASON[reason] ?? reason] }, { status: 400 });

  if (intent === 'set_price') {
    const res = await setPrice(
      { productSlug: String(form.get('product_slug') ?? ''), width: Number(form.get('width')), euros: String(form.get('price') ?? '') },
      user.id
    );
    if (!res.ok) return fail(res.reason);
    return data<ActionData>({ ok: 'Precio guardado.' });
  }

  if (intent === 'save_promotion') {
    const id = String(form.get('id') ?? '') || null;
    const { fields, errors } = parsePromotionForm(form);
    if (errors.length > 0) return data<ActionData>({ errors }, { status: 400 });
    const res = await savePromotion(id, fields, user.id);
    if (!res.ok) return fail(res.reason);
    throw redirect('/admin/precios?guardada=1');
  }

  const id = String(form.get('id') ?? '');
  if (intent === 'toggle_promotion') {
    const res = await setPromotionActive(id, form.get('active') === 'true', user.id);
    if (!res.ok) return fail(res.reason);
    return data<ActionData>({ ok: form.get('active') === 'true' ? 'Promoción reanudada.' : 'Promoción pausada.' });
  }
  if (intent === 'delete_promotion') {
    const res = await deletePromotion(id, user.id);
    if (!res.ok) return fail(res.reason);
    throw redirect('/admin/precios');
  }
  return fail('invalid_fields');
}

function promotionState(p: PromotionRow, now: string): { label: string; tone: 'good' | 'warning' | 'neutral' } {
  if (!p.active) return { label: 'Pausada', tone: 'neutral' };
  if (p.ends_at <= now) return { label: 'Finalizada', tone: 'neutral' };
  if (p.starts_at > now) return { label: 'Programada', tone: 'warning' };
  return { label: 'Activa', tone: 'good' };
}

export default function AdminPrices({ loaderData, actionData }: Route.ComponentProps) {
  const { prices, promotions, scope, setupMissing, now } = loaderData;
  const busy = useNavigation().state !== 'idle';
  const [params] = useSearchParams();
  const editing = promotions.find((p) => p.id === params.get('editar')) ?? null;
  const ad = actionData as ActionData | undefined;

  const scopeLabel = (p: PromotionRow) => {
    const models = p.product_slugs.length === 0 ? 'Todos los modelos' : p.product_slugs.map((s) => scope.find((x) => x.slug === s)?.name ?? s).join(', ');
    const allFinishes = scope.flatMap((x) => x.finishes);
    const finishes = p.finish_ids.length === 0 ? 'todos los acabados' : p.finish_ids.map((id) => allFinishes.find((f) => f.id === id)?.name ?? id).join(', ');
    return `${models} · ${finishes}`;
  };

  return (
    <>
      <h1 className="admin-title">Precios y promociones</h1>
      <p className="admin-sub">
        Precios finales por llanta, IVA incluido. Las promociones se aplican solas entre su inicio y su fin (hora de Madrid).
        Si coinciden varias en una llanta, se aplica la de mayor descuento (no se acumulan).
      </p>

      {setupMissing && (
        <div className="admin-notice admin-notice--error" role="alert">
          No se pudo leer la configuración de precios. ¿Está aplicada la migración <code>20261106100000_pricing_promotions.sql</code> en Supabase?
        </div>
      )}
      {ad?.errors && (
        <div className="admin-notice admin-notice--error" role="alert">
          {ad.errors.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}
      {(ad?.ok || params.get('guardada')) && (
        <div className="admin-notice admin-notice--ok" role="status">{ad?.ok ?? 'Promoción guardada.'}</div>
      )}

      <section className="admin-section">
        <h2>Precios por medida</h2>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr><th>Modelo</th><th>Medida</th><th>Precio por llanta (€)</th><th>Última modificación</th></tr>
            </thead>
            <tbody>
              {prices.map((row) => (
                <tr key={`${row.productSlug}-${row.width}`}>
                  <td>{row.productName}</td>
                  <td>{formatSize(18, row.width)}</td>
                  <td>
                    <Form method="post" className="admin-actions">
                      <input type="hidden" name="intent" value="set_price" />
                      <input type="hidden" name="product_slug" value={row.productSlug} />
                      <input type="hidden" name="width" value={row.width} />
                      <label className="admin-field">
                        <span className="sr-only">Precio {row.productName} {formatSize(18, row.width)}</span>
                        <input
                          name="price"
                          inputMode="decimal"
                          required
                          defaultValue={String((row.storedCents ?? row.defaultCents) / 100).replace('.', ',')}
                          style={{ width: '8em' }}
                        />
                      </label>
                      <button className="btn btn-outline btn-sm" disabled={busy || setupMissing}>Guardar</button>
                    </Form>
                  </td>
                  <td className="admin-muted">
                    {row.updatedAt ? <LocalDateTime iso={row.updatedAt} /> : 'Precio inicial'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>Promociones</h2>
        {promotions.length === 0 ? (
          <p className="viz-empty">Todavía no hay promociones.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--stack">
              <thead>
                <tr><th>Promoción</th><th>Estado</th><th className="num">Descuento</th><th>Fechas</th><th>Aplica a</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {promotions.map((p) => {
                  const state = promotionState(p, now);
                  return (
                    <tr key={p.id}>
                      <td>{p.name}<div className="admin-muted">Etiqueta: «{p.badge} −{p.percent_off}%»</div></td>
                      <td><StatusChip tone={state.tone}>{state.label}</StatusChip></td>
                      <td className="num">−{p.percent_off} %</td>
                      <td>
                        <LocalDateTime iso={p.starts_at} />
                        <div className="admin-muted">hasta <LocalDateTime iso={p.ends_at} /></div>
                      </td>
                      <td>{scopeLabel(p)}</td>
                      <td>
                        <div className="admin-actions">
                          <Link className="btn btn-ghost btn-sm" to={`/admin/precios?editar=${p.id}#promocion`}>Editar</Link>
                          <Form method="post">
                            <input type="hidden" name="intent" value="toggle_promotion" />
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="active" value={String(!p.active)} />
                            <button className="btn btn-ghost btn-sm" disabled={busy}>{p.active ? 'Pausar' : 'Reanudar'}</button>
                          </Form>
                          <Form method="post">
                            <input type="hidden" name="intent" value="delete_promotion" />
                            <input type="hidden" name="id" value={p.id} />
                            <button className="btn btn-ghost btn-sm" disabled={busy}>Eliminar</button>
                          </Form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section" id="promocion">
        <h2>{editing ? `Editar «${editing.name}»` : 'Nueva promoción'}</h2>
        <Form method="post" className="admin-form" key={editing?.id ?? 'new'}>
          <input type="hidden" name="intent" value="save_promotion" />
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="admin-form-row">
            <label className="admin-field">
              Nombre interno
              <input name="name" required maxLength={80} defaultValue={editing?.name ?? ''} placeholder="Black Friday 2026" />
            </label>
            <label className="admin-field">
              Etiqueta en la web
              <input name="badge" maxLength={40} defaultValue={editing?.badge ?? ''} placeholder="Black Friday" />
            </label>
            <label className="admin-field">
              Descuento (%)
              <input name="percent_off" type="number" min={1} max={90} required defaultValue={editing?.percent_off ?? 20} />
            </label>
          </div>
          <div className="admin-form-row">
            <label className="admin-field">
              Empieza (hora de Madrid)
              <input name="starts_at" type="datetime-local" required defaultValue={utcIsoToMadridLocal(editing?.starts_at)} />
            </label>
            <label className="admin-field">
              Termina (hora de Madrid)
              <input name="ends_at" type="datetime-local" required defaultValue={utcIsoToMadridLocal(editing?.ends_at)} />
            </label>
          </div>
          {scope.map((product) => (
            <fieldset key={product.slug} className="admin-form-row">
              <legend className="admin-muted">Aplica a (sin marcar nada = toda la tienda)</legend>
              <label className="admin-check">
                <input
                  type="checkbox"
                  name="product_slugs"
                  value={product.slug}
                  defaultChecked={!editing || editing.product_slugs.length === 0 || editing.product_slugs.includes(product.slug)}
                />
                {product.name} (modelo)
              </label>
              {product.finishes.map((f) => (
                <label key={f.id} className="admin-check">
                  <input
                    type="checkbox"
                    name="finish_ids"
                    value={f.id}
                    defaultChecked={!editing || editing.finish_ids.length === 0 || editing.finish_ids.includes(f.id)}
                  />
                  {f.name}
                </label>
              ))}
            </fieldset>
          ))}
          <label className="admin-check">
            <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
            Activa (si la desmarcas, queda pausada aunque esté en fechas)
          </label>
          {prices.length > 0 && (
            <p className="admin-muted">
              Ejemplo con −{editing?.percent_off ?? 20} %:{' '}
              {prices
                .map((r) => {
                  const base = r.storedCents ?? r.defaultCents;
                  return `${formatSize(18, r.width)}: ${formatPrice(base)} → ${formatPrice(applyPercentOff(base, editing?.percent_off ?? 20))}`;
                })
                .join(' · ')}
            </p>
          )}
          <div className="admin-actions">
            <button className="btn btn-primary" disabled={busy || setupMissing}>{editing ? 'Guardar cambios' : 'Crear promoción'}</button>
            {editing && <Link className="btn btn-ghost" to="/admin/precios">Cancelar</Link>}
          </div>
        </Form>
      </section>
    </>
  );
}
