import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLocalePath, useT } from '~/i18n/useT';
import { CONSENT_STORAGE_KEY as STORAGE_KEY, updateAnalyticsConsent } from '~/lib/analytics/google';

/**
 * Banner de cookies (componente 24 del sistema oficial · clase .cookies).
 * Barra inferior fija. Persiste la decisión en localStorage.
 * El consentimiento real (Cookiebot o similar) se integra después.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const t = useT();
  const lp = useLocalePath();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function decide(value: 'accepted' | 'rejected') {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
    updateAnalyticsConsent(value === 'accepted');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="cookies"
      role="dialog"
      aria-label={t.a11y.cookieNotice}
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 'var(--z-overlay)' }}
    >
      <p>
        {t.cookie.message}{' '}
        <Link to={lp('/cookies')}>{t.cookie.policyLink}</Link>.
      </p>
      <div className="acts">
        <button className="btn btn-ghost btn-sm" onClick={() => decide('rejected')}>
          {t.cookie.reject}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => decide('accepted')}>
          {t.cookie.accept}
        </button>
      </div>
    </div>
  );
}
