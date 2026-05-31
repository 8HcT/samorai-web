import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';

import type { Route } from './+types/root';
import '~/styles/global.css';

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
        background: '#0a0a0a',
        color: '#f0ece5',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '4rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{message}</h1>
      <p style={{ color: '#8c8c8c', maxWidth: '40ch' }}>{details}</p>
      {stack && (
        <pre
          style={{
            width: '100%',
            maxWidth: '600px',
            padding: '1rem',
            overflow: 'auto',
            background: '#141414',
            borderRadius: '6px',
            fontSize: '0.8rem',
            textAlign: 'left',
            color: '#8c8c8c',
          }}
        >
          <code>{stack}</code>
        </pre>
      )}
      <a href="/" style={{ color: '#c8a02a', marginTop: '1rem' }}>
        ← Back to home
      </a>
    </div>
  );
}
