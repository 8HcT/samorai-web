import type { Route } from './+types/cuenta.registro';
import { assertPresaleEnabled } from '~/lib/presale/config.server';
import { Form, Link, data, redirect, useNavigation } from 'react-router';
import { siteUrl } from '~/lib/env.server';
import { createAuthClient, getSessionUser, isAuthConfigured } from '~/lib/auth/session.server';
import { assertSameOrigin, normalizeEmail } from '~/lib/security.server';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Crear cuenta | SAMORAI' }, { name: 'robots', content: 'noindex' }];
}

const MIN_PASSWORD_LENGTH = 10;

export async function loader({ request }: Route.LoaderArgs) {
  assertPresaleEnabled();
  const { user } = await getSessionUser(request);
  if (user) throw redirect('/cuenta');
  return { configured: isAuthConfigured() };
}

export async function action({ request }: Route.ActionArgs) {
  assertPresaleEnabled();
  assertSameOrigin(request);
  if (!isAuthConfigured()) return data({ ok: false, message: 'El registro aún no está disponible.' }, { status: 503 });
  const form = await request.formData();
  const email = normalizeEmail(form.get('email'));
  const password = String(form.get('password') ?? '');
  const repeat = String(form.get('password2') ?? '');
  if (!email) return data({ ok: false, message: 'Introduce un email válido.' }, { status: 400 });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return data({ ok: false, message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
  }
  if (password !== repeat) return data({ ok: false, message: 'Las contraseñas no coinciden.' }, { status: 400 });

  const { supabase, headers } = createAuthClient(request);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=%2Fcuenta` },
  });
  if (error) {
    console.error('[auth] signUp', error.status, error.message);
    const weak = /password/i.test(error.message);
    return data(
      { ok: false, message: weak ? 'Esa contraseña no es válida: usa una más larga y difícil de adivinar.' : 'No hemos podido crear la cuenta. Inténtalo más tarde.' },
      { status: 400, headers }
    );
  }
  // Mensaje idéntico exista o no la cuenta (no se revela qué emails están registrados).
  return data({ ok: true, message: `Revisa ${email}: te hemos enviado un enlace para confirmar la cuenta.` }, { headers });
}

export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return (
    <div className="section">
      <div className="container auth-page auth-page--narrow">
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="account-page__title">Crear cuenta</h1>
        <p className="caption">
          Opcional. También puedes <Link to="/cuenta/acceso">entrar con un enlace por email</Link>, sin contraseña.
        </p>
        <section className="account-card">
          {actionData?.ok ? (
            <p className="notice notice--ok" role="status">{actionData.message}</p>
          ) : (
            <Form method="post" className="auth-form">
              <label className="presale-field">
                <span>Email</span>
                <input type="email" name="email" required autoComplete="email" />
              </label>
              <label className="presale-field">
                <span>Contraseña (mínimo {MIN_PASSWORD_LENGTH} caracteres)</span>
                <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              </label>
              <label className="presale-field">
                <span>Repite la contraseña</span>
                <input type="password" name="password2" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              </label>
              {actionData && !actionData.ok && <p className="presale-form__error" role="alert">{actionData.message}</p>}
              <button type="submit" className="btn btn-primary w-full" disabled={busy || !loaderData.configured}>Crear cuenta</button>
              <p className="caption">
                Trataremos tus datos solo para gestionar tu cuenta, reservas y pedidos. <Link to="/privacidad">Política de privacidad</Link>.
              </p>
            </Form>
          )}
        </section>
      </div>
    </div>
  );
}
