import type { Route } from './+types/layout';
import { NavLink, Outlet, data, isRouteErrorResponse, Link } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import {
  cronSecret,
  isAccessLinkSecretConfigured,
  isStripeLiveKey,
  presaleBulkEmailsEnabled,
  presalePaymentsAllowed,
  presaleEnabled,
} from '~/lib/presale/config.server';
import { PRIVATE_PAGE_HEADERS } from '~/lib/security.server';
import { StatusChip } from '~/components/admin/AdminViz';

export function meta() {
  return [{ title: 'Administración | SAMORAI' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function headers() {
  return PRIVATE_PAGE_HEADERS;
}

/** Autorización en servidor. Cada ruta hija vuelve a comprobarla en su action. */
export async function loader({ request }: Route.LoaderArgs) {
  const { user, auth } = await requireAdmin(request);
  return data(
    {
      email: user.email ?? '',
      presale: presaleEnabled(),
      flags: {
        stripeLive: isStripeLiveKey(),
        payments: presalePaymentsAllowed(),
        bulkEmails: presaleBulkEmailsEnabled(),
        accessLinks: isAccessLinkSecretConfigured(),
        cron: Boolean(cronSecret()),
      },
    },
    { headers: auth.headers }
  );
}

const NAV = [
  { to: '/admin', label: 'Panel', end: true, presale: false },
  { to: '/admin/tiradas', label: 'Tiradas', end: false, presale: true },
  { to: '/admin/reservas', label: 'Reservas', end: false, presale: true },
  { to: '/admin/pedidos', label: 'Pedidos', end: false, presale: false },
  { to: '/admin/precios', label: 'Precios', end: false, presale: false },
  { to: '/admin/correos', label: 'Correos', end: false, presale: true },
  { to: '/admin/estado', label: 'Estado', end: false, presale: false },
];

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { email, flags, presale } = loaderData;
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="admin-header__brand">SAMORAI · Admin</span>
        <nav aria-label="Administración" className="admin-nav">
          {NAV.filter((n) => presale || !n.presale).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {n.label}
            </NavLink>
          ))}
          <Link to="/">← Web</Link>
        </nav>
        <span className="admin-header__user">{email}</span>
      </header>
      <main className="admin-main">
        <div className="admin-flags" aria-label="Estado de la configuración">
          <StatusChip tone={flags.stripeLive ? 'warning' : 'neutral'}>Stripe {flags.stripeLive ? 'LIVE' : 'modo test'}</StatusChip>
          {presale ? (
            <>
              <StatusChip tone={flags.payments ? 'good' : 'warning'}>
                Cobros de preventa {flags.payments ? 'activos' : 'desactivados (PRESALE_LIVE_PAYMENTS_ENABLED)'}
              </StatusChip>
              <StatusChip tone={flags.bulkEmails ? 'good' : 'warning'}>
                Envíos automáticos {flags.bulkEmails ? 'activos' : 'retenidos (PRESALE_BULK_EMAILS_ENABLED)'}
              </StatusChip>
              {!flags.accessLinks && <StatusChip tone="critical">Falta ACCESS_LINK_SECRET</StatusChip>}
              {!flags.cron && <StatusChip tone="critical">Falta CRON_SECRET</StatusChip>}
            </>
          ) : (
            <StatusChip tone="neutral">Preventa desactivada (PRESALE_ENABLED)</StatusChip>
          )}
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <div className="admin-shell">
      <main className="admin-main">
        <h1 className="admin-title">{status === 403 ? 'Acceso restringido' : 'Error'}</h1>
        <p className="admin-sub">
          {status === 403
            ? 'Tu cuenta no tiene permisos de administración.'
            : isRouteErrorResponse(error)
              ? String(error.data ?? error.statusText)
              : 'Se ha producido un error inesperado.'}
        </p>
        <Link to="/" className="btn btn-outline">Volver a la web</Link>
      </main>
    </div>
  );
}
