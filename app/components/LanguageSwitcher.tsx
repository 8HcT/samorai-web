import { useLocale } from '~/i18n/useT';
import { supportedLocales, LOCALE_COOKIE } from '~/i18n/config';

/**
 * Selector de idioma EN / ES. Persiste la elección en una cookie legible
 * por el servidor y recarga, de modo que el SSR renderiza directamente en
 * el idioma elegido (sin desajustes de hidratación).
 */
export function LanguageSwitcher() {
  const locale = useLocale();

  function choose(next: string) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    window.location.reload();
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
