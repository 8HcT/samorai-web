/**
 * Panel /admin/precios: precios por modelo y ancho + promociones.
 * Solo servidor; cada action comprueba antes `requireAdmin`.
 */
import { products } from '~/data/products';
import { adminRpc, type Rpc } from '~/lib/presale/rpc.server';
import { eurosToCents, madridLocalToUtcIso } from '~/lib/presale/datetime';
import { priceKey, unitPriceCentsForWidth } from './pricing';
import { invalidatePricingCache } from './pricing.server';

export interface PromotionRow {
  id: string;
  name: string;
  badge: string;
  percent_off: number;
  starts_at: string;
  ends_at: string;
  product_slugs: string[];
  finish_ids: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface OverviewRow {
  prices: { product_slug: string; width: number | string; unit_price_cents: number; updated_at: string }[];
  promotions: PromotionRow[];
}

export interface PriceRowView {
  productSlug: string;
  productName: string;
  width: number;
  /** Precio guardado en la base de datos; null = se usa el de por defecto. */
  storedCents: number | null;
  defaultCents: number;
  updatedAt: string | null;
}

/** Modelos y acabados que pueden elegirse en el alcance de una promoción. */
export function promotionScopeOptions() {
  return products
    .filter((p) => p.status === 'active')
    .map((p) => ({ slug: p.slug, name: p.name, finishes: p.finishes.map((f) => ({ id: f.id, name: f.name })) }));
}

export async function loadPricingAdmin(rpc: Rpc = adminRpc) {
  const row = await rpc<OverviewRow>('pricing_admin_overview');
  const stored = new Map((row?.prices ?? []).map((p) => [priceKey(p.product_slug, Number(p.width)), p]));

  const prices: PriceRowView[] = [];
  for (const product of products.filter((p) => p.status === 'active')) {
    const widths = Array.from(new Set(product.variants.map((v) => v.width))).sort((a, b) => a - b);
    for (const width of widths) {
      const s = stored.get(priceKey(product.slug, width));
      prices.push({
        productSlug: product.slug,
        productName: product.name,
        width,
        storedCents: s?.unit_price_cents ?? null,
        defaultCents:
          product.variants.find((v) => v.width === width)?.priceCents ?? unitPriceCentsForWidth(width),
        updatedAt: s?.updated_at ?? null,
      });
    }
  }
  return { prices, promotions: row?.promotions ?? [], scope: promotionScopeOptions() };
}

type Result = { ok: true; [k: string]: unknown } | { ok: false; reason: string };

export async function setPrice(
  input: { productSlug: string; width: number; euros: string },
  actor: string,
  rpc: Rpc = adminRpc
): Promise<Result> {
  const product = products.find((p) => p.slug === input.productSlug);
  if (!product || !product.variants.some((v) => v.width === input.width)) {
    return { ok: false, reason: 'invalid_fields' };
  }
  const cents = eurosToCents(input.euros);
  if (cents == null) return { ok: false, reason: 'invalid_price' };
  const res = await rpc<Result>('pricing_admin_set_price', {
    p_product_slug: input.productSlug,
    p_width: input.width,
    p_unit_price_cents: cents,
    p_actor: actor,
  });
  invalidatePricingCache();
  return res;
}

/** Lee el formulario de promoción. Las fechas son hora de Madrid. */
export function parsePromotionForm(form: FormData): { fields: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const name = String(form.get('name') ?? '').trim();
  const badge = String(form.get('badge') ?? '').trim() || name;
  const percent = Number.parseInt(String(form.get('percent_off') ?? ''), 10);
  const startsAt = madridLocalToUtcIso(String(form.get('starts_at') ?? ''));
  const endsAt = madridLocalToUtcIso(String(form.get('ends_at') ?? ''));

  const scope = promotionScopeOptions();
  const productSlugs = form.getAll('product_slugs').map(String).filter((s) => scope.some((p) => p.slug === s));
  const finishIds = form
    .getAll('finish_ids')
    .map(String)
    .filter((id) => scope.some((p) => p.finishes.some((f) => f.id === id)));

  if (!name || name.length > 80) errors.push('Pon un nombre (máx. 80 caracteres).');
  if (badge.length > 40) errors.push('La etiqueta admite como mucho 40 caracteres.');
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) errors.push('El descuento debe estar entre 1 y 90 %.');
  if (!startsAt || !endsAt) errors.push('Indica la fecha y hora de inicio y de fin.');
  else if (new Date(endsAt) <= new Date(startsAt)) errors.push('La fecha de fin debe ser posterior a la de inicio.');

  // Si se marcan todos, equivale a «todos» (también los que se añadan después).
  const allProducts = productSlugs.length === scope.length;
  const allFinishIds = scope.flatMap((p) => p.finishes.map((f) => f.id));
  const allFinishes = allFinishIds.every((id) => finishIds.includes(id));

  return {
    fields: {
      name,
      badge,
      percent_off: percent,
      starts_at: startsAt,
      ends_at: endsAt,
      product_slugs: allProducts ? [] : productSlugs,
      finish_ids: allFinishes ? [] : finishIds,
      active: form.get('active') != null,
    },
    errors,
  };
}

export async function savePromotion(id: string | null, fields: Record<string, unknown>, actor: string, rpc: Rpc = adminRpc) {
  const res = await rpc<Result>('pricing_admin_save_promotion', { p_id: id, p_fields: fields, p_actor: actor });
  invalidatePricingCache();
  return res;
}

export async function setPromotionActive(id: string, active: boolean, actor: string, rpc: Rpc = adminRpc) {
  const res = await rpc<Result>('pricing_admin_set_promotion_active', { p_id: id, p_active: active, p_actor: actor });
  invalidatePricingCache();
  return res;
}

export async function deletePromotion(id: string, actor: string, rpc: Rpc = adminRpc) {
  const res = await rpc<Result>('pricing_admin_delete_promotion', { p_id: id, p_actor: actor });
  invalidatePricingCache();
  return res;
}

export const PRICING_REASON: Record<string, string> = {
  invalid_fields: 'Datos no válidos.',
  invalid_price: 'Precio no válido (p. ej. 275 o 274,90).',
  invalid_name: 'Nombre o etiqueta no válidos.',
  invalid_percent: 'El descuento debe estar entre 1 y 90 %.',
  invalid_dates: 'Revisa las fechas: el fin debe ser posterior al inicio.',
  not_found: 'La promoción ya no existe.',
};
