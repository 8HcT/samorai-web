import type { Route } from './+types/success';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Request Received — SAMORAI Wheels' }];
}

export default function Success() {
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">✓</div>
        <h1>Request Received</h1>
        <p>
          Thank you for your interest in SAMORAI Wheels. We have logged your selection
          and will be in touch shortly.
        </p>
        <Button href="/shop" variant="primary" size="large">
          Back to Shop
        </Button>
      </div>
    </div>
  );
}
