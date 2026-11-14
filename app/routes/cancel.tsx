import type { Route } from './+types/cancel';

import { Button } from '~/components/Button';
import { t as translations } from '~/i18n/config';
import { useT } from '~/i18n/useT';
import { rootSeoData } from '~/lib/seo';

export function meta(args: Route.MetaArgs) {
  return [{ title: translations(rootSeoData(args).locale).checkout.metaCancel }, { name: 'robots', content: 'noindex, nofollow' }];
}

/** Vuelta desde Stripe sin pagar (cancel_url del checkout del carrito). */
export default function Cancel() {
  const c = useT().checkout;
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">×</div>
        <h1>{c.cancelTitle}</h1>
        <p>{c.cancelBody}</p>
        <Button href="/cart" variant="primary" size="large">
          {c.backToCart}
        </Button>
      </div>
    </div>
  );
}
