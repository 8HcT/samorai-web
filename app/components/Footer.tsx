import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <Link to="/" className="site-logo">SAMORAI</Link>
            <p>Premium automotive wheels, engineered for precision.</p>
          </div>

          <div>
            <p className="site-footer__col-title">Products</p>
            <ul className="site-footer__links" role="list">
              <li><Link to="/wheels">Victoria Wheels</Link></li>
              <li><Link to="/wheels">All Finishes</Link></li>
              <li><Link to="/fitment">Hub Rings (coming soon)</Link></li>
            </ul>
          </div>

          <div>
            <p className="site-footer__col-title">Learn</p>
            <ul className="site-footer__links" role="list">
              <li><Link to="/technology">Technology</Link></li>
              <li><Link to="/fitment">Fitment Guide</Link></li>
              <li><Link to="/gallery">Gallery</Link></li>
              <li><Link to="/dealers">Dealers</Link></li>
            </ul>
          </div>

          <div>
            <p className="site-footer__col-title">Company</p>
            <ul className="site-footer__links" role="list">
              <li><Link to="/support">Support</Link></li>
              <li><Link to="/dealers">Become a Dealer</Link></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Cookie Policy</a></li>
            </ul>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© 2025 SAMORAI. All rights reserved.</span>
          <span className="label">Language: EN · ES (coming soon)</span>
        </div>
      </div>
    </footer>
  );
}
