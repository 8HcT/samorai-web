import { NavLink } from 'react-router';
import { LanguagePlaceholder } from './LanguagePlaceholder';
import { useCart } from '~/lib/cart/CartContext';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/the-dynasty', label: 'The Dynasty' },
  { to: '/the-wheels', label: 'The Wheels' },
  { to: '/the-dealers', label: 'The Dealers' },
  { to: '/contacto', label: 'Contacto' },
];

export function Header() {
  const { count, ready } = useCart();

  return (
    <header className="navbar samorai-header">
      <NavLink to="/" className="nv-logo" aria-label="SAMORAI — home">
        SAMORAI
      </NavLink>

      <nav aria-label="Main navigation">
        <ul className="nv-links" role="list">
          {NAV_LINKS.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="nv-cta">
        <NavLink
          to="/cart"
          className={({ isActive }) => `nv-cart${isActive ? ' active' : ''}`}
          aria-label={`Cart${ready && count > 0 ? ` (${count})` : ''}`}
        >
          Cart{ready && count > 0 ? ` (${count})` : ''}
        </NavLink>
        <LanguagePlaceholder />
      </div>
    </header>
  );
}
