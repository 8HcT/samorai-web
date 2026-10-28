/**
 * Conversión entre la hora local de Madrid (lo que escribe el administrador
 * en un <input type="datetime-local">) y UTC (lo que se guarda). Tiene en
 * cuenta el cambio de horario de verano sin librerías externas.
 */
const TZ = 'Europe/Madrid';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function madridParts(date: Date) {
  const map: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  return map as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Desfase (ms) de Madrid respecto a UTC en un instante dado. */
function offsetMs(date: Date): number {
  const p = madridParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-11-20T10:00" (hora de Madrid) → ISO UTC. null si está vacío/no válido. */
export function madridLocalToUtcIso(local: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((local ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Dos pasadas para acertar también en los días de cambio de hora.
  let utc = naive - offsetMs(new Date(naive));
  utc = naive - offsetMs(new Date(utc));
  return new Date(utc).toISOString();
}

/** ISO UTC → "2026-11-20T10:00" en hora de Madrid (para rellenar el input). */
export function utcIsoToMadridLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const p = madridParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "50" · "50,5" · "1.200,00" → céntimos (entero) o null. */
export function eurosToCents(value: string | null | undefined): number | null {
  const raw = (value ?? '').trim().replace(/\s|€/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** "5" · "5,25" (%) → puntos básicos (525) o null. */
export function percentToBps(value: string | null | undefined): number | null {
  const raw = (value ?? '').trim().replace('%', '').replace(',', '.');
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}
