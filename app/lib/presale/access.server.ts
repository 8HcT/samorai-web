/**
 * Enlaces seguros para compradores sin cuenta (solo servidor).
 *
 * El correo incluye `/reserva/<id>?t=<token>` donde el token es un HMAC-SHA256
 * de (tipo, id, versión) con ACCESS_LINK_SECRET. No se guarda en la base de
 * datos y puede regenerarse para cada correo; incrementar `access_version`
 * desde el panel invalida todos los enlaces enviados hasta ese momento.
 * Un enlace de reserva permite verla y pagar lo pendiente, nada más.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { siteUrl } from '~/lib/env.server';
import { accessLinkSecret } from './config.server';

export type AccessKind = 'reservation' | 'order' | 'allocation';

export function accessToken(kind: AccessKind, id: string, version: number): string {
  return createHmac('sha256', accessLinkSecret())
    .update(`samorai:${kind}:${id}:${version}`)
    .digest('base64url');
}

export function verifyAccessToken(
  kind: AccessKind,
  id: string,
  version: number,
  token: string | null | undefined
): boolean {
  if (!token || token.length > 100) return false;
  const expected = Buffer.from(accessToken(kind, id, version));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function reservationLink(id: string, version: number, base = siteUrl()): string {
  return `${base}/reserva/${id}?t=${accessToken('reservation', id, version)}`;
}

export function orderLink(id: string, version: number, base = siteUrl()): string {
  return `${base}/pedido/${id}?t=${accessToken('order', id, version)}`;
}

/** Página a la que vuelve el cliente si cancela el checkout de Stripe. */
export function checkoutCancelLink(kind: 'reservation' | 'allocation', id: string, base = siteUrl()): string {
  return `${base}/checkout/cancelado?k=${kind}&id=${id}&t=${accessToken(kind, id, 1)}`;
}
