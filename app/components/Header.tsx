import { NavLink } from 'react-router';
import { LanguagePlaceholder } from './LanguagePlaceholder';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/wheels', label: 'Wheels' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/technology', label: 'Technology' },
  { to: '/fitment', label: 'Fitment' },
  { to: '/dealers', label: 'Dealers' },
  { to: '/support', label: 'Support' },
];

export function Header() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <NavLink to="/" className="site-logo" aria-label="SAMORAI — home">
          SAMORAI
        </NavLink>

        <nav className="site-nav" aria-label="Main navigation">
          <ul className="site-nav__list" role="list">
            {NAV_LINKS.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink
                to="/cart"
                className={({ isActive }) =>
                  `site-nav__link site-nav__link--cart${isActive ? ' site-nav__link--active' : ''}`
                }
                aria-label="Cart"
              >
                Cart
              </NavLink>
            </li>
          </ul>
        </nav>

        <LanguagePlaceholder />
      </div>
    </header>
  );
}
