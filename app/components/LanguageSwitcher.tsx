import { useLocation } from 'react-router';
import { useLocale } from '~/i18n/useT';
import { supportedLocales, LOCALE_COOKIE, type Locale } from '~/i18n/config';
import { isLocalizedPath, localizePath, splitLocalePath } from '~/i18n/paths';

/**
 * Selector de idioma EN / ES. Persiste la elección en una cookie legible
 * por el servidor y, en páginas públicas, navega a la URL del otro idioma
 * (`/the-wheels` ↔ `/en/the-wheels`). En el resto recarga para que el SSR
 * renderice directamente en el idioma elegido.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const location = useLocation();

  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    const { path } = splitLocalePath(location.pathname);
    if (isLocalizedPath(path)) {
      window.location.assign(`${localizePath(path, next)}${location.search}${location.hash}`);
    } else {
      window.location.reload();
    }
  }

  return (
    <div className="lang-switch" role="group" aria-label="Idioma / Language">
      {supportedLocales.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-switch__btn${l === locale ? ' active' : ''}`}
          aria-pressed={l === locale}
          onClick={() => choose(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
