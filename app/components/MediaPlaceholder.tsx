import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Hueco de imagen. Si el archivo `file` existe, muestra la imagen; si no (o si
 * falla la carga), muestra un patrón rayado con la etiqueta y la ruta esperada.
 * Así basta con soltar el archivo en `public/images/…` para que aparezca sola.
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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file]);

  const showImg = Boolean(file) && !failed;

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
          src={file}
          alt={label}
          className="media-ph__img"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
