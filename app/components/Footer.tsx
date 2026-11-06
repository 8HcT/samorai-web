import { Link } from 'react-router';
import { useLocalePath, useT } from '~/i18n/useT';

export function Footer() {
  const t = useT();
  const lp = useLocalePath();

  return (
    <footer className="footer">
      <div className="ft-brand">
        <Link to={lp('/')} className="wm">SAMORAI</Link>
        <p>{t.footer.tagline}</p>
      </div>

      <div>
        <h4>{t.footer.colWheels}</h4>
        <ul role="list">
          <li><Link to={lp('/the-wheels')}>{t.footer.catalog}</Link></li>
          <li><Link to={lp('/the-wheels')}>{t.footer.finishes}</Link></li>
        </ul>
      </div>

      <div>
        <h4>{t.footer.colBrand}</h4>
        <ul role="list">
          <li><Link to={lp('/the-dynasty')}>{t.footer.dynasty}</Link></li>
          {/* The Dealers oculto hasta una fase más avanzada del proyecto.
          <li><Link to={lp('/the-dealers')}>{t.footer.dealers}</Link></li> */}
          <li><Link to={lp('/contacto')}>{t.footer.contact}</Link></li>
        </ul>
      </div>

      <div>
        <h4>{t.footer.colLegal}</h4>
        <ul role="list">
          <li><Link to={lp('/legal')}>{t.footer.legalNotice}</Link></li>
          <li><Link to={lp('/privacidad')}>{t.footer.privacy}</Link></li>
          <li><Link to={lp('/cookies')}>{t.footer.cookies}</Link></li>
        </ul>
      </div>

      <div className="ft-copy" style={{ gridColumn: '1 / -1' }}>{t.footer.copyright}</div>
    </footer>
  );
}
