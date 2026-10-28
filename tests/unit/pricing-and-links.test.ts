import { describe, expect, it } from 'vitest';
import { directQuote, discountCents, formatPercentFromBps, presaleQuote } from '~/lib/presale/pricing';
import { accessToken, checkoutCancelLink, reservationLink, verifyAccessToken } from '~/lib/presale/access.server';
import { eurosToCents, madridLocalToUtcIso, percentToBps, utcIsoToMadridLocal } from '~/lib/presale/datetime';
import { buildReservationPayload, resolveConfiguration } from '~/lib/presale/catalog';
import { pickOffer } from '~/lib/presale/offers.server';
import { balanceSessionExpiry } from '~/lib/presale/checkout.server';
import type { PublicBatch } from '~/lib/presale/types';

describe('importes de preventa (orden de cálculo de la especificación)', () => {
  it('1.200 € − 5 % − 50 € = 1.090 € pendientes', () => {
    const q = presaleQuote({ unitPriceCents: 30000, unitsPerSet: 4, sets: 1, discountBps: 500, depositPerSetCents: 5000 });
    expect(q).toMatchObject({
      units: 4,
      subtotalCents: 120000,
      discountCents: 6000,
      totalCents: 114000,
      depositCents: 5000,
      balanceCents: 109000,
    });
  });

  it('varios juegos multiplican la señal y el descuento se aplica al total', () => {
    const q = presaleQuote({ unitPriceCents: 27500, unitsPerSet: 4, sets: 2, discountBps: 500, depositPerSetCents: 5000 });
    expect(q).toMatchObject({ subtotalCents: 220000, discountCents: 11000, totalCents: 209000, depositCents: 10000, balanceCents: 199000 });
  });

  it('descuento desactivado (0 %)', () => {
    const q = presaleQuote({ unitPriceCents: 27500, unitsPerSet: 4, sets: 1, discountBps: 0, depositPerSetCents: 5000 });
    expect(q).toMatchObject({ discountCents: 0, totalCents: 110000, balanceCents: 105000 });
  });

  it('redondeo al céntimo: mitad hacia arriba, sin errores de coma flotante', () => {
    expect(discountCents(12345, 500)).toBe(617); // 617,25 → 617
    expect(discountCents(12350, 500)).toBe(618); // 617,5 → 618
    expect(discountCents(99999, 333)).toBe(3330); // 3329,97 → 3330
  });

  it('rechaza entradas no válidas (nunca se confía en el navegador)', () => {
    expect(() => presaleQuote({ unitPriceCents: 30000, unitsPerSet: 4, sets: 0, discountBps: 500, depositPerSetCents: 5000 })).toThrow();
    expect(() => presaleQuote({ unitPriceCents: 30000, unitsPerSet: 4, sets: 1.5, discountBps: 500, depositPerSetCents: 5000 })).toThrow();
    expect(() => presaleQuote({ unitPriceCents: 30000, unitsPerSet: 4, sets: 1, discountBps: 9000, depositPerSetCents: 5000 })).toThrow();
    expect(() => presaleQuote({ unitPriceCents: 100, unitsPerSet: 4, sets: 1, discountBps: 0, depositPerSetCents: 5000 })).toThrow();
  });

  it('venta directa: precio completo del catálogo', () => {
    expect(directQuote({ unitPriceCents: 30000, unitsPerSet: 4, sets: 2 })).toMatchObject({ units: 8, totalCents: 240000 });
  });

  it('formato del porcentaje', () => {
    expect(formatPercentFromBps(500).replace(/\s/g, ' ')).toBe('5 %');
    expect(formatPercentFromBps(250).replace(/\s/g, ' ')).toBe('2,5 %');
  });
});

describe('catálogo → instantánea', () => {
  it('usa las referencias y precios reales del catálogo', () => {
    const cfg = resolveConfiguration('victoria-silver-metallic-18x8-5-et45');
    expect(cfg).toMatchObject({ unitPriceCents: 27500, finishName: 'Silver Metallic' });
    const { payload } = buildReservationPayload(cfg!, 1, { unitsPerSet: 4, discountBps: 500, depositPerSetCents: 5000 }, { email: 'a@b.es' });
    expect(payload).toMatchObject({ product_slug: 'victoria', width: 8.5, et: 45, unit_price_cents: 27500, total_cents: 104500 });
  });

  it('una referencia inexistente (p. ej. Silver 18x9,5) no se acepta', () => {
    expect(resolveConfiguration('victoria-silver-metallic-18x9-5-et45')).toBeNull();
    expect(resolveConfiguration('victoria-anthracite-grey-18x9-et35', 'otro-producto')).toBeNull();
  });
});

describe('enlaces seguros para invitados', () => {
  it('firma, verifica y rechaza manipulaciones', () => {
    const id = '7d8f2c3e-1111-4a5b-9c9d-123456789abc';
    const token = accessToken('reservation', id, 1);
    expect(verifyAccessToken('reservation', id, 1, token)).toBe(true);
    expect(verifyAccessToken('reservation', id, 2, token)).toBe(false); // enlace revocado
    expect(verifyAccessToken('order', id, 1, token)).toBe(false); // otro tipo
    expect(verifyAccessToken('reservation', id.replace('7d8f', '7d8e'), 1, token)).toBe(false);
    expect(verifyAccessToken('reservation', id, 1, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBe(false);
    expect(verifyAccessToken('reservation', id, 1, '')).toBe(false);
    expect(reservationLink(id, 1)).toBe(`https://shop.example.com/reserva/${id}?t=${token}`);
    expect(checkoutCancelLink('allocation', id)).toContain('/checkout/cancelado?k=allocation&id=');
  });
});

describe('fechas del panel (hora de Madrid ↔ UTC)', () => {
  it('invierno (UTC+1) y verano (UTC+2)', () => {
    expect(madridLocalToUtcIso('2026-12-15T10:00')).toBe('2026-12-15T09:00:00.000Z');
    expect(madridLocalToUtcIso('2026-07-15T10:00')).toBe('2026-07-15T08:00:00.000Z');
    expect(utcIsoToMadridLocal('2026-12-15T09:00:00.000Z')).toBe('2026-12-15T10:00');
    expect(utcIsoToMadridLocal('2026-07-15T08:00:00.000Z')).toBe('2026-07-15T10:00');
  });

  it('días de cambio de hora', () => {
    // 25 oct 2026: a las 03:00 (verano) vuelve a ser 02:00 (invierno).
    expect(madridLocalToUtcIso('2026-10-25T12:00')).toBe('2026-10-25T11:00:00.000Z');
    // 29 mar 2026: a las 02:00 se pasa a las 03:00.
    expect(madridLocalToUtcIso('2026-03-29T12:00')).toBe('2026-03-29T10:00:00.000Z');
  });

  it('euros y porcentajes del formulario', () => {
    expect(eurosToCents('50')).toBe(5000);
    expect(eurosToCents('50,5')).toBe(5050);
    expect(eurosToCents('1.200,00')).toBe(120000);
    expect(eurosToCents('abc')).toBeNull();
    expect(percentToBps('5')).toBe(500);
    expect(percentToBps('2,5')).toBe(250);
    expect(percentToBps('-1')).toBeNull();
  });
});

describe('caducidad de la sesión del pago restante', () => {
  const now = new Date('2026-12-01T10:00:20Z');
  it('lejos de la fecha límite: máximo 23 h', () => {
    const exp = balanceSessionExpiry(now, new Date('2026-12-20T10:00:00Z'));
    expect(exp.toISOString()).toBe('2026-12-02T09:00:00.000Z');
  });
  it('cerca del límite: termina en la fecha límite', () => {
    const exp = balanceSessionExpiry(now, new Date('2026-12-01T15:00:00Z'));
    expect(exp.toISOString()).toBe('2026-12-01T15:00:00.000Z');
  });
  it('a menos de 30 min del límite: el mínimo de Stripe (≥ 30 min)', () => {
    const exp = balanceSessionExpiry(now, new Date('2026-12-01T10:10:00Z'));
    expect(exp.getTime() - now.getTime()).toBeGreaterThanOrEqual(30 * 60_000);
    expect(exp.getTime() - now.getTime()).toBeLessThan(32 * 60_000);
  });
});

describe('elección de la oferta de la ficha', () => {
  const base: PublicBatch = {
    id: 'b', code: 'run-1', name: 'First Production Run', description: null, status: 'presale_open',
    capacitySets: 50, unitsPerSet: 4, maxSetsPerOrder: 2, heldSets: 0, reservedSets: 32, soldSets: 0, availableSets: 18,
    variantAvailable: {}, presaleWindowOpen: true, presaleOpensAt: null, presaleClosesAt: null, plannedLaunchAt: null,
    launchedAt: null, estimatedDeliveryOn: null, estimatedDeliveryNote: null, depositCents: 5000, discountBps: 500,
    balanceWindowDays: 30, terms: { reservation: 't', cancellation: 't', refund: 't', expiry: 't' },
  };
  it('sin tiradas → carrito de siempre', () => expect(pickOffer([]).mode).toBe('legacy'));
  it('preventa abierta con stock', () => expect(pickOffer([base]).mode).toBe('presale'));
  it('preventa completa', () => expect(pickOffer([{ ...base, availableSets: 0 }]).mode).toBe('sold_out'));
  it('preventa programada', () =>
    expect(pickOffer([{ ...base, presaleWindowOpen: false, presaleOpensAt: '2999-01-01T00:00:00Z' }]).mode).toBe('upcoming'));
  it('venta directa con stock tiene prioridad sobre una preventa nueva', () => {
    const direct = { ...base, id: 'd', status: 'launched' as const, availableSets: 3 };
    expect(pickOffer([base, direct])).toMatchObject({ mode: 'direct', batch: { id: 'd' } });
  });
  it('venta directa sin stock (solo queda stock reservado) → agotado', () => {
    expect(pickOffer([{ ...base, status: 'launched', availableSets: 0 }]).mode).toBe('sold_out');
  });
  it('tirada finalizada → no se vuelve al carrito ilimitado', () => {
    expect(pickOffer([{ ...base, status: 'completed' }]).mode).toBe('unavailable');
  });
});
