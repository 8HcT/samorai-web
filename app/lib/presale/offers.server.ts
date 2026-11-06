/**
 * Oferta pública de un producto: si pertenece a una tirada, con su stock real
 * (calculado en PostgreSQL en cada petición, nunca en el navegador).
 */
import type { Product } from '~/types/product';
import { adminRpc, isPresaleDbConfigured, isSchemaMissingError, type Rpc } from './rpc.server';
import type { BatchStatus, ProductOffer, PublicBatch } from './types';
import { presaleEnabled } from './config.server';

interface OfferRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: BatchStatus;
  capacity_sets: number;
  units_per_set: number;
  max_sets_per_order: number;
  held_sets: number;
  reserved_sets: number;
  sold_sets: number;
  available_sets: number;
  variant_available: Record<string, number>;
  presale_window_open: boolean;
  presale_opens_at: string | null;
  presale_closes_at: string | null;
  planned_launch_at: string | null;
  launched_at: string | null;
  estimated_delivery_on: string | null;
  estimated_delivery_note: string | null;
  deposit_cents: number;
  discount_bps: number;
  balance_window_days: number;
  reservation_terms: string | null;
  cancellation_policy: string | null;
  refund_policy: string | null;
  expiry_policy: string | null;
}

function toPublicBatch(row: OfferRow): PublicBatch {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    capacitySets: row.capacity_sets,
    unitsPerSet: row.units_per_set,
    maxSetsPerOrder: row.max_sets_per_order,
    heldSets: row.held_sets,
    reservedSets: row.reserved_sets,
    soldSets: row.sold_sets,
    availableSets: row.available_sets,
    variantAvailable: row.variant_available ?? {},
    presaleWindowOpen: row.presale_window_open,
    presaleOpensAt: row.presale_opens_at,
    presaleClosesAt: row.presale_closes_at,
    plannedLaunchAt: row.planned_launch_at,
    launchedAt: row.launched_at,
    estimatedDeliveryOn: row.estimated_delivery_on,
    estimatedDeliveryNote: row.estimated_delivery_note,
    depositCents: row.deposit_cents,
    discountBps: row.discount_bps,
    balanceWindowDays: row.balance_window_days,
    terms: {
      reservation: row.reservation_terms,
      cancellation: row.cancellation_policy,
      refund: row.refund_policy,
      expiry: row.expiry_policy,
    },
  };
}

const DIRECT_STATUSES: BatchStatus[] = ['launched', 'in_production', 'available'];

/**
 * Elige qué mostrar cuando hay varias tiradas (p. ej. una en venta y la
 * siguiente en preventa): prioridad a lo que se puede comprar ya.
 */
export function pickOffer(batches: PublicBatch[], now = new Date()): ProductOffer {
  if (batches.length === 0) return { mode: 'legacy' };

  const direct = batches.filter((b) => DIRECT_STATUSES.includes(b.status));
  const directWithStock = direct.find((b) => b.availableSets > 0);
  if (directWithStock) return { mode: 'direct', batch: directWithStock };

  const presale = batches.find((b) => b.status === 'presale_open');
  if (presale) {
    if (!presale.presaleWindowOpen) {
      const notYet = presale.presaleOpensAt && new Date(presale.presaleOpensAt) > now;
      return { mode: notYet ? 'upcoming' : 'closed', batch: presale };
    }
    return { mode: presale.availableSets > 0 ? 'presale' : 'sold_out', batch: presale };
  }

  if (direct.length > 0) return { mode: 'sold_out', batch: direct[0] };

  const closed = batches.find((b) => b.status === 'presale_closed');
  if (closed) return { mode: 'closed', batch: closed };

  // Solo tiradas finalizadas o canceladas: el producto ya no se vende por el
  // carrito ilimitado (antes estaba gestionado por tiradas).
  return { mode: 'unavailable', reason: 'finished', batch: batches[batches.length - 1] };
}

export async function getProductOffer(product: Product, rpc: Rpc = adminRpc): Promise<ProductOffer> {
  // Preventa apagada o sin base de datos: la ficha funciona con el carrito.
  if (rpc === adminRpc && (!presaleEnabled() || !isPresaleDbConfigured())) return { mode: 'legacy' };
  try {
    const rows = await rpc<OfferRow[]>('presale_public_offers', {
      p_product_slug: product.slug,
      p_variants: product.variants.map((v) => ({ variant_id: v.id, finish_id: v.finishId })),
    });
    return pickOffer((rows ?? []).map(toPublicBatch));
  } catch (err) {
    if (isSchemaMissingError(err)) {
      // Migraciones de preventa aún no aplicadas: la tienda sigue como antes.
      return { mode: 'legacy' };
    }
    console.error('[presale][offers] no se pudo leer el stock', err);
    // Ante un error NO se cae al carrito ilimitado: sería vender sin stock.
    return { mode: 'unavailable', reason: 'error' };
  }
}

/** Para el carrito antiguo: ¿este producto se vende ya por tiradas? */
export async function isManagedByBatches(product: Product, rpc: Rpc = adminRpc): Promise<boolean> {
  const offer = await getProductOffer(product, rpc);
  return offer.mode !== 'legacy';
}
