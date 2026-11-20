/**
 * Fechas del formulario de promociones (panel). Trabajan con la hora de
 * Madrid «de reloj» tal como la escribe el administrador en un
 * <input type="datetime-local"> ("2026-11-23T00:00"). Sumar semanas mantiene
 * la misma hora de reloj aunque haya cambio de horario entre medias.
 * Sin dependencias de servidor: se usan en el navegador.
 */
import { utcIsoToMadridLocal } from '~/lib/presale/datetime';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-23T00:00" → milisegundos de ese reloj tratado como UTC (solo para aritmética). */
function wallMs(local: string): number | null {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  return Date.UTC(y, mo - 1, d, h, mi);
}

function fromWallMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const isLocalDateTime = (local: string) => wallMs(local) != null;

/** Hora actual de Madrid, en minutos. */
export function nowLocal(now: Date): string {
  return utcIsoToMadridLocal(now.toISOString());
}

/** Suma días de calendario (misma hora de reloj). */
export function addDaysLocal(local: string, days: number): string | null {
  const ms = wallMs(local);
  return ms == null ? null : fromWallMs(ms + days * 86_400_000);
}

/** Medianoche (00:00 de Madrid) del siguiente día de la semana pedido (1 = lunes … 7 = domingo). Hoy no cuenta. */
export function nextWeekdayMidnight(now: Date, isoWeekday: number): string {
  const today = nowLocal(now).slice(0, 10) + 'T00:00';
  const ms = wallMs(today)!;
  const current = ((new Date(ms).getUTCDay() + 6) % 7) + 1; // 1 = lunes
  const ahead = ((isoWeekday - current + 7) % 7) || 7;
  return fromWallMs(ms + ahead * 86_400_000);
}

/** 00:00 de mañana (Madrid). */
export function tomorrowMidnight(now: Date): string {
  return addDaysLocal(nowLocal(now).slice(0, 10) + 'T00:00', 1)!;
}

/** Minutos de reloj entre dos fechas locales (negativo si `end` es anterior). */
export function minutesBetween(start: string, end: string): number | null {
  const a = wallMs(start);
  const b = wallMs(end);
  return a == null || b == null ? null : Math.round((b - a) / 60_000);
}

/** «21 días (3 semanas)», «4 días y 12 h», «6 h», «45 min». */
export function describeDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days === 0) return `${hours} h`;
  const d = `${days} ${days === 1 ? 'día' : 'días'}`;
  if (hours > 0) return `${d} y ${hours} h`;
  if (days % 7 === 0) return `${d} (${days / 7} ${days === 7 ? 'semana' : 'semanas'})`;
  return d;
}

const longFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «lunes 23 de noviembre» (de una fecha local). */
export function longDay(local: string): string {
  const ms = wallMs(local);
  return ms == null ? '' : longFmt.format(new Date(ms)).replace(',', '');
}

/** «lunes 23 de noviembre a las 00:00». */
export function longDateTime(local: string): string {
  return `${longDay(local)} a las ${local.slice(11, 16)}`;
}

/**
 * Último día con descuento. Si termina a las 00:00, ese día ya no tiene
 * descuento: el último es el anterior.
 */
export function lastDiscountDay(end: string): string {
  const day = end.endsWith('T00:00') ? addDaysLocal(end, -1)! : end;
  return longDay(day);
}

/** Tiempo relativo corto para la lista: «3 días», «5 h», «20 min». */
export function shortSpan(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  const days = Math.round(minutes / 1440);
  return `${days} días`;
}
