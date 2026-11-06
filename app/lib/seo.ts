import type { MetaDescriptor } from 'react-router';
import { defaultLocale, supportedLocales, t, type Locale } from '~/i18n/config';
import { isLocalizedPath, localeFromPath, localizePath, splitLocalePath } from '~/i18n/paths';

/**
 * SEO centralizado: título, descripción, canonical, hreflang, Open Graph,
 * Twitter cards y datos estructurados (JSON-LD). Cada ruta llama a
 * `seoMeta(args, {...})` desde su `meta`; el idioma y el origen canónico
 * llegan del loader raíz.
 */

export const SITE_NAME = 'SAMORAI';
/** 1200×630, generada con `npm run images` a partir del hero de la home. */
export const DEFAULT_OG_IMAGE = '/images/og/samorai-og.jpg';
export const LOGO_PNG = '/images/og/samorai-logo.png';

export interface RootSeoData {
  locale: Locale;
  /** Origen canónico, p. ej. `https://www.samoraiwheels.com` (sin barra final). */
  origin: string;
}

interface MetaContext {
  location: { pathname: string };
  matches: ReadonlyArray<{ id: string; data?: unknown } | undefined>;
}

export function rootSeoData(args: MetaContext): RootSeoData {
  const data = args.matches.find((m) => m?.id === 'root')?.data as Partial<RootSeoData> | undefined;
  return {
    locale: localeFromPath(args.location.pathname) ?? data?.locale ?? defaultLocale,
    origin: data?.origin ?? '',
  };
}

/** Cadenas SEO del idioma activo (para usar dentro de `meta`). */
export function seoStrings(args: MetaContext) {
  return t(rootSeoData(args).locale).seo;
}

export function absoluteUrl(origin: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Sustituye `{clave}` en plantillas de texto. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

type JsonLd = Record<string, unknown>;

interface SeoOptions {
  title: string;
  description?: string;
  /** Ruta o URL de la imagen para compartir (por defecto, la genérica de marca). */
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'product';
  /** Páginas que no deben indexarse (flujos de compra, cuenta, legales en borrador). */
  noindex?: boolean;
  jsonLd?: JsonLd | JsonLd[];
}

export function seoMeta(args: MetaContext, opts: SeoOptions): MetaDescriptor[] {
  const { locale, origin } = rootSeoData(args);
  const tags: MetaDescriptor[] = [{ title: opts.title }];
  if (opts.description) tags.push({ name: 'description', content: opts.description });

  if (opts.noindex) {
    tags.push({ name: 'robots', content: 'noindex, follow' });
    return tags;
  }

  const { path } = splitLocalePath(args.location.pathname);
  const url = absoluteUrl(origin, localizePath(path, locale));
  tags.push({ tagName: 'link', rel: 'canonical', href: url });

  if (isLocalizedPath(path)) {
    for (const l of supportedLocales) {
      tags.push({ tagName: 'link', rel: 'alternate', hrefLang: l, href: absoluteUrl(origin, localizePath(path, l)) });
    }
    tags.push({ tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: absoluteUrl(origin, localizePath(path, 'es')) });
  }

  const s = t(locale).seo;
  const image = absoluteUrl(origin, opts.image ?? DEFAULT_OG_IMAGE);
  tags.push(
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:type', content: opts.type === 'product' ? 'product' : 'website' },
    { property: 'og:url', content: url },
    { property: 'og:title', content: opts.title },
    { property: 'og:locale', content: s.ogLocale },
    ...supportedLocales
      .filter((l) => l !== locale)
      .map((l) => ({ property: 'og:locale:alternate', content: t(l).seo.ogLocale })),
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: opts.title },
    { name: 'twitter:image', content: image }
  );
  if (!opts.image) {
    tags.push({ property: 'og:image:width', content: '1200' }, { property: 'og:image:height', content: '630' });
  }
  if (opts.imageAlt) tags.push({ property: 'og:image:alt', content: opts.imageAlt });
  if (opts.description) {
    tags.push(
      { property: 'og:description', content: opts.description },
      { name: 'twitter:description', content: opts.description }
    );
  }

  const jsonLd = Array.isArray(opts.jsonLd) ? opts.jsonLd : opts.jsonLd ? [opts.jsonLd] : [];
  for (const block of jsonLd) tags.push({ 'script:ld+json': block });

  return tags;
}

/* ─────────────── Datos estructurados (schema.org) ─────────────── */

export function organizationJsonLd(origin: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: SITE_NAME,
    url: `${origin}/`,
    logo: absoluteUrl(origin, LOGO_PNG),
  };
}

export function websiteJsonLd(origin: string, locale: Locale): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: SITE_NAME,
    url: absoluteUrl(origin, localizePath('/', locale)),
    inLanguage: locale,
    publisher: { '@id': `${origin}/#organization` },
  };
}

export function breadcrumbJsonLd(origin: string, items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(origin, item.path),
    })),
  };
}
