import { useEffect, useState } from 'react';
import { Link } from 'react-router';

const STORAGE_KEY = 'samorai_cookie_consent';

/**
 * Banner de cookies (componente 24 del sistema oficial · clase .cookies).
 * Barra inferior fija. Persiste la decisión en localStorage.
 * El consentimiento real (Cookiebot o similar) se integra después.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function decide(value: 'accepted' | 'rejected') {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="cookies"
      role="dialog"
      aria-label="Aviso de cookies"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 'var(--z-overlay)' }}
    >
      <p>
        Usamos cookies para mejorar tu experiencia. Consulta nuestra{' '}
        <Link to="/cookies">política de cookies</Link>.
      </p>
      <div className="acts">
        <button className="btn btn-ghost btn-sm" onClick={() => decide('rejected')}>
          Rechazar
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => decide('accepted')}>
          Aceptar
        </button>
      </div>
    </div>
  );
}
