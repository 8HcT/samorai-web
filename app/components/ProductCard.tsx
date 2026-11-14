import { Link } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import type { Product, ProductFinish, WheelColor } from '~/types/product';
import { getWidthsForFinish } from '~/data/products';
import { formatSize } from '~/lib/format';
import { useLocale, useLocalePath, useT } from '~/i18n/useT';
import { ProductMedia, FINISH_SWATCH_CLASS as PLACEHOLDER_CLASS } from './ProductMedia';
import { PriceTag, PromoBadge } from './PriceTag';
import type { VariantPrice } from '~/lib/pricing';

interface ProductCardProps {
  product: Product;
  activeColor?: WheelColor;
  /**
   * Modo "modelo/color": renderiza la tarjeta para un acabado concreto y
   * enlaza a la ficha con ese acabado preseleccionado (`?finish=<id>`).
   */
  finish?: ProductFinish;
  /** Precio más bajo vigente (con promoción si la hay). Sin él, `priceLabel`. */
  price?: VariantPrice | null;
}

export function ProductCard({ product, activeColor, finish, price }: ProductCardProps) {
  // Hover largo (~3 s) → cambia a la imagen secundaria del acabado.
  const [showSecondary, setShowSecondary] = useState(false);
  const timer = useRef<number | null>(null);
  const lp = useLocalePath();
  const t = useT();
  const locale = useLocale();
  const finishName = (f: ProductFinish) => t.finishNames[f.id] ?? f.name;

  function clearTimer() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => clearTimer, []);

  function onEnter(images: string[]) {
    if (images.length < 2) return;
    clearTimer();
    timer.current = window.setTimeout(() => setShowSecondary(true), 3000);
  }
  function onLeave() {
    clearTimer();
    setShowSecondary(false);
  }

  // ── Tarjeta de acabado (uno de los "tres modelos") ──
  if (finish) {
    const sizes = getWidthsForFinish(product, finish.id).map((w) =>
      formatSize(18, w, locale)
    );
    const src =
      showSecondary && finish.images[1] ? finish.images[1] : finish.images[0];
    return (
      <Link
        className="pcard"
        to={lp(`/the-wheels/${product.slug}?finish=${finish.id}`)}
        aria-label={`${product.model} — ${finishName(finish)}`}
        onMouseEnter={() => onEnter(finish.images)}
        onMouseLeave={onLeave}
      >
        <div className="ph">
          <ProductMedia color={finish.color} src={src} alt={`${product.model} — ${finishName(finish)}`} />
          {(product.featured || price?.promotion) && (
            <div className="badges">
              {product.featured && <span className="badge badge-new">New</span>}
              {price?.promotion && <PromoBadge promotion={price.promotion} />}
            </div>
          )}
          <div className="ov">
            <span className="overlay-cta">{t.wheels.configure}</span>
          </div>
        </div>

        <div className="body">
          <p className="coll">Wheels · {product.model}</p>
          <h3 className="nm">{finishName(finish)}</h3>
          <div className="row">
            {price ? (
              <PriceTag price={price} prefix={t.product.from} wasLabel={t.product.was} className="price" />
            ) : (
              <span className="price">{product.priceLabel}</span>
            )}
            <span className="caption">{sizes.join(' · ')}</span>
          </div>
        </div>
      </Link>
    );
  }

  // ── Tarjeta de producto (comportamiento original) ──
  const displayColor = activeColor ?? product.colors[0];
  const placeholderClass = PLACEHOLDER_CLASS[displayColor];

  const sizes = Array.from(
    new Set(product.variants.map((v) => `${v.diameter}×${v.width}J`))
  ).slice(0, 4);

  return (
    <Link className="pcard" to={lp(`/the-wheels/${product.slug}`)}>
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
          <span className="overlay-cta">{t.wheels.viewProduct}</span>
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
