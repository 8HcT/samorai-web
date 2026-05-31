import type { Route } from './+types/cancel';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Request Cancelled — SAMORAI Wheels' }];
}

export default function Cancel() {
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">×</div>
        <h1>Request Cancelled</h1>
        <p>
          Your request was not submitted. Your cart selection is still saved.
        </p>
        <Button href="/cart" variant="primary" size="large">
          Return to Cart
        </Button>
      </div>
    </div>
  );
}
