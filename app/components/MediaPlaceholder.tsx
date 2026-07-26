import type { CSSProperties } from 'react';

/**
 * Placeholder de imagen reutilizable. Muestra una etiqueta + la ruta del
 * archivo esperado. Cuando exista la imagen, sustituye
 *   <MediaPlaceholder label=… file="/images/…" />
 * por:
 *   <img src="/images/…" alt="…" className="media-fill" />
 * (los archivos van en `public/images/`).
 */
export function MediaPlaceholder({
  label,
  file,
  ratio,
  className = '',
  style,
}: {
  label: string;
  file: string;
  ratio?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`media-ph ${className}`}
      role="img"
      aria-label={`Imagen pendiente: ${label}`}
      style={{ aspectRatio: ratio, ...style }}
    >
      <span className="media-ph__label">
        {label}
        <span className="media-ph__file">{file}</span>
      </span>
    </div>
  );
}
