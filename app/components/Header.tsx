import { NavLink } from 'react-router';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { useCart } from '~/lib/cart/CartContext';
import { useT } from '~/i18n/useT';

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

  return (
    <header className="navbar samorai-header">
      <NavLink to="/" className="nv-logo" aria-label="SAMORAI — home">
        SAMORAI
      </NavLink>

      <nav aria-label="Main navigation">
        <ul className="nv-links" role="list">
          {NAV.map(({ to, key, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {t.nav[key]}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="nv-cta">
        <NavLink
          to="/cart"
          className={({ isActive }) => `nv-cart${isActive ? ' active' : ''}`}
          aria-label={`${t.nav.cart}${ready && count > 0 ? ` (${count})` : ''}`}
        >
          {t.nav.cart}{ready && count > 0 ? ` (${count})` : ''}
        </NavLink>
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
    </header>
  );
}
