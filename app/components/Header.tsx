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
      <NavLink prefetch="intent" to={lp('/')} className="nv-logo" aria-label={t.a11y.homeLink} onClick={() => setOpen(false)}>
        <img src="/logo.svg" alt="SAMORAI" className="nv-logo__img" />
      </NavLink>

      {/* Navegación de escritorio */}
      <nav aria-label={t.a11y.mainNav} className="nv-desktop">
        <ul className="nv-links" role="list">
          {NAV.map(({ to, key, end }) => (
            <li key={to}>
              <NavLink prefetch="intent" to={lp(to)} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                {t.nav[key]}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="nv-cta nv-desktop">
        {presale && (
          <NavLink prefetch="intent"
            to="/cuenta"
            className={({ isActive }) => `nv-cart nv-account${isActive ? ' active' : ''}`}
          >
            {t.nav.account}
          </NavLink>
        )}
        <NavLink prefetch="intent"
          to="/cart"
          className={({ isActive }) => `nv-cart${isActive ? ' active' : ''}`}
          aria-label={cartLabel}
        >
          {cartLabel}
        </NavLink>
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      {/* Móvil: carrito siempre a mano (con contador) + botón de menú */}
      <div className="nv-mobile-actions">
        <NavLink prefetch="intent"
          to="/cart"
          className={({ isActive }) => `nv-cart-icon${isActive ? ' active' : ''}`}
          aria-label={cartLabel}
          onClick={() => setOpen(false)}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z" />
            <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
          </svg>
          {/* key = cantidad: la insignia «salta» cada vez que cambia */}
          {ready && count > 0 && <span key={count} className="nv-cart-icon__badge" aria-hidden="true">{count}</span>}
        </NavLink>
        <button
          type="button"
          className="nv-toggle"
          aria-label={open ? t.a11y.closeMenu : t.a11y.openMenu}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
      </div>

      {/* Menú móvil */}
      {open && (
        <>
          <div className="nv-mobile-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="nv-mobile" role="dialog" aria-modal="true" aria-label={t.a11y.menu}>
            <ul className="nv-mobile__links" role="list">
              {NAV.map(({ to, key, end }) => (
                <li key={to}>
                  <NavLink prefetch="intent"
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
                  <NavLink prefetch="intent" to="/cuenta" onClick={() => setOpen(false)}>
                    {t.nav.account}
                  </NavLink>
                </li>
              )}
              <li>
                <NavLink prefetch="intent" to="/cart" onClick={() => setOpen(false)} className="nv-mobile__cart">
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
