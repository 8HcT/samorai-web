import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/_layout.tsx', [
    index('routes/home.tsx'),

    /* — Brand IA (Sección 2 del Master Brief) — */
    route('the-dynasty', 'routes/the-dynasty.tsx'),
    route('the-wheels', 'routes/wheels.tsx'),
    route('the-wheels/:slug', 'routes/wheels.$slug.tsx'),
    route('the-dealers', 'routes/dealers.tsx'),
    route('contacto', 'routes/support.tsx'),

    /* — Commerce (carrito Stripe) — */
    route('cart', 'routes/cart.tsx'),
    route('success', 'routes/success.tsx'),
    route('cancel', 'routes/cancel.tsx'),

    /* — Legales (texto pendiente de redacción legal) — */
    route('legal', 'routes/legal.tsx'),
    route('privacidad', 'routes/privacidad.tsx'),
    route('cookies', 'routes/cookies.tsx'),

    /* — Redirects de URLs antiguas — */
    route('wheels', 'routes/shop.tsx'),              // → /the-wheels
    route('wheels/:slug', 'routes/product.$slug.tsx'), // → /the-wheels/:slug
    route('shop', 'routes/legacy.shop.tsx'),          // → /the-wheels
    route('product/:slug', 'routes/legacy.product.tsx'), // → /the-wheels/:slug
    route('dealers', 'routes/legacy.dealers.tsx'),    // → /the-dealers
    route('support', 'routes/legacy.support.tsx'),    // → /contacto
  ]),

  /* — Endpoints de API (resource routes, sin layout) — */
  route('api/checkout', 'routes/api.checkout.tsx'),
  route('api/stripe-webhook', 'routes/api.stripe-webhook.tsx'),
  // Vista previa de los correos de compra (404 en producción).
  route('api/email-preview', 'routes/api.email-preview.tsx'),
] satisfies RouteConfig;
