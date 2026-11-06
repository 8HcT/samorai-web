import { useEffect, useState } from 'react';
import { NavLink, useLocation, useRouteLoaderData } from 'react-router';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { useCart } from '~/lib/cart/CartContext';
import { useLocalePath, useT } from '~/i18n/useT';

type NavKey = 'home' | 'dynasty' | 'wheels' | 'dealers' | 'contact';

const NAV: { to: string; key: NavKey; end: boolean }[] = [
  { to: '/', key: 'home', end: true },
  { to: '/the-dynasty', key: 'dynasty', end: false },
  { to: '/the-wheels', key: 'wheels', end: false },
  // The Dealers oculto hasta una fase más avanzada del proyecto.
  // { to: '/the-dealers', key: 'dealers', end: false },
  { to: '/contacto', key: 'contact', end: false },
];

export function Header() {
  const { count, ready } = useCart();
  const t = useT();
  const lp = useLocalePath();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // La cuenta de cliente solo existe con la preventa activa (PRESALE_ENABLED).
  const presale = (useRouteLoaderData('root') as { presale?: boolean } | undefined)?.presale === true;

  const cartLabel = `${t.nav.cart}${ready && count > 0 ? ` (${count})` : ''}`;

  // Cerrar el menú al navegar y al pulsar Escape.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="navbar samorai-header">
      <NavLink to={lp('/')} className="nv-logo" aria-label="SAMORAI — home" onClick={() => setOpen(false)}>
        <img src="/logo.svg" alt="SAMORAI" className="nv-logo__img" />
      </NavLink>

      {/* Navegación de escritorio */}
      <nav aria-label="Main navigation" className="nv-desktop">
        <ul className="nv-links" role="list">
          {NAV.map(({ to, key, end }) => (
            <li key={to}>
              <NavLink to={lp(to)} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                {t.nav[key]}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="nv-cta nv-desktop">
        {presale && (
          <NavLink
            to="/cuenta"
            className={({ isActive }) => `nv-cart nv-account${isActive ? ' active' : ''}`}
          >
            {t.nav.account}
          </NavLink>
        )}
        <NavLink
          to="/cart"
          className={({ isActive }) => `nv-cart${isActive ? ' active' : ''}`}
          aria-label={cartLabel}
        >
          {cartLabel}
        </NavLink>
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      {/* Botón de menú móvil */}
      <button
        type="button"
        className="nv-toggle"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span /><span /><span />
      </button>

      {/* Menú móvil */}
      {open && (
        <>
          <div className="nv-mobile-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="nv-mobile" role="dialog" aria-modal="true" aria-label="Menú">
            <ul className="nv-mobile__links" role="list">
              {NAV.map(({ to, key, end }) => (
                <li key={to}>
                  <NavLink
                    to={lp(to)}
                    end={end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => (isActive ? 'active' : undefined)}
                  >
                    {t.nav[key]}
                  </NavLink>
                </li>
              ))}
              {presale && (
                <li>
                  <NavLink to="/cuenta" onClick={() => setOpen(false)}>
                    {t.nav.account}
                  </NavLink>
                </li>
              )}
              <li>
                <NavLink to="/cart" onClick={() => setOpen(false)} className="nv-mobile__cart">
                  {cartLabel}
                </NavLink>
              </li>
            </ul>
            <div className="nv-mobile__controls">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </div>
        </>
      )}
    </header>
  );
}
