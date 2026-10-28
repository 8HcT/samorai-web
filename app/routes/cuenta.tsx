import type { Route } from './+types/cuenta';
import { Form, Link, data, useNavigation } from 'react-router';
import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { requireUser } from '~/lib/auth/session.server';
import { loadAccount, updateProfile } from '~/lib/presale/account.server';
import { DEPOSIT_STATUS_LABEL, ORDER_STATUS_LABEL, RESERVATION_STATUS_LABEL, label } from '~/lib/presale/labels';
import { PRIVATE_PAGE_HEADERS, assertSameOrigin, cleanText } from '~/lib/security.server';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Mi cuenta | SAMORAI' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function headers() {
  return PRIVATE_PAGE_HEADERS;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, auth } = await requireUser(request);
  const account = await loadAccount(user, auth);
  return data({ email: user.email ?? '', account, now: new Date().toISOString() }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user, auth } = await requireUser(request);
  const form = await request.formData();
  if (form.get('intent') !== 'profile') return data({ ok: false }, { status: 400, headers: auth.headers });
  await updateProfile(user, auth, {
    fullName: cleanText(form.get('fullName'), 120),
    phone: cleanText(form.get('phone'), 40),
  });
  return data({ ok: true }, { headers: auth.headers });
}

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { email, account, now } = loaderData;
  const busy = useNavigation().state !== 'idle';
  const nowMs = new Date(now).getTime();

  return (
    <div className="section">
      <div className="container account-page">
        <p className="eyebrow">SAMORAI</p>
        <h1 className="account-page__title">Mi cuenta</h1>
        {(account.claimed.reservations > 0 || account.claimed.orders > 0) && (
          <div className="notice notice--ok" role="status">
            Hemos vinculado a tu cuenta {account.claimed.reservations} reserva(s) y {account.claimed.orders} pedido(s) hechos con {email}.
          </div>
        )}
        {!account.profile?.email_verified_at && (
          <div className="notice" role="status">
            Para vincular las compras que hiciste como invitado, <Link to="/cuenta/acceso">entra una vez con el enlace por email</Link>: así confirmamos que el email es tuyo.
          </div>
        )}

        <section className="account-card">
          <h2 className="account-card__title">Mis reservas</h2>
          {account.reservations.length === 0 ? (
            <p className="caption">No tienes reservas. <Link to="/the-wheels">Ver las llantas</Link>.</p>
          ) : (
            <ul className="account-list">
              {account.reservations.map((r) => {
                const daysLeft = r.balance_due_at ? Math.max(0, Math.ceil((new Date(r.balance_due_at).getTime() - nowMs) / 86_400_000)) : null;
                return (
                  <li key={r.id} className="account-list__item">
                    <div className="account-list__main">
                      <p className="account-list__title">
                        {r.product_name} {r.finish_name} · {formatSize(Number(r.diameter), Number(r.width))} {formatEt(r.et)}
                        <span className={`presale-chip presale-chip--status-${r.status}`}>{label(RESERVATION_STATUS_LABEL, r.status)}</span>
                      </p>
                      <p className="caption">
                        {r.code} · {r.quantity_sets} {r.quantity_sets === 1 ? 'juego' : 'juegos'} · Reservada el <LocalDateTime iso={r.created_at} dateOnly />
                      </p>
                      <p className="caption">
                        Precio final {formatPrice(r.total_cents)}
                        {r.discount_cents > 0 ? ` (descuento ${formatPrice(r.discount_cents)})` : ''} · Reserva abonada {formatPrice(r.deposit_cents)} ({label(DEPOSIT_STATUS_LABEL, r.deposit_status)})
                        {r.status !== 'completed' && r.status !== 'cancelled' && r.status !== 'expired' ? ` · Pendiente ${formatPrice(r.balance_cents)}` : ''}
                      </p>
                      {r.status === 'balance_due' && r.balance_due_at && (
                        <p className="deadline">
                          Fecha límite: <strong><LocalDateTime iso={r.balance_due_at} /></strong> · {daysLeft === 1 ? 'queda 1 día' : `quedan ${daysLeft} días`}
                        </p>
                      )}
                    </div>
                    <Link to={`/reserva/${r.id}`} className={r.status === 'balance_due' ? 'btn btn-primary' : 'btn btn-outline'}>
                      {r.status === 'balance_due' ? `Pagar ${formatPrice(r.balance_cents)}` : 'Ver reserva'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="account-card">
          <h2 className="account-card__title">Mis pedidos</h2>
          {account.orders.length === 0 ? (
            <p className="caption">Todavía no tienes pedidos.</p>
          ) : (
            <ul className="account-list">
              {account.orders.map((o) => (
                <li key={o.id} className="account-list__item">
                  <div className="account-list__main">
                    <p className="account-list__title">
                      Pedido {o.code ?? '—'}
                      <span className="presale-chip">{label(ORDER_STATUS_LABEL, o.status)}</span>
                    </p>
                    <p className="caption">
                      <LocalDateTime iso={o.created_at} dateOnly /> · {formatPrice(o.amount_total_cents)} ·{' '}
                      {o.order_items.map((i) => `${i.product_name}${i.finish_name ? ` ${i.finish_name}` : ''} ×${i.quantity}`).join(', ')}
                    </p>
                    {o.tracking_number && <p className="caption">Seguimiento: {o.carrier ? `${o.carrier} · ` : ''}{o.tracking_number}</p>}
                  </div>
                  <Link to={`/pedido/${o.id}`} className="btn btn-outline">Ver pedido</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="account-card">
          <h2 className="account-card__title">Datos personales</h2>
          <Form method="post" className="auth-form account-profile">
            <input type="hidden" name="intent" value="profile" />
            <label className="presale-field">
              <span>Email</span>
              <input type="email" value={email} readOnly disabled />
            </label>
            <label className="presale-field">
              <span>Nombre</span>
              <input type="text" name="fullName" defaultValue={account.profile?.full_name ?? ''} maxLength={120} autoComplete="name" />
            </label>
            <label className="presale-field">
              <span>Teléfono</span>
              <input type="tel" name="phone" defaultValue={account.profile?.phone ?? ''} maxLength={40} autoComplete="tel" />
            </label>
            {actionData?.ok && <p className="notice notice--ok" role="status">Datos guardados.</p>}
            <button type="submit" className="btn btn-outline" disabled={busy}>Guardar</button>
          </Form>
          <p className="caption auth-links">
            <Link to="/cuenta/contrasena">Establecer o cambiar contraseña</Link>
          </p>
          <Form method="post" action="/cuenta/salir">
            <button type="submit" className="btn btn-ghost">Cerrar sesión</button>
          </Form>
        </section>
      </div>
    </div>
  );
}
