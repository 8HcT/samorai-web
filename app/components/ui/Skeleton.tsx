import type { CSSProperties } from 'react';

/**
 * Bloque de carga con brillo animado. Ocupa el sitio del contenido que va a
 * llegar para que la página no salte. Es decorativo: el contenedor que lo usa
 * debe anunciar la carga (p. ej. `aria-busy` o un texto «Cargando…» oculto).
 */
export function Skeleton({
  width,
  height = '1em',
  className = '',
  style,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  radius?: number | string;
}) {
  return (
    <span
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** Varias líneas de texto simuladas (la última, más corta). */
export function SkeletonText({ lines = 2, className = '' }: { lines?: number; className?: string }) {
  return (
    <span className={`skeleton-text ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 && lines > 1 ? '62%' : '100%'} height="0.85em" />
      ))}
    </span>
  );
}
