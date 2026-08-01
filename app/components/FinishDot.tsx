import type { WheelColor } from '~/types/product';
import { FINISH_SWATCH_CLASS } from './ProductMedia';

/**
 * Disco con el color/gradiente real de un acabado. Se usa dentro de las pills
 * del selector (tamaño `sm`) y en la columna de acabados junto a la foto
 * grande (tamaño `lg`), para que ambos controles se lean como el mismo sistema.
 */
export function FinishDot({
  color,
  size = 'sm',
  className = '',
}: {
  color: WheelColor;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`finish-dot finish-dot--${size} ${FINISH_SWATCH_CLASS[color]} ${className}`}
    />
  );
}
