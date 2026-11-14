import { products } from '~/data/products';

/**
 * Páginas indexables (sin prefijo de idioma). Cada una se publica en los dos
 * idiomas con sus alternativas hreflang. Las páginas con noindex (legales en
 * borrador, dealers, carrito, cuenta…) no se incluyen.
 */
const PAGES = ['/', '/the-dynasty', '/the-wheels', '/contacto'];

export function sitemapPaths(): string[] {
  return [...PAGES, ...products.filter((p) => p.status === 'active').map((p) => `/the-wheels/${p.slug}`)];
}
