import { en } from './locales/en';
import { es } from './locales/es';

export const locales = { en, es } as const;

export type Locale = keyof typeof locales;

export const defaultLocale: Locale = 'en';

export const supportedLocales: Locale[] = ['en', 'es'];

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

/** Nombre de la cookie donde se persiste el idioma elegido. */
export const LOCALE_COOKIE = 'samorai_lang';

/** Idiomas cuyo hablante debe ver la web en castellano (España). */
const SPANISH_FAMILY = new Set(['es', 'ca', 'eu', 'gl']);

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'es';
}

/** Devuelve las cadenas del idioma indicado. */
export function t(locale: Locale = defaultLocale) {
  return locales[locale];
}

/**
 * Detecta el idioma a partir de la cabecera Accept-Language del navegador
 * (o de navigator.language en cliente). Regla: si el idioma de sistema es
 * español, catalán, euskera o gallego → castellano; en cualquier otro
 * caso → inglés.
 */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  // Primer tag (mayor prioridad): "ca-ES,ca;q=0.9,es;q=0.8" → "ca-ES".
  const primary = acceptLanguage.split(',')[0]?.trim().split(';')[0]?.trim() ?? '';
  const base = primary.toLowerCase().split('-')[0];
  return SPANISH_FAMILY.has(base) ? 'es' : 'en';
}

/** Lee el idioma persistido en la cookie (si es válido). */
export function getLocaleFromCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return isLocale(value) ? value : null;
}

/** Resuelve el idioma efectivo: cookie explícita > detección por sistema. */
export function resolveLocale(
  cookieHeader: string | null | undefined,
  acceptLanguage: string | null | undefined
): Locale {
  return getLocaleFromCookie(cookieHeader) ?? detectLocale(acceptLanguage);
}

export const strings = en;
