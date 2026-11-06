import type { Route } from './+types/sitemap.xml';
import { products } from '~/data/products';
import { supportedLocales } from '~/i18n/config';
import { localizePath } from '~/i18n/paths';
import { canonicalOrigin } from '~/lib/env.server';

/**
 * sitemap.xml con las páginas indexables en los dos idiomas y sus
 * alternativas hreflang. Las páginas con noindex (legales en borrador,
 * dealers, carrito, cuenta…) no se incluyen.
 */
const PAGES = ['/', '/the-dynasty', '/the-wheels', '/contacto'];

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function loader({ request }: Route.LoaderArgs) {
  const origin = canonicalOrigin(request);
  const paths = [
    ...PAGES,
    ...products.filter((p) => p.status === 'active').map((p) => `/the-wheels/${p.slug}`),
  ];

  const urls = paths.flatMap((path) => {
    const alternates = [
      ...supportedLocales.map(
        (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${escapeXml(origin + localizePath(path, l))}"/>`
      ),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(origin + localizePath(path, 'es'))}"/>`,
    ].join('\n');
    return supportedLocales.map(
      (l) => `  <url>\n    <loc>${escapeXml(origin + localizePath(path, l))}</loc>\n${alternates}\n  </url>`
    );
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
