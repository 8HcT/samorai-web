import type { Locale } from './config';

/**
 * URLs por idioma (SEO): el castellano vive en la raíz (`/the-wheels`) y el
 * inglés bajo `/en` (`/en/the-wheels`). Solo las páginas públicas de marca
 * tienen versión por idioma; carrito, cuenta, reservas y admin siguen en una
 * única URL y toman el idioma de la cookie / del navegador.
 */
export const EN_PREFIX = '/en';

/** Páginas públicas con versión ES y EN (sin prefijo). */
const LOCALIZED_STATIC = new Set([
  '/',
  '/the-dynasty',
  '/the-wheels',
  '/the-dealers',
  '/contacto',
  '/legal',
  '/privacidad',
  '/cookies',
]);

/** Fichas de producto: `/the-wheels/<slug>`. */
const LOCALIZED_PATTERN = /^\/the-wheels\/[^/]+$/;

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** `true` si la ruta (sin prefijo de idioma) tiene versión ES y EN. */
export function isLocalizedPath(path: string): boolean {
  const p = normalize(path);
  return LOCALIZED_STATIC.has(p) || LOCALIZED_PATTERN.test(p);
}

/**
 * Separa el prefijo de idioma: `/en/the-wheels` → `{ prefixed: true,
 * path: '/the-wheels' }`; `/en` → `/`; `/the-wheels` → sin prefijo.
 */
export function splitLocalePath(pathname: string): { prefixed: boolean; path: string } {
  const p = normalize(pathname);
  if (p === EN_PREFIX) return { prefixed: true, path: '/' };
  if (p.startsWith(`${EN_PREFIX}/`)) return { prefixed: true, path: p.slice(EN_PREFIX.length) };
  return { prefixed: false, path: p };
}

/**
 * Ruta en el idioma indicado. Las rutas sin versión por idioma (carrito,
 * cuenta…) se devuelven tal cual. Conserva `?query` y `#hash`.
 */
export function localizePath(to: string, locale: Locale): string {
  const match = to.match(/^([^?#]*)(.*)$/);
  const rawPath = match?.[1] || '/';
  const rest = match?.[2] ?? '';
  const { path } = splitLocalePath(rawPath);
  if (!isLocalizedPath(path)) return to;
  if (locale === 'es') return `${path}${rest}`;
  return `${path === '/' ? EN_PREFIX : `${EN_PREFIX}${path}`}${rest}`;
}

/**
 * Idioma de último recurso cuando no hay datos del servidor (p. ej. una URL
 * que no existe: el 404 se pinta sin el loader raíz). Bajo `/en` → inglés;
 * en el resto, castellano, que es el idioma de la raíz del sitio.
 */
export function fallbackLocaleForPath(pathname: string): Locale {
  return splitLocalePath(pathname).prefixed ? 'en' : 'es';
}

/** Idioma que fija la propia URL, o `null` si la ruta no es localizada. */
export function localeFromPath(pathname: string): Locale | null {
  const { prefixed, path } = splitLocalePath(pathname);
  if (prefixed) return isLocalizedPath(path) ? 'en' : null;
  return isLocalizedPath(path) ? 'es' : null;
}
