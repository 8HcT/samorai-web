import { formatPrice } from '~/lib/money';
import { promoText, type AppliedPromotion, type VariantPrice } from '~/lib/pricing';
import { useLocale } from '~/i18n/useT';

/** Etiqueta de la promoción en el idioma de la página: «Black Friday −20%». */
export function PromoBadge({ promotion, className = '' }: { promotion: AppliedPromotion; className?: string }) {
  const locale = useLocale();
  return (
    <span className={`badge badge-promo ${className}`.trim()}>
      {promoText(promotion, locale)} −{promotion.percentOff}%
    </span>
  );
}

/**
 * Precio con promoción: el anterior tachado y el nuevo. Sin promoción, solo
 * el precio. `quantity` multiplica ambos importes (totales de línea).
 */
export function PriceTag({
  price,
  quantity = 1,
  prefix,
  wasLabel = 'Antes {price}',
  className = '',
}: {
  price: VariantPrice | null | undefined;
  quantity?: number;
  /** Texto delante del importe (p. ej. «Desde»). */
  prefix?: string;
  /** Texto accesible del precio tachado; `{price}` = importe anterior. */
  wasLabel?: string;
  className?: string;
}) {
  if (!price) return <span className={className}>{formatPrice(null)}</span>;
  const now = price.finalCents * quantity;
  if (!price.promotion) {
    return <span className={className}>{prefix ? `${prefix} ` : ''}{formatPrice(now)}</span>;
  }
  const was = price.baseCents * quantity;
  return (
    <span className={`price-tag ${className}`.trim()}>
      {prefix ? `${prefix} ` : ''}
      <s className="price-was" aria-label={wasLabel.replace('{price}', formatPrice(was))}>{formatPrice(was)}</s>{' '}
      <span className="price-now">{formatPrice(now)}</span>
    </span>
  );
}
