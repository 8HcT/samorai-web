import type { Route } from './+types/catalog';
import { useEffect, useState } from 'react';
import { data, Link, useFetcher } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';
import { t as translations } from '~/i18n/config';
import { MANUAL_LABEL_CODES, type LabelCode, type ManualLabelCode } from '~/lib/catalog';
import { catalogView, type CatalogFinishView, type CatalogVariantView, type VariantStatus } from '~/lib/admin/catalog-view';
import { loadCatalogAdmin, setFinish, setLowStockThreshold, setVariant, type CatalogAdminData } from '~/lib/catalog.server';
import { EMPTY_CATALOG } from '~/lib/catalog';
import { StatusChip } from '~/components/admin/AdminViz';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { FinishDot } from '~/components/FinishDot';
import { Spinner } from '~/components/ui/Spinner';
import { LABEL_CLASS } from '~/components/ProductCard';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  let admin: CatalogAdminData;
  let loadError = false;
  try {
    admin = await loadCatalogAdmin();
  } catch (err) {
    console.error('[admin][catalogo] no se pudo leer', err);
    admin = { enabled: false, snapshot: EMPTY_CATALOG, sold: {}, updated: {} };
    loadError = true;
  }
  const view = catalogView(admin);

  return { enabled: admin.enabled, loadError, threshold: admin.snapshot.lowStockThreshold, view };
}

type ActionData = { ok?: string; errors?: string[] };

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const done = (res: { ok: true } | { ok: false; reason: string }, message: string) =>
    res.ok ? data<ActionData>({ ok: message }) : data<ActionData>({ errors: [res.reason] }, { status: 400 });

  if (intent === 'set_variant') {
    const res = await setVariant(
      { variantId: String(form.get('variant_id') ?? ''), stock: form.get('stock'), active: form.get('active') != null },
      user.id
    );
    return done(res, 'Guardado.');
  }
  if (intent === 'set_finish') {
    const res = await setFinish(
      {
        productSlug: String(form.get('product_slug') ?? ''),
        finishId: String(form.get('finish_id') ?? ''),
        visible: form.get('visible') != null,
        hideWhenSoldOut: form.get('hide_when_sold_out') != null,
        labelCode: form.get('label_code'),
      },
      user.id
    );
    return done(res, 'Guardado.');
  }
  if (intent === 'set_threshold') {
    return done(await setLowStockThreshold(form.get('threshold'), user.id), 'Guardado.');
  }
  return data<ActionData>({ errors: ['Acción no válida.'] }, { status: 400 });
}

const ES = translations('es').labels;
const EN = translations('en').labels;

const STATUS: Record<VariantStatus, { label: string; tone: 'good' | 'warning' | 'critical' | 'neutral' | 'info' }> = {
  ok: { label: 'Disponible', tone: 'good' },
  low: { label: 'Últimas unidades', tone: 'warning' },
  sold_out: { label: 'Agotada', tone: 'critical' },
  inactive: { label: 'Desactivada', tone: 'neutral' },
  hidden: { label: 'Acabado oculto', tone: 'neutral' },
  untracked: { label: 'Sin control de stock', tone: 'info' },
};

/** Resultado de un guardado en línea: «✓ Guardado» unos segundos o el error. */
function useInlineResult(fetcher: { state: string; data?: ActionData }) {
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const [shown, setShown] = useState<ActionData | undefined>(undefined);
  useEffect(() => {
    if (!result) return;
    setShown(result);
    if (!result.ok) return;
    const t = window.setTimeout(() => setShown(undefined), 4000);
    return () => window.clearTimeout(t);
  }, [result]);
  return [shown, setShown] as const;
}

function SaveButton({ saving, disabled }: { saving: boolean; disabled: boolean }) {
  return (
    <button className="btn btn-outline btn-sm" disabled={disabled || saving} aria-busy={saving || undefined}>
      {saving && <Spinner size={14} />}
      {saving ? 'Guardando…' : 'Guardar'}
    </button>
  );
}

function InlineState({ shown, id }: { shown: ActionData | undefined; id: string }) {
  return (
    <span aria-live="polite">
      {shown?.ok && <span className="price-edit__state price-edit__state--ok">✓ {shown.ok}</span>}
      {shown?.errors && <span id={id} className="price-edit__state price-edit__state--error">{shown.errors.join(' ')}</span>}
    </span>
  );
}

function Badges({ codes }: { codes: LabelCode[] }) {
  if (codes.length === 0) return <span className="admin-muted">Sin etiquetas</span>;
  return (
    <span className="catalog-badges">
      {codes.map((c) => (
        <span key={c} className={`badge ${LABEL_CLASS[c]}`} title={`EN: ${EN[c]}`}>{ES[c]}</span>
      ))}
    </span>
  );
}

type FinishView = CatalogFinishView;
type VariantView = CatalogVariantView;

function ThresholdForm({ threshold, disabled }: { threshold: number; disabled: boolean }) {
  const fetcher = useFetcher<ActionData>();
  const [shown, setShown] = useInlineResult(fetcher);
  return (
    <fetcher.Form method="post" className="price-edit" onChange={() => setShown(undefined)}>
      <input type="hidden" name="intent" value="set_threshold" />
      <label className="admin-field">
        <span className="sr-only">Unidades para «Últimas unidades»</span>
        <span className="admin-input-affix">
          <input name="threshold" inputMode="numeric" defaultValue={threshold} disabled={disabled} autoComplete="off" />
          <span aria-hidden="true">llantas</span>
        </span>
      </label>
      <SaveButton saving={fetcher.state !== 'idle'} disabled={disabled} />
      <InlineState shown={shown} id="threshold-err" />
    </fetcher.Form>
  );
}

function FinishForm({ productSlug, finish, disabled }: { productSlug: string; finish: FinishView; disabled: boolean }) {
  const fetcher = useFetcher<ActionData>();
  const [shown, setShown] = useInlineResult(fetcher);
  const [label, setLabel] = useState<string>(finish.labelCode ?? '');
  return (
    <fetcher.Form method="post" className="catalog-finish-form" onChange={() => setShown(undefined)}>
      <input type="hidden" name="intent" value="set_finish" />
      <input type="hidden" name="product_slug" value={productSlug} />
      <input type="hidden" name="finish_id" value={finish.id} />
      <div className="admin-checks">
        <label className="admin-check">
          <input type="checkbox" name="visible" defaultChecked={finish.visible} disabled={disabled} />
          Visible en la web
        </label>
        <label className="admin-check">
          <input type="checkbox" name="hide_when_sold_out" defaultChecked={finish.hideWhenSoldOut} disabled={disabled} />
          Ocultarlo si se agota
        </label>
      </div>
      <label className="admin-field catalog-label-field">
        Etiqueta en la foto
        <select name="label_code" value={label} onChange={(e) => setLabel(e.currentTarget.value)} disabled={disabled}>
          <option value="">Sin etiqueta</option>
          {MANUAL_LABEL_CODES.map((code) => (
            <option key={code} value={code}>
              {ES[code]} · EN «{EN[code]}»
            </option>
          ))}
        </select>
      </label>
      <div className="admin-actions">
        <SaveButton saving={fetcher.state !== 'idle'} disabled={disabled} />
        <InlineState shown={shown} id={`finish-err-${finish.id}`} />
      </div>
      {label && (
        <p className="admin-hint" style={{ margin: 0 }}>
          Así se verá: <span className={`badge ${LABEL_CLASS[label as ManualLabelCode]}`}>{ES[label as ManualLabelCode]}</span>{' '}
          (en inglés, «{EN[label as ManualLabelCode]}»)
        </p>
      )}
    </fetcher.Form>
  );
}

function VariantRow({ variant, disabled }: { variant: VariantView; disabled: boolean }) {
  const fetcher = useFetcher<ActionData>();
  const [shown, setShown] = useInlineResult(fetcher);
  const status = STATUS[variant.status];
  const errorId = `variant-err-${variant.id}`;
  return (
    <tr>
      <td data-label="Referencia">
        <span className="cell-strong">{variant.size}</span>
        <span className="cell-sub" title={variant.id}>{variant.id}</span>
      </td>
      <td data-label="Stock y estado">
        <fetcher.Form method="post" className="price-edit" onChange={() => setShown(undefined)}>
          <input type="hidden" name="intent" value="set_variant" />
          <input type="hidden" name="variant_id" value={variant.id} />
          <label className="admin-field catalog-stock-field">
            <span className="sr-only">Stock de {variant.size}</span>
            <input
              name="stock"
              inputMode="numeric"
              defaultValue={variant.stock ?? ''}
              placeholder="Sin control"
              autoComplete="off"
              disabled={disabled}
              aria-invalid={shown?.errors ? true : undefined}
              aria-describedby={shown?.errors ? errorId : undefined}
            />
          </label>
          <label className="admin-check catalog-active">
            <input type="checkbox" name="active" defaultChecked={variant.active} disabled={disabled} />
            Activa
          </label>
          <SaveButton saving={fetcher.state !== 'idle'} disabled={disabled} />
          <InlineState shown={shown} id={errorId} />
        </fetcher.Form>
      </td>
      <td data-label="Apartado ahora" className="num">{variant.held > 0 ? variant.held : '—'}</td>
      <td data-label="Vendidas" className="num">{variant.sold}</td>
      <td data-label="Estado">
        <StatusChip tone={status.tone} size="sm">{status.label}</StatusChip>
        {variant.available != null && (variant.status === 'ok' || variant.status === 'low') && (
          <span className="cell-sub">Se pueden vender {variant.available}</span>
        )}
        {variant.updatedAt && (
          <span className="cell-sub">Cambio: <LocalDateTime iso={variant.updatedAt} compact /></span>
        )}
      </td>
    </tr>
  );
}

export default function AdminCatalog({ loaderData }: Route.ComponentProps) {
  const { enabled, loadError, threshold, view } = loaderData;
  const all = view.flatMap((p) => p.finishes.flatMap((f) => f.variants));
  const count = (s: VariantStatus) => all.filter((v) => v.status === s).length;

  return (
    <>
      <div className="admin-pagehead">
        <div>
          <h1 className="admin-title">Catálogo</h1>
          <p className="admin-sub">
            Qué se ve en la web, el stock de cada referencia y las etiquetas de las fotos. Las promociones (y su etiqueta con
            el descuento) están en <Link to="/admin/precios">Precios</Link>.
          </p>
        </div>
      </div>

      {!enabled && (
        <div className="admin-notice admin-notice--warning" role="alert">
          {loadError
            ? 'No se pudo leer el catálogo. Vuelve a intentarlo en unos segundos.'
            : <>Para usar el catálogo falta crear sus tablas en Supabase: pega en el SQL Editor el archivo <code>supabase/migrations/20261120100000_catalog_control.sql</code> y recarga esta página. Mientras tanto la web vende como hasta ahora: todo visible y sin límite de stock.</>}
        </div>
      )}

      {enabled && (
        <section className="admin-section">
          <div className="catalog-summary">
            <StatusChip tone="good">{count('ok')} disponibles</StatusChip>
            <StatusChip tone="warning">{count('low')} con pocas unidades</StatusChip>
            <StatusChip tone="critical">{count('sold_out')} agotadas</StatusChip>
            <StatusChip tone="info">{count('untracked')} sin control de stock</StatusChip>
            {count('inactive') + count('hidden') > 0 && <StatusChip tone="neutral">{count('inactive') + count('hidden')} ocultas o desactivadas</StatusChip>}
          </div>
          <ul className="admin-hint">
            <li><strong>Stock</strong>: llantas en almacén. Vacío = sin control (se vende sin límite, como hasta ahora). Con 0 sale «Agotado» y no se puede comprar.</li>
            <li>Cada venta lo descuenta sola. Si anulas un pedido o recibes material, súmalo aquí a mano.</li>
            <li><strong>Apartado</strong>: lo que tienen clientes que están pagando ahora; si no pagan, se libera solo en unos 45 minutos.</li>
          </ul>
        </section>
      )}

      <section className="admin-section">
        <div className="admin-section__head">
          <h2>Aviso de «Últimas unidades»</h2>
        </div>
        <p className="admin-hint">
          La etiqueta sale sola cuando a un acabado (o a una medida, en la ficha) le quedan estas llantas o menos. Con 0 no sale nunca.
        </p>
        <ThresholdForm threshold={threshold} disabled={!enabled} />
      </section>

      {view.map((product) =>
        product.finishes.map((finish) => (
          <section key={finish.id} className="admin-section admin-section--flush">
            <div className="catalog-finish">
              <div className="catalog-finish__head">
                <h2>
                  <FinishDot color={finish.color} /> {product.name} · {finish.name}
                </h2>
                <div className="catalog-finish__state">
                  {finish.shown ? <StatusChip tone="good" size="sm">Se ve en la web</StatusChip> : <StatusChip tone="neutral" size="sm">Oculto en la web</StatusChip>}
                  <Badges codes={finish.labels} />
                </div>
              </div>
              <FinishForm productSlug={product.slug} finish={finish} disabled={!enabled} />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--stack">
                <thead>
                  <tr><th>Referencia</th><th>Stock y estado</th><th className="num">Apartado ahora</th><th className="num">Vendidas</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {finish.variants.map((v) => (
                    <VariantRow key={v.id} variant={v} disabled={!enabled} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  );
}
