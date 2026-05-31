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

export function t(locale: Locale = defaultLocale) {
  return locales[locale];
}

export const strings = en;
