/**
 * `assertSameOrigin`: los formularios de la propia web pasan aunque el
 * navegador mande `Origin: null` (política de referer estricta); los que
 * vienen de otra web, o sin ninguna señal verificable, se rechazan.
 */
import { describe, expect, it } from 'vitest';
import { PRIVATE_PAGE_HEADERS, assertSameOrigin } from '~/lib/security.server';

function post(headers: Record<string, string>) {
  return new Request('http://localhost/admin/estado', { method: 'POST', headers });
}

function status(headers: Record<string, string>): number {
  try {
    assertSameOrigin(post(headers));
    return 200;
  } catch (res) {
    return (res as Response).status;
  }
}

describe('assertSameOrigin', () => {
  it('acepta el Origin de la propia web', () => {
    expect(status({ Origin: 'http://localhost' })).toBe(200);
  });

  it('acepta el Referer de la propia web si no hay Origin', () => {
    expect(status({ Referer: 'http://localhost/admin/estado' })).toBe(200);
  });

  it('acepta «Origin: null» si el navegador confirma que sale de esta web (Sec-Fetch-Site)', () => {
    expect(status({ Origin: 'null', 'Sec-Fetch-Site': 'same-origin' })).toBe(200);
  });

  it('rechaza otra web aunque diga Sec-Fetch-Site same-origin (manda el Origin)', () => {
    expect(status({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' })).toBe(403);
  });

  it('rechaza «Origin: null» sin más señales y las peticiones de otros sitios', () => {
    expect(status({ Origin: 'null' })).toBe(403);
    expect(status({ Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).toBe(403);
    expect(status({})).toBe(403);
  });

  it('las páginas privadas no usan no-referrer (rompería sus propios formularios)', () => {
    expect(PRIVATE_PAGE_HEADERS['Referrer-Policy']).toBe('same-origin');
  });
});
