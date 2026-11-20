import { describe, expect, it } from 'vitest';
import {
  addDaysLocal,
  describeDuration,
  lastDiscountDay,
  longDateTime,
  minutesBetween,
  nextWeekdayMidnight,
  shortSpan,
  tomorrowMidnight,
} from '~/lib/admin/promo-dates';
import { madridLocalToUtcIso } from '~/lib/presale/datetime';

describe('atajos de fechas de las promociones (hora de Madrid)', () => {
  // Viernes 20-11-2026, 13:05 en Madrid (12:05 UTC).
  const friday = new Date('2026-11-20T12:05:00Z');

  it('«lunes 00:00» desde un viernes es el lunes siguiente', () => {
    expect(nextWeekdayMidnight(friday, 1)).toBe('2026-11-23T00:00');
  });

  it('«lunes 00:00» un lunes por la mañana salta a la semana siguiente', () => {
    expect(nextWeekdayMidnight(new Date('2026-11-23T09:00:00Z'), 1)).toBe('2026-11-30T00:00');
  });

  it('usa el día de Madrid, no el de UTC (domingo 23:30 UTC ya es lunes en Madrid)', () => {
    expect(nextWeekdayMidnight(new Date('2026-11-22T23:30:00Z'), 1)).toBe('2026-11-30T00:00');
  });

  it('mañana 00:00', () => {
    expect(tomorrowMidnight(friday)).toBe('2026-11-21T00:00');
  });

  it('Black Friday de 3 semanas: del lunes 23-11 al lunes 14-12, ambos a las 00:00', () => {
    const start = nextWeekdayMidnight(friday, 1);
    const end = addDaysLocal(start, 21)!;
    expect(end).toBe('2026-12-14T00:00');
    expect(describeDuration(minutesBetween(start, end)!)).toBe('21 días (3 semanas)');
    expect(longDateTime(start)).toBe('lunes 23 de noviembre a las 00:00');
    expect(lastDiscountDay(end)).toBe('domingo 13 de diciembre');
    // Lo que se guarda: medianoche de Madrid (UTC+1 en invierno).
    expect(madridLocalToUtcIso(start)).toBe('2026-11-22T23:00:00.000Z');
  });

  it('sumar semanas mantiene la hora de reloj aunque cambie el horario', () => {
    expect(addDaysLocal('2027-03-22T00:00', 14)).toBe('2027-04-05T00:00');
  });

  it('si no termina a medianoche, el último día es el propio día de fin', () => {
    expect(lastDiscountDay('2026-11-30T23:59')).toBe('lunes 30 de noviembre');
  });

  it('describe duraciones cortas y con horas', () => {
    expect(describeDuration(45)).toBe('45 min');
    expect(describeDuration(6 * 60)).toBe('6 h');
    expect(describeDuration(4 * 1440 + 12 * 60)).toBe('4 días y 12 h');
    expect(describeDuration(7 * 1440)).toBe('7 días (1 semana)');
    expect(describeDuration(3 * 1440)).toBe('3 días');
  });

  it('tiempo relativo de la lista', () => {
    expect(shortSpan('2026-11-20T12:00:00Z', '2026-11-20T12:20:00Z')).toBe('20 min');
    expect(shortSpan('2026-11-20T12:00:00Z', '2026-11-21T05:00:00Z')).toBe('17 h');
    expect(shortSpan('2026-11-20T12:00:00Z', '2026-12-14T00:00:00Z')).toBe('24 días');
  });
});
