import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  redirect,
  Scripts,
  ScrollRestoration,
} from 'react-router';

import type { Route } from './+types/root';
import '~/styles/global.css';
import { preferredLocale, resolveLocale } from '~/i18n/config';
import { localeFromPath, localizePath } from '~/i18n/paths';
import { useLocale } from '~/i18n/useT';
import { canonicalOrigin } from '~/lib/env.server';
import { presaleEnabled } from '~/lib/presale/config.server';
import {
  GA_MEASUREMENT_ID,
  GTM_CONTAINER_ID,
  googleHeadScript,
} from '~/lib/analytics/google';

// Solo medimos en producción (no ensuciar GA con tráfico de localhost).
const ANALYTICS_ENABLED = import.meta.env.PROD;

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const cookie = request.headers.get('Cookie');
  const acceptLanguage = request.headers.get('Accept-Language');

  // Las páginas públicas llevan el idioma en la URL (ES raíz, EN /en). Si un
  // visitante que prefiere inglés aterriza en la versión española, se le
  // lleva a la inglesa (solo en la carga inicial; nunca a buscadores).
  const fromPath = localeFromPath(url.pathname);
  if (
    fromPath === 'es' &&
    preferredLocale(cookie, acceptLanguage, request.headers.get('User-Agent')) === 'en'
  ) {
    throw redirect(`${localizePath(url.pathname, 'en')}${url.search}`, {
      status: 302,
      headers: { Vary: 'Accept-Language, Cookie' },
    });
  }

  // Resto de páginas (carrito, cuenta…): cookie > Accept-Language.
  const locale = fromPath ?? resolveLocale(cookie, acceptLanguage);
  return { locale, origin: canonicalOrigin(request), presale: presaleEnabled() };
}

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'icon', href: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    // Montserrat es la fuente real del cuerpo. Pinyon Script es el fallback
    // de Sloop Script hasta subir su archivo a public/fonts/ (handoff §6).
    // Bank Gothic ya se sirve desde public/fonts/ (sin Saira).
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Pinyon+Script&display=swap',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Aplica el tema guardado antes del primer paint (evita flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('samorai_theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          }}
        />
        {ANALYTICS_ENABLED && (
          <>
            {/* Google Analytics 4 + Tag Manager (consent mode v2, ver lib/analytics/google.ts) */}
            <script dangerouslySetInnerHTML={{ __html: googleHeadScript }} />
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
            <script async src={`https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`} />
          </>
        )}
        <Meta />
        <Links />
      </head>
      <body>
        {ANALYTICS_ENABLED && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        background: '#1d1d1d',
        color: '#ededed',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '4rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{message}</h1>
      <p style={{ color: 'rgba(237,237,237,0.7)', maxWidth: '40ch' }}>{details}</p>
      {stack && (
        <pre
          style={{
            width: '100%',
            maxWidth: '600px',
            padding: '1rem',
            overflow: 'auto',
            background: '#232323',
            borderRadius: '0',
            fontSize: '0.8rem',
            textAlign: 'left',
            color: 'rgba(237,237,237,0.5)',
          }}
        >
          <code>{stack}</code>
        </pre>
      )}
      <a href="/" style={{ color: '#D7B55B', marginTop: '1rem' }}>
        ← Back to home
      </a>
    </div>
  );
}
