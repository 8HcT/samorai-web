import { useEffect, useState, type CSSProperties } from 'react';
import { optimizedSrc, optimizedSrcSet } from '~/lib/images';

/**
 * Hueco de imagen. Si el archivo `file` existe, muestra la imagen; si no (o si
 * falla la carga), muestra un patrón rayado con la etiqueta y la ruta esperada.
 * Así basta con soltar el archivo en `public/images/…` para que aparezca sola.
 */
export function MediaPlaceholder({
  label,
  file,
  ratio,
  alt,
  sizes = '(max-width: 768px) 100vw, 50vw',
  priority = false,
  className = '',
  style,
}: {
  label: string;
  file: string;
  ratio?: string;
  /** Texto alternativo descriptivo (por defecto, la etiqueta). */
  alt?: string;
  sizes?: string;
  /** Imagen visible al cargar (no diferida y con prioridad alta). */
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  // 0 = WebP optimizada · 1 = original (si falta la variante) · 2 = sin imagen
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [file]);

  const showImg = Boolean(file) && stage < 2;

  return (
    <div
      className={`media-ph ${showImg ? 'media-ph--filled' : ''} ${className}`}
      role="img"
      aria-label={showImg ? label : `Imagen pendiente: ${label}`}
      style={{ aspectRatio: ratio, ...style }}
    >
      <span className="media-ph__label">
        {label}
        <span className="media-ph__file">{file}</span>
      </span>
      {showImg && (
        <img
          src={stage === 0 ? optimizedSrc(file, 1200) : file}
          srcSet={stage === 0 ? optimizedSrcSet(file) : undefined}
          sizes={stage === 0 ? sizes : undefined}
          alt={alt ?? label}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className="media-ph__img"
          onError={() => setStage((s) => s + 1)}
        />
      )}
    </div>
  );
}
