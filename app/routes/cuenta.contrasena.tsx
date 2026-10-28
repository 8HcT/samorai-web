import type { Route } from './+types/cuenta.contrasena';
import { Form, Link, data, useNavigation } from 'react-router';
import { requireUser } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';

const MIN_PASSWORD_LENGTH = 10;

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Contraseña | SAMORAI' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, auth } = await requireUser(request);
  return data({ email: user.email ?? '' }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { auth } = await requireUser(request);
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    return data({ ok: false, message: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400, headers: auth.headers });
  }
  if (password !== String(form.get('password2') ?? '')) {
    return data({ ok: false, message: 'Las contraseñas no coinciden.' }, { status: 400, headers: auth.headers });
  }
  const { error } = await auth.supabase.auth.updateUser({ password });
  if (error) {
    console.error('[auth] updateUser password', error.status, error.message);
    return data({ ok: false, message: 'No se pudo cambiar la contraseña. Prueba con otra más segura.' }, { status: 400, headers: auth.headers });
  }
  return data({ ok: true, message: 'Contraseña guardada.' }, { headers: auth.headers });
}

export default function Password({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return (
    <div className="section">
      <div className="container auth-page auth-page--narrow">
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="account-page__title">Contraseña</h1>
        <p className="caption">Cuenta: {loaderData.email}. Es opcional: siempre puedes entrar con un enlace por email.</p>
        <section className="account-card">
          <Form method="post" className="auth-form">
            <label className="presale-field">
              <span>Nueva contraseña (mínimo {MIN_PASSWORD_LENGTH} caracteres)</span>
              <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <label className="presale-field">
              <span>Repite la contraseña</span>
              <input type="password" name="password2" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            {actionData && (
              <p className={actionData.ok ? 'notice notice--ok' : 'presale-form__error'} role="status">{actionData.message}</p>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>Guardar contraseña</button>
          </Form>
          <p className="caption auth-links"><Link to="/cuenta">Volver a mi cuenta</Link></p>
        </section>
      </div>
    </div>
  );
}
