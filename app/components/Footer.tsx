import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="footer">
      <div className="ft-brand">
        <Link to="/" className="wm">SAMORAI</Link>
        <p>Premium automotive wheels, engineered for precision.</p>
      </div>

      <div>
        <h4>The Wheels</h4>
        <ul role="list">
          <li><Link to="/the-wheels">Catálogo</Link></li>
          <li><Link to="/the-wheels">Acabados</Link></li>
        </ul>
      </div>

      <div>
        <h4>Marca</h4>
        <ul role="list">
          <li><Link to="/the-dynasty">The Dynasty</Link></li>
          <li><Link to="/the-dealers">The Dealers</Link></li>
          <li><Link to="/contacto">Contacto</Link></li>
        </ul>
      </div>

      <div>
        <h4>Legal</h4>
        <ul role="list">
          <li><Link to="/legal">Aviso legal</Link></li>
          <li><Link to="/privacidad">Política de privacidad</Link></li>
          <li><Link to="/cookies">Política de cookies</Link></li>
        </ul>
      </div>
    </footer>
  );
}
