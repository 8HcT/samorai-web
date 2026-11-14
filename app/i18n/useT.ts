import { useCallback } from 'react';
import { useLocation, useRouteLoaderData } from 'react-router';
import { locales, type Locale } from './config';
import { fallbackLocaleForPath, localeFromPath, localizePath } from './paths';

/**
 * Idioma activo: el de la URL en páginas públicas (`/en/…` = inglés) y, en
 * el resto, el resuelto en el loader raíz (cookie / navegador). Leerlo de la
 * URL lo mantiene correcto en navegaciones de cliente, donde el loader raíz
 * no se vuelve a ejecutar.
 */
export function useLocale(): Locale {
  const { pathname } = useLocation();
  const data = useRouteLoaderData('root') as { locale?: Locale } | undefined;
  return localeFromPath(pathname) ?? data?.locale ?? fallbackLocaleForPath(pathname);
}

/** Cadenas de traducción del idioma activo. Uso: `const t = useT(); t.nav.home`. */
export function useT() {
  return locales[useLocale()];
}

/** Enlaces internos en el idioma activo: `lp('/the-wheels')` → `/en/the-wheels` en inglés. */
export function useLocalePath() {
  const locale = useLocale();
  return useCallback((to: string) => localizePath(to, locale), [locale]);
}
