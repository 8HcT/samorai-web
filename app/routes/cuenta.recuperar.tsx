import type { Route } from './+types/cuenta.recuperar';
import { Form, Link, data, useNavigation } from 'react-router';
import { siteUrl } from '~/lib/env.server';
import { createAuthClient, isAuthConfigured } from '~/lib/auth/session.server';
import { assertSameOrigin, normalizeEmail } from '~/lib/security.server';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Recuperar acceso | SAMORAI' }, { name: 'robots', content: 'noindex' }];
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!isAuthConfigured()) return data({ ok: false, message: 'No disponible todavía.' }, { status: 503 });
  const form = await request.formData();
  const email = normalizeEmail(form.get('email'));
  if (!email) return data({ ok: false, message: 'Introduce un email válido.' }, { status: 400 });
  const { supabase, headers } = createAuthClient(request);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=%2Fcuenta%2Fcontrasena`,
  });
  if (error) console.error('[auth] resetPasswordForEmail', error.status, error.message);
  // Respuesta neutra: no se revela si el email tiene cuenta.
  return data({ ok: true, message: `Si ${email} tiene cuenta, recibirás un enlace para elegir una contraseña nueva.` }, { headers });
}

export default function Recover({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return (
    <div className="section">
      <div className="container auth-page auth-page--narrow">
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="account-page__title">Recuperar acceso</h1>
        <section className="account-card">
          {actionData?.ok ? (
            <p className="notice notice--ok" role="status">{actionData.message}</p>
          ) : (
            <Form method="post" className="auth-form">
              <label className="presale-field">
                <span>Email de tu cuenta</span>
                <input type="email" name="email" required autoComplete="email" />
              </label>
              {actionData && !actionData.ok && <p className="presale-form__error" role="alert">{actionData.message}</p>}
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>Enviarme el enlace</button>
            </Form>
          )}
          <p className="caption auth-links">
            ¿Prefieres no usar contraseña? <Link to="/cuenta/acceso">Entra con un enlace por email</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
