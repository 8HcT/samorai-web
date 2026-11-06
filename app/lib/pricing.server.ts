/**
 * Carga de precios y promociones desde Supabase (solo servidor).
 *
 * Sin base de datos (desarrollo) o sin la migración de precios aplicada, la
 * web usa los precios por defecto de los datos de producto y ninguna
 * promoción. Se cachea unos segundos por instancia para no consultar la base
 * de datos en cada página; los cambios del admin se ven como mucho tras
 * `CACHE_MS` (en la instancia que hace el cambio, al momento).
 */
import { adminRpc, isPresaleDbConfigured, isSchemaMissingError, type Rpc } from '~/lib/presale/rpc.server';
import { EMPTY_PRICING, priceKey, type ActivePromotion, type PricingSnapshot } from './pricing';

const CACHE_MS = 30_000;

interface SnapshotRow {
  prices: { product_slug: string; width: number | string; unit_price_cents: number }[];
  promotions: {
    id: string;
    name: string;
    badge: string;
    percent_off: number;
    starts_at: string;
    ends_at: string;
    product_slugs: string[] | null;
    finish_ids: string[] | null;
  }[];
}

export function toPricingSnapshot(row: SnapshotRow | null | undefined): PricingSnapshot {
  if (!row) return EMPTY_PRICING;
  const prices: Record<string, number> = {};
  for (const p of row.prices ?? []) prices[priceKey(p.product_slug, Number(p.width))] = p.unit_price_cents;
  const promotions: ActivePromotion[] = (row.promotions ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    badge: p.badge,
    percentOff: p.percent_off,
    startsAt: p.starts_at,
    endsAt: p.ends_at,
    productSlugs: p.product_slugs ?? [],
    finishIds: p.finish_ids ?? [],
  }));
  return { prices, promotions };
}

let cache: { at: number; snapshot: PricingSnapshot } | null = null;

/** Invalida la caché (tras un cambio en /admin). */
export function invalidatePricingCache(): void {
  cache = null;
}

/**
 * Precios vigentes.
 *  · `strict: false` (páginas): ante un error de la base de datos se muestran
 *    los precios por defecto, para no tumbar la web.
 *  · `strict: true` (checkout): ante un error se lanza la excepción. Nunca se
 *    cobra con un precio que podría no ser el vigente.
 */
export async function loadPricing(
  opts: { strict?: boolean; rpc?: Rpc; now?: Date } = {}
): Promise<PricingSnapshot> {
  const rpc = opts.rpc ?? adminRpc;
  const injected = opts.rpc != null;
  if (!injected && !isPresaleDbConfigured()) return EMPTY_PRICING;

  const nowMs = (opts.now ?? new Date()).getTime();
  if (!injected && cache && nowMs - cache.at < CACHE_MS) return cache.snapshot;

  try {
    const row = await rpc<SnapshotRow>('pricing_public_snapshot', opts.now ? { p_now: opts.now } : {});
    const snapshot = toPricingSnapshot(row);
    if (!injected) cache = { at: nowMs, snapshot };
    return snapshot;
  } catch (err) {
    if (isSchemaMissingError(err)) return EMPTY_PRICING;
    console.error('[pricing] no se pudieron leer los precios', err);
    if (opts.strict) throw err;
    return EMPTY_PRICING;
  }
}
