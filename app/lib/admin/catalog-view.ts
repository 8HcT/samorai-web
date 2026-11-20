/**
 * Vista del catálogo para /admin/catalogo (pura: sirve al loader y a las
 * pruebas). Estado de cada acabado y referencia a partir de lo guardado.
 */
import { products } from '~/data/products';
import { formatSize, formatEt } from '~/lib/format';
import { finishKey, finishSummary, variantAvailability } from '~/lib/catalog';
import type { CatalogAdminData } from '~/lib/catalog.server';

export type VariantStatus = 'ok' | 'low' | 'sold_out' | 'inactive' | 'hidden' | 'untracked';

export function catalogView(admin: CatalogAdminData) {
  const cat = admin.snapshot;
  return products
    .filter((p) => p.status === 'active')
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      finishes: p.finishes.map((f) => {
        const config = cat.finishes[finishKey(p.slug, f.id)];
        const summary = finishSummary(cat, p, f.id);
        const variants = p.variants
          .filter((v) => v.finishId === f.id)
          .sort((a, b) => a.width - b.width || a.et - b.et)
          .map((v) => {
            const state = cat.variants[v.id];
            const avail = variantAvailability(cat, p.slug, v);
            const status: VariantStatus =
              avail.reason === 'hidden'
                ? 'hidden'
                : avail.reason === 'inactive'
                  ? 'inactive'
                  : avail.reason === 'sold_out'
                    ? 'sold_out'
                    : avail.available == null
                      ? 'untracked'
                      : avail.low
                        ? 'low'
                        : 'ok';
            return {
              id: v.id,
              size: `${formatSize(v.diameter, v.width)} · ${formatEt(v.et)}`,
              stock: state?.stock ?? null,
              active: state?.active ?? true,
              held: state?.held ?? 0,
              available: avail.available,
              sold: admin.sold[v.id] ?? 0,
              updatedAt: admin.updated[v.id] ?? null,
              status,
            };
          });
        return {
          id: f.id,
          name: f.name,
          color: f.color,
          visible: config?.visible ?? true,
          hideWhenSoldOut: config?.hideWhenSoldOut ?? false,
          labelCode: config?.labelCode ?? null,
          shown: summary.visible,
          soldOut: summary.soldOut,
          low: summary.low,
          labels: summary.labels,
          variants,
        };
      }),
    }));
}

export type CatalogProductView = ReturnType<typeof catalogView>[number];
export type CatalogFinishView = CatalogProductView['finishes'][number];
export type CatalogVariantView = CatalogFinishView['variants'][number];
