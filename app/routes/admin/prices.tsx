import type { Route } from './+types/prices';
import { useEffect, useMemo, useState } from 'react';
import { Form, Link, data, redirect, useFetcher, useSearchParams } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';
import { formatPrice } from '~/lib/money';
import { formatSize } from '~/lib/format';
import { applyPercentOff } from '~/lib/pricing';
import { madridLocalToUtcIso, utcIsoToMadridLocal } from '~/lib/presale/datetime';
import {
  addDaysLocal,
  describeDuration,
  isLocalDateTime,
  lastDiscountDay,
  longDateTime,
  minutesBetween,
  nextWeekdayMidnight,
  nowLocal,
  shortSpan,
  tomorrowMidnight,
} from '~/lib/admin/promo-dates';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { StatusChip } from '~/components/admin/AdminViz';
import { PriceTable } from '~/components/admin/PriceTable';
import { Spinner } from '~/components/ui/Spinner';
import { SubmitButton } from '~/components/ui/SubmitButton';
import { Toast, type ToastMessage } from '~/components/ui/Toast';
import { referencePrices } from '~/lib/admin/store-stats';
import { loadPricing } from '~/lib/pricing.server';
import { adminRpc } from '~/lib/presale/rpc.server';
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
  const now = new Date();
  try {
    const [admin, snapshot] = await Promise.all([loadPricingAdmin(), loadPricing({ strict: true, rpc: adminRpc, now })]);
    return { ...admin, references: referencePrices(snapshot, now), setupMissing: false, now: now.toISOString() };
  } catch (err) {
    console.error('[admin][precios] no se pudo leer', err);
    return { prices: [], promotions: [], scope: [], references: [], setupMissing: true, now: now.toISOString() };
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
    throw redirect('/admin/precios?eliminada=1');
  }
  return fail('invalid_fields');
}

function promotionState(p: PromotionRow, now: string): { label: string; tone: 'good' | 'warning' | 'neutral' | 'info'; detail: string } {
  const t = new Date(now).getTime();
  const starts = new Date(p.starts_at).getTime();
  const ends = new Date(p.ends_at).getTime();
  const inWindow = starts <= t && t < ends;
  if (!p.active) return { label: 'Pausada', tone: 'neutral', detail: inWindow ? 'en fechas, pero sin aplicar' : '' };
  if (ends <= t) return { label: 'Finalizada', tone: 'neutral', detail: `terminó hace ${shortSpan(p.ends_at, now)}` };
  if (starts > t) return { label: 'Programada', tone: 'info', detail: `empieza en ${shortSpan(now, p.starts_at)}` };
  return { label: 'Activa', tone: 'good', detail: `termina en ${shortSpan(now, p.ends_at)}` };
}

const toToast = (ad: ActionData | undefined): ToastMessage | null =>
  ad?.errors ? { ok: false, message: ad.errors.join(' ') } : ad?.ok ? { ok: true, message: ad.ok } : null;

type PriceRow = { productSlug: string; productName: string; width: number; storedCents: number | null; defaultCents: number; updatedAt: string | null };

/** Fila de precio con su propio envío: se guarda sin recargar la página. */
function PriceRowForm({ row, disabled }: { row: PriceRow; disabled: boolean }) {
  const fetcher = useFetcher<ActionData>();
  const saving = fetcher.state !== 'idle';
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const [shown, setShown] = useState<ActionData | undefined>(undefined);
  useEffect(() => {
    if (!result) return;
    setShown(result);
    if (!result.ok) return;
    const t = window.setTimeout(() => setShown(undefined), 4000);
    return () => window.clearTimeout(t);
  }, [result]);
  const size = formatSize(18, row.width);
  const errorId = `price-err-${row.productSlug}-${row.width}`;

  return (
    <tr>
      <td data-label="Modelo">{row.productName}</td>
      <td data-label="Medida" className="nowrap">{size}</td>
      <td data-label="Precio por llanta">
        <fetcher.Form method="post" className="price-edit" onChange={() => setShown(undefined)}>
          <input type="hidden" name="intent" value="set_price" />
          <input type="hidden" name="product_slug" value={row.productSlug} />
          <input type="hidden" name="width" value={row.width} />
          <label className="admin-field">
            <span className="sr-only">Precio {row.productName} {size} en euros</span>
            <span className="admin-input-affix">
              <input
                name="price"
                inputMode="decimal"
                required
                autoComplete="off"
                defaultValue={String((row.storedCents ?? row.defaultCents) / 100).replace('.', ',')}
                aria-invalid={shown?.errors ? true : undefined}
                aria-describedby={shown?.errors ? errorId : undefined}
              />
              <span aria-hidden="true">€</span>
            </span>
          </label>
          <button className="btn btn-outline btn-sm" disabled={disabled || saving} aria-busy={saving || undefined}>
            {saving && <Spinner size={14} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <span aria-live="polite">
            {shown?.ok && <span className="price-edit__state price-edit__state--ok">✓ Guardado</span>}
            {shown?.errors && <span id={errorId} className="price-edit__state price-edit__state--error">{shown.errors.join(' ')}</span>}
          </span>
        </fetcher.Form>
      </td>
      <td data-label="Última modificación" className="admin-muted">
        {row.updatedAt ? <LocalDateTime iso={row.updatedAt} compact /> : 'Precio inicial'}
      </td>
    </tr>
  );
}

/** Pausar / reanudar sin recargar; eliminar pide confirmación en la propia fila. */
function PromotionActions({ p, disabled, onResult }: { p: PromotionRow; disabled: boolean; onResult: (r: ToastMessage | null) => void }) {
  const toggle = useFetcher<ActionData>();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (toggle.state === 'idle' && toggle.data) onResult(toToast(toggle.data));
  }, [toggle.state, toggle.data, onResult]);
  const toggling = toggle.state !== 'idle';

  return (
    <div className="admin-actions">
      <Link className="btn btn-outline btn-sm" to={`/admin/precios?editar=${p.id}#promocion`}>Editar</Link>
      <toggle.Form method="post">
        <input type="hidden" name="intent" value="toggle_promotion" />
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="active" value={String(!p.active)} />
        <button className="btn btn-outline btn-sm" disabled={disabled || toggling} aria-busy={toggling || undefined}>
          {toggling && <Spinner size={14} />}
          {p.active ? 'Pausar' : 'Reanudar'}
        </button>
      </toggle.Form>
      {confirming ? (
        <Form method="post" className="inline-confirm">
          <input type="hidden" name="intent" value="delete_promotion" />
          <input type="hidden" name="id" value={p.id} />
          <span className="inline-confirm__q">¿Eliminarla?</span>
          <SubmitButton className="btn btn-danger btn-sm" match={{ intent: 'delete_promotion', id: p.id }} pendingText="Eliminando…">Sí, eliminar</SubmitButton>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>No</button>
        </Form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setConfirming(true)}>Eliminar</button>
      )}
    </div>
  );
}

type ScopeOption = { slug: string; name: string; finishes: { id: string; name: string }[] };

const WEEK_MIN = 7 * 24 * 60;

/**
 * Alta o edición de una promoción. Las fechas tienen atajos («Lunes 00:00»,
 * «3 semanas») y un resumen en palabras de cuándo empieza y acaba, para no
 * equivocarse con el día de fin (a las 00:00 ese día ya no tiene descuento).
 */
function PromotionForm({
  editing,
  prices,
  scope,
  promotions,
  errors,
  now,
  disabled,
}: {
  editing: PromotionRow | null;
  prices: PriceRow[];
  scope: ScopeOption[];
  promotions: PromotionRow[];
  errors?: string[];
  now: string;
  disabled: boolean;
}) {
  const [percent, setPercent] = useState<number>(editing?.percent_off ?? 20);
  const [start, setStart] = useState(() => utcIsoToMadridLocal(editing?.starts_at));
  const [end, setEnd] = useState(() => utcIsoToMadridLocal(editing?.ends_at));
  const validPercent = Number.isFinite(percent) && percent >= 1 && percent <= 90;
  const hasStart = isLocalDateTime(start);
  const span = hasStart && isLocalDateTime(end) ? minutesBetween(start, end) : null;
  const pickedWeeks = span != null && span > 0 && span % WEEK_MIN === 0 ? span / WEEK_MIN : null;
  const instant = (local: string) => new Date(madridLocalToUtcIso(local) ?? '').getTime();

  // Otras promociones activas que coinciden en fechas (se aplica la de mayor descuento).
  const overlaps = useMemo(() => {
    if (span == null || span <= 0) return [];
    const s = instant(start);
    const e = instant(end);
    return promotions.filter(
      (p) => p.id !== editing?.id && p.active && new Date(p.starts_at).getTime() < e && new Date(p.ends_at).getTime() > s
    );
  }, [span, start, end, promotions, editing?.id]);
  const nowMs = new Date(now).getTime();
  const startsInPast = span != null && span > 0 && instant(start) < nowMs;
  const endsInPast = span != null && span > 0 && instant(end) <= nowMs;
  const summaryTone = span == null ? '' : span <= 0 || endsInPast ? ' admin-notice--error' : ' admin-notice--ok';

  return (
    <section className="admin-section" id="promocion" style={{ scrollMarginTop: 80 }}>
      <h2>{editing ? `Editar «${editing.name}»` : 'Nueva promoción'}</h2>
      {errors && (
        <div className="admin-notice admin-notice--error" role="alert">
          <div>{errors.map((e) => <div key={e}>{e}</div>)}</div>
        </div>
      )}
      <Form method="post" className="admin-form">
        <input type="hidden" name="intent" value="save_promotion" />
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div className="admin-form-row">
          <label className="admin-field">
            Nombre interno
            <input name="name" required maxLength={80} defaultValue={editing?.name ?? ''} placeholder="Black Friday 2026" autoComplete="off" />
          </label>
          <label className="admin-field">
            Etiqueta en la web
            <input name="badge" maxLength={40} defaultValue={editing?.badge ?? ''} placeholder="Black Friday" autoComplete="off" />
            <small>Se ve junto al precio, p. ej. «Black Friday −20%».</small>
          </label>
          <label className="admin-field">
            Descuento
            <span className="admin-input-affix">
              <input
                name="percent_off"
                type="number"
                min={1}
                max={90}
                required
                value={Number.isFinite(percent) ? percent : ''}
                onChange={(e) => setPercent(e.currentTarget.valueAsNumber)}
              />
              <span aria-hidden="true">%</span>
            </span>
          </label>
        </div>

        <div className="admin-form-row">
          <div className="admin-field-group">
            <label className="admin-field">
              Empieza (hora de Madrid)
              <input name="starts_at" type="datetime-local" required value={start} onChange={(e) => setStart(e.currentTarget.value)} />
            </label>
            <div className="date-presets" role="group" aria-label="Atajos para el inicio">
              <button type="button" className="preset-chip" onClick={() => setStart(nowLocal(new Date()))}>Ahora</button>
              <button type="button" className="preset-chip" onClick={() => setStart(tomorrowMidnight(new Date()))}>Mañana 00:00</button>
              <button type="button" className="preset-chip" onClick={() => setStart(nextWeekdayMidnight(new Date(), 1))}>Lunes 00:00</button>
            </div>
          </div>
          <div className="admin-field-group">
            <label className="admin-field">
              Termina (hora de Madrid)
              <input name="ends_at" type="datetime-local" required value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
            </label>
            <div className="date-presets" role="group" aria-label="Duración contada desde el inicio">
              <span className="date-presets__label">Dura</span>
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  type="button"
                  className="preset-chip"
                  aria-pressed={pickedWeeks === w}
                  disabled={!hasStart}
                  title={hasStart ? undefined : 'Elige antes el inicio'}
                  onClick={() => setEnd(addDaysLocal(start, 7 * w) ?? end)}
                >
                  {w} {w === 1 ? 'semana' : 'semanas'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`admin-notice${summaryTone}`} aria-live="polite">
          {span == null ? (
            'Elige cuándo empieza y cuándo termina. Con «Lunes 00:00» y «3 semanas» queda una promoción de tres semanas desde el próximo lunes.'
          ) : span <= 0 ? (
            'La fecha de fin tiene que ser posterior a la de inicio.'
          ) : (
            <>
              Empieza el <strong>{longDateTime(start)}</strong>
              {startsInPast && ' (ya ha pasado: se aplica en cuanto la guardes)'} y termina el{' '}
              <strong>{longDateTime(end)}</strong>. Dura {describeDuration(span)}: el último día con descuento es el{' '}
              <strong>{lastDiscountDay(end)}</strong>.
              {endsInPast && ' Ojo: esa fecha de fin ya ha pasado, así que no se aplicaría.'}
            </>
          )}
        </div>
        {overlaps.length > 0 && (
          <div className="admin-notice admin-notice--warning">
            Coincide en fechas con {overlaps.map((p) => `«${p.name}» (−${p.percent_off} %)`).join(', ')}. Donde afecten a las mismas
            llantas se aplica la de mayor descuento; no se suman.
          </div>
        )}

        {scope.map((product) => (
          <fieldset key={product.slug}>
            <legend>Aplica a <span className="admin-muted" style={{ fontWeight: 400 }}>(sin marcar nada = toda la tienda)</span></legend>
            <div className="admin-checks">
              <label className="admin-check">
                <input
                  type="checkbox"
                  name="product_slugs"
                  value={product.slug}
                  defaultChecked={!editing || editing.product_slugs.length === 0 || editing.product_slugs.includes(product.slug)}
                />
                {product.name} (modelo completo)
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
            </div>
          </fieldset>
        ))}
        <label className="admin-check">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Activa (si la desmarcas, queda pausada aunque esté en fechas)
        </label>
        {prices.length > 0 && validPercent && (
          <div className="admin-notice" aria-live="polite">
            <div>
              <strong>Así quedará con −{percent} %:</strong>{' '}
              {prices
                .map((r) => {
                  const base = r.storedCents ?? r.defaultCents;
                  return `${formatSize(18, r.width)}: ${formatPrice(base)} → ${formatPrice(applyPercentOff(base, percent))}`;
                })
                .join(' · ')}
            </div>
          </div>
        )}
        <p className="admin-hint">
          El precio tachado de la web es el precio normal de cada medida. Por ley tiene que ser el más bajo de los últimos 30 días:
          no subas precios justo antes de una promoción.
        </p>
        <div className="admin-actions">
          <SubmitButton className="btn btn-primary" match={{ intent: 'save_promotion' }} pendingText="Guardando…" disabled={disabled}>
            {editing ? 'Guardar cambios' : 'Crear promoción'}
          </SubmitButton>
          {editing && <Link className="btn btn-ghost" to="/admin/precios">Cancelar</Link>}
        </div>
      </Form>
    </section>
  );
}

export default function AdminPrices({ loaderData, actionData }: Route.ComponentProps) {
  const { prices, promotions, scope, references, setupMissing, now } = loaderData;
  const [params] = useSearchParams();
  const editing = promotions.find((p) => p.id === params.get('editar')) ?? null;
  const ad = actionData as ActionData | undefined;
  const [fetcherToast, setFetcherToast] = useState<ToastMessage | null>(null);
  const flashKey = params.get('guardada') ? 'guardada' : params.get('eliminada') ? 'eliminada' : null;
  // Objeto estable: el aviso solo debe reaparecer cuando cambia el resultado.
  const toast = useMemo<ToastMessage | null>(
    () =>
      toToast(ad) ??
      fetcherToast ??
      (flashKey ? { ok: true, message: flashKey === 'guardada' ? 'Promoción guardada.' : 'Promoción eliminada.' } : null),
    [ad, fetcherToast, flashKey]
  );
  const scopeLabel = (p: PromotionRow) => {
    const models = p.product_slugs.length === 0 ? 'Todos los modelos' : p.product_slugs.map((s) => scope.find((x) => x.slug === s)?.name ?? s).join(', ');
    const allFinishes = scope.flatMap((x) => x.finishes);
    const finishes = p.finish_ids.length === 0 ? 'todos los acabados' : p.finish_ids.map((id) => allFinishes.find((f) => f.id === id)?.name ?? id).join(', ');
    return `${models} · ${finishes}`;
  };

  return (
    <>
      <Toast result={toast} />
      <div className="admin-pagehead">
        <div>
          <h1 className="admin-title">Precios y promociones</h1>
          <p className="admin-sub">
            Precios finales por llanta, IVA incluido. Las promociones se aplican solas entre su inicio y su fin (hora de Madrid).
            Si coinciden varias, se aplica la de mayor descuento (no se acumulan).
          </p>
        </div>
        <a href="#promocion" className="btn btn-primary btn-sm">Nueva promoción</a>
      </div>

      {setupMissing && (
        <div className="admin-notice admin-notice--error" role="alert">
          <div>No se pudo leer la configuración de precios. ¿Está aplicada la migración <code>20261106100000_pricing_promotions.sql</code> en Supabase?</div>
        </div>
      )}

      <section className="admin-section">
        <h2>Precios por medida</h2>
        <p className="admin-hint">Cambia el importe y pulsa Guardar en su fila. Se aplica al momento en la web y en el pago.</p>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr><th>Modelo</th><th>Medida</th><th>Precio por llanta</th><th>Última modificación</th></tr>
            </thead>
            <tbody>
              {prices.map((row) => (
                <PriceRowForm key={`${row.productSlug}-${row.width}`} row={row} disabled={setupMissing} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {references.length > 0 && (
        <section className="admin-section">
          <h2>Lo que paga ahora el cliente, por referencia</h2>
          <p className="admin-hint">Resultado de los precios de arriba y de la promoción activa en este momento. Es exactamente lo que cobra el pago.</p>
          <PriceTable prices={references} />
        </section>
      )}

      <section className="admin-section">
        <h2>Promociones</h2>
        {promotions.length === 0 ? (
          <p className="viz-empty">Todavía no hay promociones. <a href="#promocion">Crea la primera</a>.</p>
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
                      <td data-label="Promoción">
                        <span className="cell-strong">{p.name}</span>
                        <span className="cell-sub">Etiqueta en la web: «{p.badge} −{p.percent_off}%»</span>
                      </td>
                      <td data-label="Estado">
                        <StatusChip tone={state.tone} size="sm">{state.label}</StatusChip>
                        {state.detail && <span className="cell-sub">{state.detail}</span>}
                      </td>
                      <td data-label="Descuento" className="num cell-strong">−{p.percent_off} %</td>
                      <td data-label="Fechas" className="nowrap">
                        <LocalDateTime iso={p.starts_at} compact />
                        <span className="cell-sub">hasta <LocalDateTime iso={p.ends_at} compact /></span>
                      </td>
                      <td data-label="Aplica a">{scopeLabel(p)}</td>
                      <td data-label="Acciones">
                        <PromotionActions p={p} disabled={setupMissing} onResult={setFetcherToast} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PromotionForm
        key={editing?.id ?? 'new'}
        editing={editing}
        prices={prices}
        scope={scope}
        promotions={promotions}
        errors={ad?.errors}
        now={now}
        disabled={setupMissing}
      />
    </>
  );
}
