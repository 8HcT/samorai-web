import { useEffect, useState } from 'react';
import type { WheelColor } from '~/types/product';
import { optimizedSrc, optimizedSrcSet } from '~/lib/images';

/** Swatch de color (placeholder) por acabado, mientras no hay foto real. */
export const FINISH_SWATCH_CLASS: Record<WheelColor, string> = {
  'Anthracite Grey': 'product-card__image-placeholder--anthracite',
  'Black Metallic': 'product-card__image-placeholder--black',
  'Silver Metallic': 'product-card__image-placeholder--silver',
  'Raw Aluminum': 'product-card__image-placeholder--aluminum',
};

/**
 * Imagen de producto con fallback: mientras la foto real no exista (o falle
 * al cargar), se ve el swatch de color + icono de rueda. Cuando la imagen
 * carga, la cubre con un fundido. Así funciona ya con placeholders y, al
 * subir las fotos a public/images/, se muestran sin tocar el código.
 */
export function ProductMedia({
  src,
  alt,
  color,
  sizes = '(max-width: 768px) 100vw, 33vw',
  priority = false,
  className = '',
}: {
  src?: string;
  alt: string;
  color: WheelColor;
  /** Ancho aproximado en pantalla, para que el navegador elija la variante. */
  sizes?: string;
  /** Imagen principal visible al cargar (no diferida y con prioridad alta). */
  priority?: boolean;
  className?: string;
}) {
  // La imagen se muestra por defecto (evita el problema del `onLoad` que no
  // dispara con SSR/caché). Si falla la WebP se prueba el original; si falla
  // también, se oculta y se ve el swatch.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
  }, [src]);

  return (
    <div className={`product-card__image-placeholder ${FINISH_SWATCH_CLASS[color]} product-media ${className}`}>
      <div className="product-card__wheel-icon" aria-hidden="true" />
      {src && stage < 2 && (
        <img
          src={stage === 0 ? optimizedSrc(src, 1200) : src}
          srcSet={stage === 0 ? optimizedSrcSet(src) : undefined}
          sizes={stage === 0 ? sizes : undefined}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className="product-media__img"
          onError={() => setStage((s) => s + 1)}
        />
      )}
    </div>
  );
}
