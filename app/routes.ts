import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/_layout.tsx', [
    index('routes/home.tsx'),
    route('shop', 'routes/shop.tsx'),
    route('product/:slug', 'routes/product.$slug.tsx'),
    route('cart', 'routes/cart.tsx'),
    route('fitment', 'routes/fitment.tsx'),
    route('success', 'routes/success.tsx'),
    route('cancel', 'routes/cancel.tsx'),
  ]),
] satisfies RouteConfig;
