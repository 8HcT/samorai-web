/**
 * Catálogo (stock, visibilidad y etiquetas) en Supabase. Solo servidor.
 *
 * Sin base de datos o sin la migración 20261120100000_catalog_control
 * aplicada, la web funciona como antes (todo visible, sin límite) y el panel
 * lo avisa. La lectura pública se cachea unos segundos por instancia; la
 * compra siempre comprueba el stock en la base de datos (catalog_reserve).
 */
import { randomUUID } from 'node:crypto';
import { products } from '~/data/products';
import { adminRpc, isPresaleDbConfigured, isSchemaMissingError, type Rpc } from '~/lib/presale/rpc.server';
import {
  EMPTY_CATALOG,
  finishKey,
  isManualLabel,
  type CatalogSnapshot,
  type ManualLabelCode,
  type UnavailableReason,
} from './catalog';

const CACHE_MS = 15_000;

interface SnapshotRow {
  low_stock_threshold: number | string | null;
  finishes: { product_slug: string; finish_id: string; visible: boolean; hide_when_sold_out: boolean; label_code: string | null }[];
  variants: { variant_id: string; stock: number | null; active: boolean; held: number | string }[];
}

export function toCatalogSnapshot(row: SnapshotRow | null | undefined): CatalogSnapshot {
  if (!row) return EMPTY_CATALOG;
  const threshold = Number(row.low_stock_threshold);
  const snapshot: CatalogSnapshot = {
    enabled: true,
    lowStockThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : EMPTY_CATALOG.lowStockThreshold,
    finishes: {},
    variants: {},
  };
  for (const f of row.finishes ?? []) {
    snapshot.finishes[finishKey(f.product_slug, f.finish_id)] = {
      visible: f.visible !== false,
      hideWhenSoldOut: Boolean(f.hide_when_sold_out),
      labelCode: isManualLabel(f.label_code) ? f.label_code : null,
    };
  }
  for (const v of row.variants ?? []) {
    snapshot.variants[v.variant_id] = { stock: v.stock ?? null, active: v.active !== false, held: Number(v.held) || 0 };
  }
  return snapshot;
}

let cache: { at: number; snapshot: CatalogSnapshot } | null = null;

export function invalidateCatalogCache(): void {
  cache = null;
}

/** Estado del catálogo para pintar la web. Un error nunca tumba la página. */
export async function loadCatalog(opts: { rpc?: Rpc; fresh?: boolean } = {}): Promise<CatalogSnapshot> {
  const injected = opts.rpc != null;
  const rpc = opts.rpc ?? adminRpc;
  if (!injected && !isPresaleDbConfigured()) return EMPTY_CATALOG;
  const now = Date.now();
  if (!injected && !opts.fresh && cache && now - cache.at < CACHE_MS) return cache.snapshot;
  try {
    const snapshot = toCatalogSnapshot(await rpc<SnapshotRow>('catalog_public_snapshot'));
    if (!injected) cache = { at: now, snapshot };
    return snapshot;
  } catch (err) {
    if (isSchemaMissingError(err)) {
      if (!injected) cache = { at: now, snapshot: EMPTY_CATALOG };
      return EMPTY_CATALOG;
    }
    console.error('[catalog] no se pudo leer', err);
    return EMPTY_CATALOG;
  }
}

// ------------------------------------------------------------------
// Compra: apartar, vender, alargar y liberar stock
// ------------------------------------------------------------------

export interface StockItem {
  variantId: string;
  quantity: number;
}

export type ReserveResult =
  | { ok: true; key: string; held: number }
  | { ok: false; key: string; short: { variantId: string; available: number; reason: UnavailableReason | 'stock' }[] };

/** Clave de la reserva: viaja en los metadatos de la sesión de Stripe. */
export const newStockKey = () => randomUUID();

/** RPC a usar: la inyectada (tests) o la del servidor si hay base de datos. */
const rpcOrNull = (rpc?: Rpc): Rpc | null => rpc ?? (isPresaleDbConfigured() ? adminRpc : null);

/**
 * Aparta el stock de un carrito (todo o nada). Sin la migración aplicada no
 * hay nada que apartar: se deja comprar como antes. Un fallo de la base de
 * datos se propaga: mejor no cobrar que vender algo que no hay.
 */
export async function reserveStock(key: string, items: StockItem[], expiresAt: Date, rpcIn?: Rpc): Promise<ReserveResult> {
  const rpc = rpcOrNull(rpcIn);
  if (!rpc) return { ok: true, key, held: 0 };
  const payload = items.map((i) => {
    const found = products.find((p) => p.variants.some((v) => v.id === i.variantId));
    const variant = found?.variants.find((v) => v.id === i.variantId);
    return { variant_id: i.variantId, quantity: i.quantity, product_slug: found?.slug ?? null, finish_id: variant?.finishId ?? null };
  });
  try {
    const res = await rpc<{ ok: boolean; held?: number; reason?: string; short?: { variant_id: string; available: number; reason: string }[] }>(
      'catalog_reserve',
      { p_hold_key: key, p_items: payload, p_expires_at: expiresAt.toISOString() }
    );
    if (res?.ok) return { ok: true, key, held: Number(res.held) || 0 };
    if (res?.reason === 'invalid_fields') throw new Error('catalog_reserve: datos no válidos');
    return {
      ok: false,
      key,
      short: (res?.short ?? []).map((s) => ({ variantId: s.variant_id, available: Number(s.available) || 0, reason: s.reason as UnavailableReason | 'stock' })),
    };
  } catch (err) {
    if (isSchemaMissingError(err)) return { ok: true, key, held: 0 };
    throw err;
  }
}

/** Venta cobrada: descuenta el stock una sola vez por clave y referencia. */
export async function commitStock(key: string, items: StockItem[], rpcIn?: Rpc): Promise<{ oversold: { variantId: string; missing: number }[] }> {
  const rpc = rpcOrNull(rpcIn);
  if (!rpc || items.length === 0) return { oversold: [] };
  try {
    const res = await rpc<{ ok: boolean; oversold?: { variant_id: string; missing: number }[] }>('catalog_commit', {
      p_hold_key: key,
      p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    });
    invalidateCatalogCache();
    return { oversold: (res?.oversold ?? []).map((o) => ({ variantId: o.variant_id, missing: Number(o.missing) || 0 })) };
  } catch (err) {
    if (isSchemaMissingError(err)) return { oversold: [] };
    throw err;
  }
}

export async function extendStock(key: string, until: Date, rpcIn?: Rpc): Promise<void> {
  const rpc = rpcOrNull(rpcIn);
  if (!rpc) return;
  try {
    await rpc('catalog_extend', { p_hold_key: key, p_expires_at: until.toISOString() });
  } catch (err) {
    if (!isSchemaMissingError(err)) throw err;
  }
}

export async function releaseStock(key: string, rpcIn?: Rpc): Promise<number> {
  const rpc = rpcOrNull(rpcIn);
  if (!rpc) return 0;
  try {
    const res = await rpc<{ released?: number }>('catalog_release', { p_hold_key: key });
    invalidateCatalogCache();
    return Number(res?.released) || 0;
  } catch (err) {
    if (isSchemaMissingError(err)) return 0;
    throw err;
  }
}

// ------------------------------------------------------------------
// Panel
// ------------------------------------------------------------------

export interface CatalogAdminData {
  enabled: boolean;
  snapshot: CatalogSnapshot;
  /** Unidades vendidas por referencia (pedidos cobrados y no anulados). */
  sold: Record<string, number>;
  /** Última modificación de cada referencia configurada. */
  updated: Record<string, string>;
}

export async function loadCatalogAdmin(rpc: Rpc = adminRpc): Promise<CatalogAdminData> {
  try {
    const row = await rpc<SnapshotRow & { sold: Record<string, number>; updated: Record<string, string> }>('catalog_admin_overview');
    return { enabled: true, snapshot: toCatalogSnapshot(row), sold: row?.sold ?? {}, updated: row?.updated ?? {} };
  } catch (err) {
    if (isSchemaMissingError(err)) return { enabled: false, snapshot: EMPTY_CATALOG, sold: {}, updated: {} };
    throw err;
  }
}

type AdminResult = { ok: true } | { ok: false; reason: string };

export const CATALOG_REASON: Record<string, string> = {
  invalid_fields: 'Datos no válidos.',
  invalid_stock: 'El stock debe ser un número entero entre 0 y 100.000 (o vacío para no controlarlo).',
  invalid_threshold: 'El aviso debe ser un número entre 0 y 1.000.',
  missing: 'Falta crear las tablas del catálogo en Supabase (ver aviso de arriba).',
};

async function adminCall(fn: string, params: Record<string, unknown>, rpc: Rpc): Promise<AdminResult> {
  try {
    const res = await rpc<{ ok: boolean; reason?: string }>(fn, params);
    invalidateCatalogCache();
    return res?.ok ? { ok: true } : { ok: false, reason: CATALOG_REASON[res?.reason ?? ''] ?? 'No se pudo guardar.' };
  } catch (err) {
    if (isSchemaMissingError(err)) return { ok: false, reason: CATALOG_REASON.missing };
    console.error(`[catalog] ${fn}`, err);
    return { ok: false, reason: 'No se pudo guardar. Vuelve a intentarlo.' };
  }
}

/** «12» → 12 · «» → null (sin control) · otra cosa → undefined (no válido). */
export function parseStockInput(raw: unknown): number | null | undefined {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  if (!/^\d{1,6}$/.test(text)) return undefined;
  const n = Number(text);
  return n <= 100000 ? n : undefined;
}

export async function setVariant(
  input: { variantId: string; stock: unknown; active: boolean },
  actor: string,
  rpc: Rpc = adminRpc
): Promise<AdminResult> {
  if (!products.some((p) => p.variants.some((v) => v.id === input.variantId))) return { ok: false, reason: CATALOG_REASON.invalid_fields };
  const stock = parseStockInput(input.stock);
  if (stock === undefined) return { ok: false, reason: CATALOG_REASON.invalid_stock };
  return adminCall('catalog_admin_set_variant', { p_variant_id: input.variantId, p_stock: stock, p_active: input.active, p_actor: actor }, rpc);
}

export async function setFinish(
  input: { productSlug: string; finishId: string; visible: boolean; hideWhenSoldOut: boolean; labelCode: unknown },
  actor: string,
  rpc: Rpc = adminRpc
): Promise<AdminResult> {
  const product = products.find((p) => p.slug === input.productSlug);
  if (!product?.finishes.some((f) => f.id === input.finishId)) return { ok: false, reason: CATALOG_REASON.invalid_fields };
  const raw = String(input.labelCode ?? '').trim();
  if (raw && !isManualLabel(raw)) return { ok: false, reason: CATALOG_REASON.invalid_fields };
  const label: ManualLabelCode | null = raw ? (raw as ManualLabelCode) : null;
  return adminCall(
    'catalog_admin_set_finish',
    {
      p_product_slug: input.productSlug,
      p_finish_id: input.finishId,
      p_visible: input.visible,
      p_hide_when_sold_out: input.hideWhenSoldOut,
      p_label_code: label,
      p_actor: actor,
    },
    rpc
  );
}

export async function setLowStockThreshold(raw: unknown, actor: string, rpc: Rpc = adminRpc): Promise<AdminResult> {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,4}$/.test(text) || Number(text) > 1000) return { ok: false, reason: CATALOG_REASON.invalid_threshold };
  return adminCall('catalog_admin_set_threshold', { p_value: Number(text), p_actor: actor }, rpc);
}
