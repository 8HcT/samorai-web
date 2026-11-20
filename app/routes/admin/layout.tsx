import type { Route } from './+types/layout';
import { useEffect, useState, type ReactNode } from 'react';
import { Form, NavLink, Outlet, data, isRouteErrorResponse, Link, useLocation, useNavigation } from 'react-router';
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
import { AdminPageSkeleton } from '~/components/admin/AdminSkeletons';
import {
  IconBatches,
  IconExternal,
  IconMail,
  IconOrders,
  IconPanel,
  IconPrices,
  IconReservations,
  IconStatus,
} from '~/components/admin/icons';

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

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  presale: boolean;
  /** Se queda fuera de la barra de pestañas del móvil (hay poco sitio). */
  desktopOnly?: boolean;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Panel', end: true, presale: false, icon: <IconPanel /> },
  { to: '/admin/tiradas', label: 'Tiradas', end: false, presale: true, icon: <IconBatches /> },
  { to: '/admin/reservas', label: 'Reservas', end: false, presale: true, icon: <IconReservations /> },
  { to: '/admin/pedidos', label: 'Pedidos', end: false, presale: false, icon: <IconOrders /> },
  { to: '/admin/precios', label: 'Precios', end: false, presale: false, icon: <IconPrices /> },
  { to: '/admin/correos', label: 'Correos', end: false, presale: true, desktopOnly: true, icon: <IconMail /> },
  { to: '/admin/estado', label: 'Estado', end: false, presale: false, icon: <IconStatus /> },
];

const navClass = ({ isActive, isPending }: { isActive: boolean; isPending: boolean }) =>
  [isActive ? 'active' : '', isPending ? 'pending' : ''].filter(Boolean).join(' ') || undefined;

/** true solo si `active` dura más de `ms` (evita parpadeos en cargas rápidas). */
function useDelayed(active: boolean, ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const t = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(t);
  }, [active, ms]);
  return on;
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { email, flags, presale } = loaderData;
  const navigation = useNavigation();
  const location = useLocation();
  // Cambio de pantalla o filtro (no un guardado: esos llevan su propio indicador).
  const loadingPage = navigation.state === 'loading' && (!navigation.formMethod || navigation.formMethod.toUpperCase() === 'GET');
  const nextPath = navigation.location?.pathname ?? '';
  // Otra pantalla del panel: se enseña su esqueleto. Mismo sitio (filtros): solo se atenúa.
  const switching = loadingPage && nextPath.startsWith('/admin') && nextPath !== location.pathname;
  const showSkeleton = useDelayed(switching, 180);
  const items = NAV.filter((n) => presale || !n.presale);

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link to="/admin" className="admin-header__brand">
          SAMORAI <small>Admin</small>
        </Link>
        <nav aria-label="Administración" className="admin-nav">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={navClass} prefetch="intent">
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-header__end">
          <span className={`admin-env${flags.stripeLive ? '' : ' admin-env--test'}`} title={flags.stripeLive ? 'Los pagos son reales' : 'Claves de prueba: no se cobra dinero real'}>
            {flags.stripeLive ? 'Stripe LIVE' : 'Stripe test'}
          </span>
          <span className="admin-header__user" title={email}>{email}</span>
          <a href="/" className="admin-header__web" target="_blank" rel="noreferrer" aria-label="Ver la web (se abre en otra pestaña)">
            <IconExternal />
            <span>Ver la web</span>
          </a>
          <Form method="post" action="/cuenta/salir">
            <button type="submit" className="btn btn-ghost btn-sm">Salir</button>
          </Form>
        </div>
      </header>

      <main className="admin-main" id="contenido">
        {presale && (
          <div className="admin-flags" aria-label="Estado de la configuración de preventa">
            <StatusChip tone={flags.payments ? 'good' : 'warning'}>
              Cobros de preventa {flags.payments ? 'activos' : 'desactivados (PRESALE_LIVE_PAYMENTS_ENABLED)'}
            </StatusChip>
            <StatusChip tone={flags.bulkEmails ? 'good' : 'warning'}>
              Envíos automáticos {flags.bulkEmails ? 'activos' : 'retenidos (PRESALE_BULK_EMAILS_ENABLED)'}
            </StatusChip>
            {!flags.accessLinks && <StatusChip tone="critical">Falta ACCESS_LINK_SECRET</StatusChip>}
            {!flags.cron && <StatusChip tone="critical">Falta CRON_SECRET</StatusChip>}
          </div>
        )}
        <div className="admin-content" aria-busy={(loadingPage && !showSkeleton) || undefined}>
          {showSkeleton ? <AdminPageSkeleton path={nextPath} /> : <Outlet />}
        </div>
      </main>

      <nav aria-label="Administración (móvil)" className="admin-tabbar">
        {items
          .filter((n) => !n.desktopOnly)
          .map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={navClass} prefetch="intent">
              {n.icon}
              <span>{n.label}</span>
            </NavLink>
          ))}
      </nav>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <div className="admin-shell">
      <main className="admin-main">
        <div className="admin-section" style={{ maxWidth: 560, margin: '10vh auto 0' }}>
          <h1 className="admin-title">{status === 403 ? 'Acceso restringido' : status === 404 ? 'No encontrado' : 'Algo ha fallado'}</h1>
          <p className="admin-sub" style={{ marginBottom: 20 }}>
            {status === 403
              ? 'Tu cuenta no tiene permisos de administración.'
              : isRouteErrorResponse(error)
                ? String(error.data ?? error.statusText)
                : 'Se ha producido un error inesperado. Vuelve a intentarlo en unos segundos.'}
          </p>
          <div className="admin-actions">
            <Link to="/admin" className="btn btn-primary">Ir al panel</Link>
            <Link to="/" className="btn btn-outline">Volver a la web</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
