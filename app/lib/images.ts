/**
 * Variantes WebP generadas por `scripts/optimize-images.mjs` (antes de dev y
 * build): `/images/foo.png` → `/images/_opt/foo-<ancho>.webp`. Si una
 * variante faltase, los componentes caen a la imagen original.
 */
export const IMAGE_WIDTHS = [400, 800, 1200, 1920] as const; // igual que el script
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

const OPTIMIZABLE = /^\/images\/(?!_opt\/|og\/)(.+)\.(jpe?g|png)$/i;

/** URL de la variante WebP de `src` al ancho indicado (o `src` si no aplica). */
export function optimizedSrc(src: string, width: ImageWidth): string {
  const match = src.match(OPTIMIZABLE);
  return match ? `/images/_opt/${match[1]}-${width}.webp` : src;
}

/** `srcset` con todas las variantes, o `undefined` si la imagen no es optimizable. */
export function optimizedSrcSet(src: string): string | undefined {
  if (!OPTIMIZABLE.test(src)) return undefined;
  return IMAGE_WIDTHS.map((w) => `${optimizedSrc(src, w)} ${w}w`).join(', ');
}

/** Fondo CSS (`url(...)`) con la variante grande; para `--hero-bg`. */
export function cssBackground(src: string, width: ImageWidth = 1920): string {
  return `url('${optimizedSrc(src, width)}')`;
}
