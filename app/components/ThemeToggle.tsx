import { useEffect, useState } from 'react';
import { useT } from '~/i18n/useT';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'samorai_theme';

/**
 * Conmutador de tema claro/oscuro. Escribe `data-theme` en <html> y lo
 * persiste en localStorage. El valor inicial lo aplica un script inline
 * en <head> (root.tsx) para evitar el flash al cargar.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);
  const a = useT().a11y;

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'light';
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? a.themeToLight : a.themeToDark}
      title={isDark ? a.themeToLight : a.themeToDark}
      aria-pressed={mounted ? !isDark : undefined}
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </button>
  );
}
