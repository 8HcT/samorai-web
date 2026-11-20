import { describe, expect, it } from 'vitest';
import { LABEL_MAX_LENGTH, labelKey, normalizeLabel } from '~/lib/labels';

describe('etiquetas de producto (panel)', () => {
  it('limpia espacios y acepta textos cortos', () => {
    expect(normalizeLabel('  Últimas   unidades ')).toEqual({ ok: true, label: 'Últimas unidades' });
  });
  it('vacía = quitar la etiqueta', () => {
    expect(normalizeLabel('   ')).toEqual({ ok: true, label: null });
    expect(normalizeLabel(null)).toEqual({ ok: true, label: null });
  });
  it(`rechaza más de ${LABEL_MAX_LENGTH} caracteres`, () => {
    expect(normalizeLabel('x'.repeat(LABEL_MAX_LENGTH + 1)).ok).toBe(false);
    expect(normalizeLabel('x'.repeat(LABEL_MAX_LENGTH)).ok).toBe(true);
  });
  it('clave por producto y acabado', () => {
    expect(labelKey('victoria', 'black-metallic')).toBe('victoria:black-metallic');
  });
});
