import { useEffect, useState } from 'react';
import type { WheelColor } from '~/types/product';

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
  className = '',
}: {
  src?: string;
  alt: string;
  color: WheelColor;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  // Al cambiar de imagen (p. ej. hover o click en miniatura), reintentar carga.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className={`product-card__image-placeholder ${FINISH_SWATCH_CLASS[color]} product-media ${className}`}>
      <div className="product-card__wheel-icon" aria-hidden="true" />
      {src && (
        <img
          src={src}
          alt={alt}
          className="product-media__img"
          loading="lazy"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      )}
    </div>
  );
}
