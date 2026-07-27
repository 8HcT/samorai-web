import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Lee las imágenes reales de un acabado desde
 *   public/images/products/<model>/<finishId>/
 * y devuelve sus URLs ordenadas (1.jpg, 2.jpg, … 10.jpg). Así la galería
 * muestra tantas imágenes como haya en la carpeta, sin número fijo.
 *
 * Si la carpeta no se puede leer (p. ej. en el runtime de producción, donde
 * `public/` no está en el filesystem de la función) o está vacía, se
 * devuelve `fallback` (la lista estática por defecto).
 */
export async function readFinishImages(
  model: string,
  finishId: string,
  fallback: string[]
): Promise<string[]> {
  try {
    const dir = path.join(process.cwd(), 'public', 'images', 'products', model, finishId);
    const files = (await readdir(dir)).filter((f) =>
      /\.(jpe?g|png|webp|avif)$/i.test(f)
    );
    if (files.length === 0) return fallback;
    files.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    return files.map((f) => `/images/products/${model}/${finishId}/${f}`);
  } catch {
    return fallback;
  }
}
