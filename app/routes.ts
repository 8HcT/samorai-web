import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

/**
 * Páginas públicas con versión por idioma (SEO): castellano en la raíz e
 * inglés bajo `/en`. Mismo módulo, id distinto. La lista de rutas debe
 * coincidir con `app/i18n/paths.ts`.
 */
function localizedPages(prefix: '' | 'en') {
  const at = (path: string) => (prefix ? `${prefix}/${path}` : path);
  const id = (name: string) => (prefix ? { id: `${prefix}/${name}` } : {});
  return [
    prefix ? route(prefix, 'routes/home.tsx', id('home')) : index('routes/home.tsx'),

    /* — Brand IA (Sección 2 del Master Brief) — */
    route(at('the-dynasty'), 'routes/the-dynasty.tsx', id('the-dynasty')),
    route(at('the-wheels'), 'routes/wheels.tsx', id('wheels')),
    route(at('the-wheels/:slug'), 'routes/wheels.$slug.tsx', id('wheels.$slug')),
    route(at('the-dealers'), 'routes/dealers.tsx', id('dealers')),
    route(at('contacto'), 'routes/support.tsx', id('support')),

    /* — Legales (texto pendiente de redacción legal) — */
    route(at('legal'), 'routes/legal.tsx', id('legal')),
    route(at('privacidad'), 'routes/privacidad.tsx', id('privacidad')),
    route(at('cookies'), 'routes/cookies.tsx', id('cookies')),
  ];
}

export default [
  /* — SEO: generados en servidor (dominio y entorno de cada despliegue) — */
  route('robots.txt', 'routes/robots.txt.tsx'),
  route('sitemap.xml', 'routes/sitemap.xml.tsx'),

  layout('routes/_layout.tsx', [
    ...localizedPages(''),
    ...localizedPages('en'),

    /* — Commerce (carrito Stripe) — */
    route('cart', 'routes/cart.tsx'),
    route('success', 'routes/success.tsx'),
    route('cancel', 'routes/cancel.tsx'),

    /* — Preventa, compra directa y pedidos (enlaces seguros sin login) — */
    route('reserva/confirmada', 'routes/reserva.confirmada.tsx'),
    route('reserva/:id', 'routes/reserva.$id.tsx'),
    route('pedido/confirmado', 'routes/pedido.confirmado.tsx'),
    route('pedido/:id', 'routes/pedido.$id.tsx'),
    route('checkout/cancelado', 'routes/checkout.cancelado.tsx'),

    /* — Cuenta de cliente (opcional, Supabase Auth) — */
    route('cuenta', 'routes/cuenta.tsx'),
    route('cuenta/acceso', 'routes/cuenta.acceso.tsx'),
    route('cuenta/registro', 'routes/cuenta.registro.tsx'),
    route('cuenta/recuperar', 'routes/cuenta.recuperar.tsx'),
    route('cuenta/contrasena', 'routes/cuenta.contrasena.tsx'),
    route('cuenta/salir', 'routes/cuenta.salir.tsx'),
    route('auth/confirm', 'routes/auth.confirm.tsx'),

    /* — Redirects de URLs antiguas — */
    route('wheels', 'routes/shop.tsx'),              // → /the-wheels
    route('wheels/:slug', 'routes/product.$slug.tsx'), // → /the-wheels/:slug
    route('shop', 'routes/legacy.shop.tsx'),          // → /the-wheels
    route('product/:slug', 'routes/legacy.product.tsx'), // → /the-wheels/:slug
    route('dealers', 'routes/legacy.dealers.tsx'),    // → /the-dealers
    route('support', 'routes/legacy.support.tsx'),    // → /contacto
  ]),

  /* — Panel de administración (autorización en servidor en cada loader/action) — */
  route('admin', 'routes/admin/layout.tsx', [
    index('routes/admin/dashboard.tsx'),
    route('tiradas', 'routes/admin/batches.tsx'),
    route('tiradas/:id', 'routes/admin/batch.tsx'),
    route('reservas', 'routes/admin/reservations.tsx'),
    route('reservas.csv', 'routes/admin/reservations-csv.tsx'),
    route('reservas/:id', 'routes/admin/reservation.tsx'),
    route('precios', 'routes/admin/prices.tsx'),
    route('pedidos', 'routes/admin/orders.tsx'),
    route('pedidos/:id', 'routes/admin/order.tsx'),
    route('correos', 'routes/admin/emails.tsx'),
  ]),

  /* — Endpoints de API (resource routes, sin layout) — */
  route('api/checkout', 'routes/api.checkout.tsx'),
  route('api/stripe-webhook', 'routes/api.stripe-webhook.tsx'),
  // Tareas programadas de preventa (pg_cron de Supabase → Bearer CRON_SECRET).
  route('api/cron/presale', 'routes/api.cron.presale.tsx'),
  // Vista previa de los correos de compra (404 en producción).
  route('api/email-preview', 'routes/api.email-preview.tsx'),
] satisfies RouteConfig;
