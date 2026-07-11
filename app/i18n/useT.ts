import { useRouteLoaderData } from 'react-router';
import { locales, defaultLocale, type Locale } from './config';

/** Idioma activo (resuelto en el loader raíz). */
export function useLocale(): Locale {
  const data = useRouteLoaderData('root') as { locale?: Locale } | undefined;
  return data?.locale ?? defaultLocale;
}

/** Cadenas de traducción del idioma activo. Uso: `const t = useT(); t.nav.home`. */
export function useT() {
  return locales[useLocale()];
}
