/**
 * Utilidades de direcciones compartidas (correos, panel y webhook).
 * Sin dependencias de servidor.
 */

/**
 * Provincias de España. Stripe devuelve en `state` el código ISO 3166-2
 * («M», «B», «GC»…); en una etiqueta de envío se lee mejor el nombre.
 */
const ES_PROVINCES: Record<string, string> = {
  A: 'Alicante', AB: 'Albacete', AL: 'Almería', AV: 'Ávila', B: 'Barcelona', BA: 'Badajoz', BI: 'Bizkaia',
  BU: 'Burgos', C: 'A Coruña', CA: 'Cádiz', CC: 'Cáceres', CE: 'Ceuta', CO: 'Córdoba', CR: 'Ciudad Real',
  CS: 'Castellón', CU: 'Cuenca', GC: 'Las Palmas', GI: 'Girona', GR: 'Granada', GU: 'Guadalajara', H: 'Huelva',
  HU: 'Huesca', J: 'Jaén', L: 'Lleida', LE: 'León', LO: 'La Rioja', LU: 'Lugo', M: 'Madrid', MA: 'Málaga',
  ML: 'Melilla', MU: 'Murcia', NA: 'Navarra', O: 'Asturias', OR: 'Ourense', P: 'Palencia', PM: 'Illes Balears',
  PO: 'Pontevedra', S: 'Cantabria', SA: 'Salamanca', SE: 'Sevilla', SG: 'Segovia', SO: 'Soria', SS: 'Gipuzkoa',
  T: 'Tarragona', TE: 'Teruel', TF: 'Santa Cruz de Tenerife', TO: 'Toledo', V: 'Valencia', VA: 'Valladolid',
  VI: 'Álava', Z: 'Zaragoza', ZA: 'Zamora',
};

/** Provincia / región legible: «M» → «Madrid» (España); en otros países, tal cual. */
export function regionName(country: string | null | undefined, state: string | null | undefined): string | null {
  const s = (state ?? '').trim();
  if (!s) return null;
  if (country === 'ES') return ES_PROVINCES[s.toUpperCase()] ?? s;
  return s;
}

/** Provincia solo si aporta algo (no repite la ciudad: «Madrid, Madrid»). */
export function regionIfDistinct(
  country: string | null | undefined,
  state: string | null | undefined,
  city: string | null | undefined
): string | null {
  const name = regionName(country, state);
  if (!name) return null;
  return name.trim().toLowerCase() === (city ?? '').trim().toLowerCase() ? null : name;
}

/** «ES» → «España» (o en el idioma indicado). Si el navegador no lo sabe, el código. */
export function countryLabel(code: string | null | undefined, lang = 'es'): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
