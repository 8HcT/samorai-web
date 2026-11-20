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

/**
 * `paid`: pago confirmado · `processing`: pedido hecho, el banco aún confirma
 * (métodos diferidos) · `unknown`: sin sesión válida (visita directa, error
 * de Stripe…). Solo los dos primeros vacían el carrito.
 */
type SuccessState = 'paid' | 'processing' | 'unknown';

export async function loader({ request }: Route.LoaderArgs) {
  const unknown = { state: 'unknown' as SuccessState, email: null as string | null, amountCents: null as number | null, ref: null as string | null };
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !isStripeConfigured()) return unknown;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.status !== 'complete') return unknown;
    const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    return {
      state: (paid ? 'paid' : 'processing') as SuccessState,
      email: session.customer_details?.email ?? null,
      amountCents: session.amount_total ?? null,
      // La misma referencia que el correo de confirmación (#XXXXXXXX).
      ref: cartOrderRef(session.id),
    };
  } catch {
    return unknown;
  }
}

export default function Success({ loaderData }: Route.ComponentProps) {
  const { clear } = useCart();
  const c = useT().checkout;
  const { state } = loaderData;

  // Pedido hecho (pagado o confirmándose) → vaciar el carrito. Una visita
  // directa a esta página no lo toca.
  useEffect(() => {
    if (state !== 'unknown') clear();
  }, [state, clear]);

  if (state === 'unknown') {
    return (
      <div className="placeholder-page">
        <div className="placeholder-page__inner">
          <h1>{c.unverifiedTitle}</h1>
          <p>{c.unverifiedBody}</p>
          <div className="placeholder-page__actions">
            <Button href="/contacto" variant="secondary" size="large">{c.contactUs}</Button>
            <Button href="/the-wheels" variant="primary" size="large">{c.keepShopping}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">{state === 'paid' ? '✓' : '…'}</div>
        <h1>{state === 'paid' ? c.successTitle : c.processingTitle}</h1>
        <p>
          {state === 'paid' ? `${c.successThanks}.` : c.processingBody}
          {state === 'paid' && loaderData.email ? <> {c.successEmail} <strong>{loaderData.email}</strong>.</> : null}
          {loaderData.amountCents != null && (
            <> {c.total} <strong>{formatPrice(loaderData.amountCents)}</strong>.</>
          )}
        </p>
        {loaderData.ref && (
          <p className="caption" style={{ marginBottom: 'var(--space-8)' }}>
            {c.reference.replace('{ref}', loaderData.ref)}
          </p>
        )}
        <div className="next-steps">
          <h2 className="next-steps__title">{c.nextTitle}</h2>
          <ol className="next-steps__list">
            {c.nextSteps.map((step, i) => (
              <li key={i}>
                <span className="next-steps__n" aria-hidden="true">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <Button href="/the-wheels" variant="primary" size="large">
          {c.keepShopping}
        </Button>
      </div>
    </div>
  );
}
