import { Button } from './Button';
import { trackEvent } from '~/lib/analytics/trackEvent';

interface FitmentCalloutProps {
  source?: string;
}

export function FitmentCallout({ source = 'product_page' }: FitmentCalloutProps) {
  function handleInterest() {
    trackEvent('hub_rings_interest_clicked', { source });
  }

  return (
    <div className="fitment-callout">
      <div className="fitment-callout__icon" aria-hidden="true">⬡</div>
      <h3 className="fitment-callout__title">Need Hub Rings?</h3>
      <p className="fitment-callout__text">
        The Victoria base CB is 72.6mm. If your vehicle hub is a different diameter,
        SAMORAI custom hub rings ensure a perfect concentric fit — eliminating vibration
        and meeting OEM tolerances.
      </p>
      <Button
        href="/contacto"
        variant="secondary"
        onClick={handleInterest}
      >
        Consultar fitment
      </Button>
    </div>
  );
}
