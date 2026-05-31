import { NavLink } from 'react-router';
import { LanguagePlaceholder } from './LanguagePlaceholder';

export function Header() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <NavLink to="/" className="site-logo" aria-label="SAMORAI — home">
          SAMORAI
        </NavLink>

        <nav className="site-nav" aria-label="Main navigation">
          <ul className="site-nav__list" role="list">
            <li>
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
                }
              >
                Home
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/shop"
                className={({ isActive }) =>
                  `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
                }
              >
                Shop
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/fitment"
                className={({ isActive }) =>
                  `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
                }
              >
                Fitment
              </NavLink>
            </li>
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
