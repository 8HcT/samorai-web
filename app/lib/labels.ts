/**
 * Etiquetas de producto editables desde /admin («Nuevo», «Últimas
 * unidades»…): una opcional por acabado. Compartido entre servidor y
 * navegador. La de las promociones es aparte y automática.
 */

export const LABEL_MAX_LENGTH = 24;

/** Etiquetas vigentes por `producto:acabado`. */
export type ProductLabels = Record<string, string>;

export const labelKey = (productSlug: string, finishId: string) => `${productSlug}:${finishId}`;

/** Texto de la etiqueta listo para guardar. Vacío = quitarla. */
export function normalizeLabel(raw: unknown): { ok: true; label: string | null } | { ok: false; reason: string } {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: true, label: null };
  if (text.length > LABEL_MAX_LENGTH) {
    return { ok: false, reason: `La etiqueta admite como mucho ${LABEL_MAX_LENGTH} caracteres.` };
  }
  return { ok: true, label: text };
}
