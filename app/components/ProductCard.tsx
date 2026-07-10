import { Link } from 'react-router';
import type { Product, WheelColor } from '~/types/product';

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
    <Link className="pcard" to={`/the-wheels/${product.slug}`}>
      <div className="ph">
        {/* Placeholder hasta tener fotografía real (PRD-XXA) */}
        <div className={`product-card__image-placeholder ${placeholderClass}`}>
          <div className="product-card__wheel-icon" aria-hidden="true" />
        </div>

        {product.featured && (
          <div className="badges">
            <span className="badge badge-new">New</span>
          </div>
        )}

        <div className="ov">
          <span className="overlay-cta">Ver ficha →</span>
        </div>
      </div>

      <div className="body">
        <p className="coll">Wheels · {product.specs.pcd}</p>
        <h3 className="nm">{product.model}</h3>
        <div className="row">
          <span className="price">{product.priceLabel}</span>
          <span className="caption">{sizes.join(' · ')}</span>
        </div>
      </div>
    </Link>
  );
}
