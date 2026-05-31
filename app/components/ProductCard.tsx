import { Link } from 'react-router';
import type { Product, WheelColor } from '~/types/product';
import { Button } from './Button';

const COLOR_CLASS: Record<WheelColor, string> = {
  'Anthracite Grey': 'anthracite',
  'Black Metallic': 'black',
  'Silver Metallic': 'silver',
  'Raw Aluminum': 'raw-aluminum',
};

const PLACEHOLDER_CLASS: Record<WheelColor, string> = {
  'Anthracite Grey': 'product-card__image-placeholder--anthracite',
  'Black Metallic': 'product-card__image-placeholder--black',
  'Silver Metallic': 'product-card__image-placeholder--silver',
  'Raw Aluminum': 'product-card__image-placeholder--aluminum',
};

interface ProductCardProps {
  product: Product;
  activeColor?: WheelColor;
}

export function ProductCard({ product, activeColor }: ProductCardProps) {
  const displayColor = activeColor ?? product.colors[0];
  const placeholderClass = PLACEHOLDER_CLASS[displayColor];

  const sizes = Array.from(
    new Set(product.variants.map((v) => `${v.diameter}×${v.width}J`))
  ).slice(0, 4);

  return (
    <article className="product-card">
      <Link to={`/wheels/${product.slug}`} tabIndex={-1} aria-hidden="true">
        <div className="product-card__image">
          <div className={`product-card__image-placeholder ${placeholderClass}`}>
            <div className="product-card__wheel-icon" aria-hidden="true" />
          </div>
          {product.featured && (
            <span className="product-card__badge">New</span>
          )}
        </div>
      </Link>

      <div className="product-card__body">
        <p className="product-card__category">Wheels</p>
        <h3 className="product-card__name">
          <Link to={`/wheels/${product.slug}`}>{product.model}</Link>
        </h3>
        <p className="product-card__desc">
          {sizes.join(', ')} · {product.specs.pcd}
        </p>

        <div className="product-card__colors" role="list" aria-label="Available finishes">
          {product.colors.map((color) => (
            <Link
              key={color}
              to={`/wheels/${product.slug}`}
              role="listitem"
              aria-label={color}
              title={color}
            >
              <span
                className={`color-swatch color-swatch--${COLOR_CLASS[color]}${color === displayColor ? ' color-swatch--active' : ''}`}
              />
            </Link>
          ))}
        </div>

        <div className="product-card__footer">
          <span className="product-card__price">{product.priceLabel}</span>
          <Button href={`/wheels/${product.slug}`} variant="secondary" size="small">
            View Details
          </Button>
        </div>
      </div>
    </article>
  );
}
