import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';

import type { Route } from './+types/root';
import '~/styles/global.css';
import { resolveLocale } from '~/i18n/config';

export function loader({ request }: Route.LoaderArgs) {
  // Idioma: cookie explícita del usuario > detección por Accept-Language.
  const locale = resolveLocale(
    request.headers.get('Cookie'),
    request.headers.get('Accept-Language')
  );
  return { locale };
}

export const links: Route.LinksFunction = () => [
  // Icono de la web: SVG (moderno) con fallback al .ico para navegadores viejos.
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'alternate icon', href: '/favicon.ico' },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    // Montserrat es la fuente real del cuerpo. Saira y Pinyon Script son
    // los fallbacks de Bank Gothic / Sloop Script hasta subir los .woff2
    // a public/fonts/ (handoff §6).
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Saira:wght@400;500;600;700&family=Pinyon+Script&display=swap',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData('root') as { locale?: string } | undefined;
  return (
    <html lang={data?.locale ?? 'en'} suppressHydrationWarning>
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
        <Meta />
        <Links />
      </head>
      <body>
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
      <a href="/" style={{ color: '#d8b45b', marginTop: '1rem' }}>
        ← Back to home
      </a>
    </div>
  );
}
