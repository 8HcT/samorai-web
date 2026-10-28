/**
 * Puente entre el catálogo (app/data/products.ts) y la preventa.
 *
 * El navegador solo envía `variantId` y el número de juegos. Todo lo demás
 * (modelo, acabado, medidas, ET, precio) se resuelve AQUÍ desde el catálogo
 * real y se congela como instantánea en la reserva o en la retención de
 * compra directa. Así ni el precio ni la configuración pueden manipularse
 * desde el frontend, y los cambios posteriores del catálogo no alteran lo
 * que el cliente ya aceptó.
 */
import { getFinish, getVariantById } from '~/data/products';
import { unitPriceCentsForWidth } from '~/lib/pricing';
import type { Product, ProductFinish, WheelVariant } from '~/types/product';
import { directQuote, presaleQuote, type DirectQuote, type PresaleQuote } from './pricing';

export interface ResolvedConfiguration {
  product: Product;
  variant: WheelVariant;
  finish: ProductFinish | undefined;
  finishName: string;
  unitPriceCents: number;
}

/**
 * Referencia exacta del catálogo, o null si no existe, no se vende o su
 * precio no cuadra con la regla de precio por ancho.
 */
export function resolveConfiguration(variantId: string, productSlug?: string): ResolvedConfiguration | null {
  const found = getVariantById(variantId);
  if (!found) return null;
  const { product, variant } = found;
  if (productSlug && product.slug !== productSlug) return null;
  if (product.status !== 'active' || variant.stockStatus === 'out_of_stock') return null;

  const expected = unitPriceCentsForWidth(variant.width);
  if (variant.priceCents != null && variant.priceCents !== expected) return null;

  const finish = getFinish(product, variant.finishId);
  return {
    product,
    variant,
    finish,
    finishName: finish?.name ?? variant.color,
    unitPriceCents: expected,
  };
}

/** Copia completa de la referencia tal como estaba al reservar/comprar. */
export function configSnapshot(cfg: ResolvedConfiguration): Record<string, unknown> {
  const { product, variant } = cfg;
  return {
    product_id: product.id,
    product_slug: product.slug,
    product_name: product.name,
    model: product.model,
    variant_id: variant.id,
    finish_id: variant.finishId,
    finish_name: cfg.finishName,
    color: variant.color,
    diameter: variant.diameter,
    width: variant.width,
    et: variant.et,
    pcd: variant.pcd,
    center_bore: variant.cb,
    technical_value: variant.technicalValue,
    max_load: variant.maxLoad,
    cap_logo: variant.capLogo,
    material: product.specs.material,
    process: product.specs.process,
    finish_process: product.specs.finish,
    unit_price_cents: cfg.unitPriceCents,
    tax_included: true,
  };
}

export interface ReservationContact {
  email: string;
  customerName?: string | null;
  phone?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  locale?: 'es' | 'en';
}

export interface BatchPricingTerms {
  unitsPerSet: number;
  discountBps: number;
  depositPerSetCents: number;
}

/** Cuerpo de `presale_reserve_hold(p_reservation)` (claves = columnas SQL). */
export function buildReservationPayload(
  cfg: ResolvedConfiguration,
  sets: number,
  terms: BatchPricingTerms,
  contact: ReservationContact
): { payload: Record<string, unknown>; quote: PresaleQuote } {
  const quote = presaleQuote({
    unitPriceCents: cfg.unitPriceCents,
    unitsPerSet: terms.unitsPerSet,
    sets,
    discountBps: terms.discountBps,
    depositPerSetCents: terms.depositPerSetCents,
  });
  const { product, variant } = cfg;
  return {
    quote,
    payload: {
      product_slug: product.slug,
      product_name: product.name,
      variant_id: variant.id,
      finish_id: variant.finishId,
      finish_name: cfg.finishName,
      diameter: variant.diameter,
      width: variant.width,
      et: variant.et,
      pcd: variant.pcd,
      center_bore: variant.cb,
      config_snapshot: configSnapshot(cfg),
      quantity_sets: sets,
      units_per_set: quote.unitsPerSet,
      unit_price_cents: quote.unitPriceCents,
      subtotal_cents: quote.subtotalCents,
      discount_bps: quote.discountBps,
      discount_cents: quote.discountCents,
      total_cents: quote.totalCents,
      deposit_cents: quote.depositCents,
      balance_cents: quote.balanceCents,
      email: contact.email,
      customer_name: contact.customerName ?? null,
      phone: contact.phone ?? null,
      vehicle_make: contact.vehicleMake ?? null,
      vehicle_model: contact.vehicleModel ?? null,
      vehicle_year: contact.vehicleYear ?? null,
      locale: contact.locale ?? 'es',
    },
  };
}

/** Cuerpo de `presale_direct_hold(p_line)`: configuración + precio completo. */
export function buildDirectLine(
  cfg: ResolvedConfiguration,
  sets: number,
  unitsPerSet: number
): { line: Record<string, unknown>; quote: DirectQuote } {
  const quote = directQuote({ unitPriceCents: cfg.unitPriceCents, unitsPerSet, sets });
  const { product, variant } = cfg;
  return {
    quote,
    line: {
      product_slug: product.slug,
      product_name: product.name,
      variant_id: variant.id,
      finish_id: variant.finishId,
      finish_name: cfg.finishName,
      diameter: variant.diameter,
      width: variant.width,
      et: variant.et,
      pcd: variant.pcd,
      center_bore: variant.cb,
      quantity_sets: sets,
      units_per_set: unitsPerSet,
      unit_price_cents: quote.unitPriceCents,
      subtotal_cents: quote.subtotalCents,
      total_cents: quote.totalCents,
      config_snapshot: configSnapshot(cfg),
    },
  };
}
