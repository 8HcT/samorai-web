/**
 * Tipos compartidos de la preventa (seguros para el navegador: sin secretos).
 */

export type BatchStatus =
  | 'draft'
  | 'presale_open'
  | 'presale_closed'
  | 'launched'
  | 'in_production'
  | 'available'
  | 'completed'
  | 'cancelled';

export type ReservationStatus =
  | 'pending_deposit'
  | 'deposit_processing'
  | 'confirmed'
  | 'balance_due'
  | 'balance_processing'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'abandoned'
  | 'needs_review';

export type DepositStatus = 'unpaid' | 'paid' | 'applied' | 'refund_pending' | 'refunded' | 'retained';

export type OrderStatus =
  | 'paid'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

/** Tirada tal como la ve el público en la ficha de producto. */
export interface PublicBatch {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: BatchStatus;
  capacitySets: number;
  unitsPerSet: number;
  maxSetsPerOrder: number;
  heldSets: number;
  reservedSets: number;
  soldSets: number;
  /** Juegos realmente disponibles ahora (capacidad − retenciones − reservas − vendidos). */
  availableSets: number;
  /** Disponibilidad por referencia (incluye cupos por acabado/referencia). */
  variantAvailable: Record<string, number>;
  presaleWindowOpen: boolean;
  presaleOpensAt: string | null;
  presaleClosesAt: string | null;
  plannedLaunchAt: string | null;
  launchedAt: string | null;
  estimatedDeliveryOn: string | null;
  estimatedDeliveryNote: string | null;
  depositCents: number;
  /** Descuento efectivo (0 si está desactivado). */
  discountBps: number;
  balanceWindowDays: number;
  terms: {
    reservation: string | null;
    cancellation: string | null;
    refund: string | null;
    expiry: string | null;
  };
}

/**
 * Qué ofrece la ficha de un producto:
 *   · legacy      → sin tiradas: carrito como hasta ahora.
 *   · presale     → preventa abierta: «Reservar mi juego».
 *   · direct      → venta oficial con stock: «Comprar ahora».
 *   · upcoming    → preventa anunciada pero aún no abierta.
 *   · closed      → preventa cerrada, pendiente del lanzamiento.
 *   · sold_out    → tirada completa (no quedan juegos).
 *   · unavailable → no se puede comprar ahora (tirada cerrada o error temporal).
 */
export type ProductOffer =
  | { mode: 'legacy' }
  | { mode: 'unavailable'; reason: 'error' | 'finished'; batch?: PublicBatch }
  | { mode: 'presale' | 'direct' | 'upcoming' | 'closed' | 'sold_out'; batch: PublicBatch };
