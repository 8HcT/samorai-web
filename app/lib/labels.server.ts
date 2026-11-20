/**
 * Etiquetas de producto (tabla `product_labels`, solo servidor).
 *
 * Si la tabla todavía no existe (migración 20261120100000 sin aplicar) o no
 * hay base de datos, la web funciona sin etiquetas y el panel lo avisa.
 * Caché corta por instancia, como los precios.
 */
import { products } from '~/data/products';
import { isSchemaMissingError } from '~/lib/presale/rpc.server';
import { getSupabaseAdmin, isSupabaseConfigured } from '~/lib/supabase/server';
import { labelKey, normalizeLabel, type ProductLabels } from './labels';

const CACHE_MS = 30_000;

export interface LabelsState {
  labels: ProductLabels;
  /** false = falta la tabla (o no hay base de datos): no se pueden editar. */
  available: boolean;
}

let cache: { at: number; state: LabelsState } | null = null;

export function invalidateLabelsCache(): void {
  cache = null;
}

export async function loadLabels(): Promise<LabelsState> {
  if (!isSupabaseConfigured()) return { labels: {}, available: false };
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.state;

  const { data, error } = await getSupabaseAdmin().from('product_labels').select('product_slug, finish_id, label');
  if (error) {
    if (isSchemaMissingError(error)) {
      const state = { labels: {}, available: false };
      cache = { at: now, state };
      return state;
    }
    // Un fallo puntual no debe tumbar el catálogo: sin etiquetas esta vez.
    console.error('[labels] no se pudieron leer', error);
    return { labels: {}, available: true };
  }
  const labels: ProductLabels = {};
  for (const row of (data ?? []) as { product_slug: string; finish_id: string; label: string }[]) {
    labels[labelKey(row.product_slug, row.finish_id)] = row.label;
  }
  const state = { labels, available: true };
  cache = { at: now, state };
  return state;
}

/** Guarda (o quita, si llega vacía) la etiqueta de un acabado. */
export async function setLabel(
  input: { productSlug: string; finishId: string; label: unknown },
  actor: string
): Promise<{ ok: true; label: string | null } | { ok: false; reason: string }> {
  const product = products.find((p) => p.slug === input.productSlug);
  if (!product || !product.finishes.some((f) => f.id === input.finishId)) {
    return { ok: false, reason: 'Acabado no válido.' };
  }
  const parsed = normalizeLabel(input.label);
  if (!parsed.ok) return parsed;

  const table = getSupabaseAdmin().from('product_labels');
  const { error } = parsed.label
    ? await table.upsert({
        product_slug: input.productSlug,
        finish_id: input.finishId,
        label: parsed.label,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      })
    : await table.delete().match({ product_slug: input.productSlug, finish_id: input.finishId });
  invalidateLabelsCache();
  if (error) {
    console.error('[labels] no se pudo guardar', error);
    return {
      ok: false,
      reason: isSchemaMissingError(error)
        ? 'Falta crear la tabla de etiquetas en Supabase (ver aviso de arriba).'
        : 'No se pudo guardar. Vuelve a intentarlo.',
    };
  }
  return { ok: true, label: parsed.label };
}
