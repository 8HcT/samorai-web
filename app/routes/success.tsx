import type { Route } from './+types/success';

import { useEffect } from 'react';
import { Button } from '~/components/Button';
import { useCart } from '~/lib/cart/CartContext';
import { formatPrice } from '~/lib/money';
import { getStripe, isStripeConfigured } from '~/lib/stripe/stripe.server';
import { cartOrderRef } from '~/lib/orders/test-purchase';
import { t as translations } from '~/i18n/config';
import { useT } from '~/i18n/useT';
import { rootSeoData } from '~/lib/seo';

export function meta(args: Route.MetaArgs) {
  return [{ title: translations(rootSeoData(args).locale).checkout.metaSuccess }, { name: 'robots', content: 'noindex, nofollow' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !isStripeConfigured()) {
    return { email: null as string | null, amountCents: null as number | null, ref: null as string | null };
  }
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return {
      email: session.customer_details?.email ?? null,
      amountCents: session.amount_total ?? null,
      // La misma referencia que el correo de confirmación (#XXXXXXXX).
      ref: cartOrderRef(session.id),
    };
  } catch {
    return { email: null as string | null, amountCents: null as number | null, ref: null as string | null };
  }
}

export default function Success({ loaderData }: Route.ComponentProps) {
  const { clear } = useCart();
  const c = useT().checkout;

  // El pago se completó → vaciar el carrito.
  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">✓</div>
        <h1>{c.successTitle}</h1>
        <p>
          {c.successThanks}.
          {loaderData.email ? <> {c.successEmail} <strong>{loaderData.email}</strong>.</> : null}
          {loaderData.amountCents != null && (
            <> {c.total} <strong>{formatPrice(loaderData.amountCents)}</strong>.</>
          )}
        </p>
        {loaderData.ref && (
          <p className="caption" style={{ marginBottom: 'var(--space-8)' }}>
            {c.reference.replace('{ref}', loaderData.ref)}
          </p>
        )}
        <Button href="/the-wheels" variant="primary" size="large">
          {c.keepShopping}
        </Button>
      </div>
    </div>
  );
}
