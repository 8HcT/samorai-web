import type { Route } from './+types/success';
import { useEffect } from 'react';
import { Button } from '~/components/Button';
import { useCart } from '~/lib/cart/CartContext';
import { formatPrice } from '~/lib/money';
import { getStripe, isStripeConfigured } from '~/lib/stripe/stripe.server';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Pedido confirmado | SAMORAI' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !isStripeConfigured()) {
    return { email: null as string | null, amountCents: null as number | null, ref: sessionId };
  }
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return {
      email: session.customer_details?.email ?? null,
      amountCents: session.amount_total ?? null,
      ref: session.id,
    };
  } catch {
    return { email: null as string | null, amountCents: null as number | null, ref: sessionId };
  }
}

export default function Success({ loaderData }: Route.ComponentProps) {
  const { clear } = useCart();

  // El pago se completó → vaciar el carrito.
  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">✓</div>
        <h1>Pedido confirmado</h1>
        <p>
          Gracias por tu compra en SAMORAI Wheels
          {loaderData.email ? <>. Hemos enviado la confirmación a <strong>{loaderData.email}</strong></> : null}.
          {loaderData.amountCents != null && (
            <> Total: <strong>{formatPrice(loaderData.amountCents)}</strong>.</>
          )}
        </p>
        {loaderData.ref && (
          <p className="caption" style={{ marginBottom: 'var(--space-8)' }}>
            Referencia: {loaderData.ref}
          </p>
        )}
        <Button href="/the-wheels" variant="primary" size="large">
          Seguir comprando
        </Button>
      </div>
    </div>
  );
}
