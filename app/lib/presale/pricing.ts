/**
 * Importes de preventa y de venta directa (céntimos de EUR, IVA incluido).
 *
 * Orden de cálculo de la preventa (especificación del cliente):
 *   1. Precio total de las llantas (precio unitario × llantas por juego × juegos).
 *   2. Se aplica el descuento de preventa.
 *   3. Se resta la señal ya abonada (50 € por juego).
 *   = Importe pendiente de pago.
 *
 * Es la MISMA función para el servidor (fuente de verdad) y para la ficha de
 * producto (solo muestra). La base de datos vuelve a comprobar la aritmética
 * completa (`reservations_pricing_chk`) y los valores que dependen de la
 * tirada (señal y descuento) antes de aceptar una reserva.
 */

export interface PresaleQuoteInput {
  /** Precio final por llanta (IVA incluido), del catálogo. */
  unitPriceCents: number;
  unitsPerSet: number;
  sets: number;
  /** Descuento de preventa en puntos básicos (500 = 5 %). 0 si está desactivado. */
  discountBps: number;
  /** Señal por juego (5000 = 50 €). */
  depositPerSetCents: number;
}

export interface PresaleQuote {
  unitPriceCents: number;
  unitsPerSet: number;
  sets: number;
  units: number;
  /** Precio original (sin descuento). */
  subtotalCents: number;
  discountBps: number;
  discountCents: number;
  /** Precio final comprometido. */
  totalCents: number;
  /** Importe de la reserva (señal). */
  depositCents: number;
  /** Importe pendiente tras la señal. */
  balanceCents: number;
}

export interface DirectQuote {
  unitPriceCents: number;
  unitsPerSet: number;
  sets: number;
  units: number;
  subtotalCents: number;
  totalCents: number;
}

function assertPositiveInt(name: string, value: number, min = 1): void {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`${name} debe ser un entero ≥ ${min} (recibido: ${value})`);
  }
}

/**
 * Descuento redondeado al céntimo, mitad hacia arriba, con aritmética entera
 * (idéntico a `round(numeric)` de PostgreSQL para importes positivos).
 */
export function discountCents(subtotalCents: number, discountBps: number): number {
  const scaled = subtotalCents * discountBps;
  const quotient = Math.floor(scaled / 10000);
  const remainder = scaled - quotient * 10000;
  return remainder * 2 >= 10000 ? quotient + 1 : quotient;
}

export function presaleQuote(input: PresaleQuoteInput): PresaleQuote {
  assertPositiveInt('unitPriceCents', input.unitPriceCents);
  assertPositiveInt('unitsPerSet', input.unitsPerSet);
  assertPositiveInt('sets', input.sets);
  assertPositiveInt('depositPerSetCents', input.depositPerSetCents);
  assertPositiveInt('discountBps', input.discountBps, 0);
  if (input.discountBps > 5000) throw new RangeError('discountBps no puede superar 5000 (50 %)');

  const units = input.unitsPerSet * input.sets;
  const subtotal = input.unitPriceCents * units;
  const discount = discountCents(subtotal, input.discountBps);
  const total = subtotal - discount;
  const deposit = input.depositPerSetCents * input.sets;
  const balance = total - deposit;
  if (balance <= 0) {
    throw new RangeError('La señal no puede igualar o superar el precio final');
  }

  return {
    unitPriceCents: input.unitPriceCents,
    unitsPerSet: input.unitsPerSet,
    sets: input.sets,
    units,
    subtotalCents: subtotal,
    discountBps: input.discountBps,
    discountCents: discount,
    totalCents: total,
    depositCents: deposit,
    balanceCents: balance,
  };
}

/** Venta directa: precio completo del catálogo, sin descuento de preventa. */
export function directQuote(input: { unitPriceCents: number; unitsPerSet: number; sets: number }): DirectQuote {
  assertPositiveInt('unitPriceCents', input.unitPriceCents);
  assertPositiveInt('unitsPerSet', input.unitsPerSet);
  assertPositiveInt('sets', input.sets);
  const units = input.unitsPerSet * input.sets;
  const subtotal = input.unitPriceCents * units;
  return {
    unitPriceCents: input.unitPriceCents,
    unitsPerSet: input.unitsPerSet,
    sets: input.sets,
    units,
    subtotalCents: subtotal,
    totalCents: subtotal,
  };
}

const percentFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 500 → "5 %" · 250 → "2,5 %". */
export function formatPercentFromBps(bps: number): string {
  return percentFormatter.format(bps / 10000);
}
