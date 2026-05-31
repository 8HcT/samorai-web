import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/_layout.tsx', [
    index('routes/home.tsx'),

    /* — Main routes — */
    route('wheels', 'routes/wheels.tsx'),
    route('wheels/:slug', 'routes/wheels.$slug.tsx'),
    route('gallery', 'routes/gallery.tsx'),
    route('technology', 'routes/technology.tsx'),
    route('fitment', 'routes/fitment.tsx'),
    route('dealers', 'routes/dealers.tsx'),
    route('support', 'routes/support.tsx'),
    route('cart', 'routes/cart.tsx'),
    route('success', 'routes/success.tsx'),
    route('cancel', 'routes/cancel.tsx'),

    /* — Legacy compatibility redirects — */
    route('shop', 'routes/shop.tsx'),
    route('product/:slug', 'routes/product.$slug.tsx'),
  ]),
] satisfies RouteConfig;
