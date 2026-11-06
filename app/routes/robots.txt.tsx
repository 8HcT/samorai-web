import type { Route } from './+types/robots.txt';
import { allowIndexing, canonicalOrigin } from '~/lib/env.server';

/**
 * robots.txt generado: en producción permite rastrear la web pública y
 * apunta al sitemap; en los previews de Vercel lo bloquea todo.
 */
export function loader({ request }: Route.LoaderArgs) {
  const body = allowIndexing()
    ? [
        'User-agent: *',
        'Allow: /',
        // Flujos privados o sin valor de búsqueda (además llevan noindex).
        'Disallow: /admin',
        'Disallow: /api/',
        'Disallow: /cuenta',
        'Disallow: /auth/',
        'Disallow: /cart',
        'Disallow: /success',
        'Disallow: /cancel',
        'Disallow: /checkout/',
        'Disallow: /reserva/',
        'Disallow: /pedido/',
        '',
        `Sitemap: ${canonicalOrigin(request)}/sitemap.xml`,
        '',
      ]
    : ['User-agent: *', 'Disallow: /', ''];

  return new Response(body.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
