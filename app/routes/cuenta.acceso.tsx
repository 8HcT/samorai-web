import type { Route } from './+types/cuenta.acceso';
import { Form, Link, data, redirect, useNavigation } from 'react-router';
import { siteUrl } from '~/lib/env.server';
import { createAuthClient, getSessionUser, isAuthConfigured } from '~/lib/auth/session.server';
import { assertSameOrigin, normalizeEmail, safeNextPath } from '~/lib/security.server';
import { accountHomePath, presaleEnabled } from '~/lib/presale/config.server';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Acceder | SAMORAI' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNextPath(new URL(request.url).searchParams.get('next'), accountHomePath());
  const { user } = await getSessionUser(request);
  if (user) throw redirect(next);
  // Registro de clientes solo con la preventa activa.
  return { next, configured: isAuthConfigured(), signup: presaleEnabled() };
}

type ActionResult = { mode: 'magic' | 'password'; ok: boolean; message: string };

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!isAuthConfigured()) {
    return data<ActionResult>({ mode: 'magic', ok: false, message: 'El acceso de clientes aún no está disponible.' }, { status: 503 });
  }
  const form = await request.formData();
  const next = safeNextPath(String(form.get('next') ?? ''), accountHomePath());
  const mode = form.get('intent') === 'password' ? 'password' : 'magic';
  const email = normalizeEmail(form.get('email'));
  if (!email) return data<ActionResult>({ mode, ok: false, message: 'Introduce un email válido.' }, { status: 400 });

  const { supabase, headers } = createAuthClient(request);

  if (mode === 'magic') {
    // Crear cuenta, entrar y recuperar el acceso son el mismo paso.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      console.error('[auth] signInWithOtp', error.status, error.message);
      const message =
        error.status === 429
          ? 'Has pedido demasiados enlaces. Espera unos minutos y vuelve a intentarlo.'
          : 'No hemos podido enviar el enlace. Inténtalo de nuevo en unos minutos.';
      return data<ActionResult>({ mode, ok: false, message }, { status: 400, headers });
    }
    // Las cabeceras llevan la cookie del verificador PKCE del enlace.
    return data<ActionResult>(
      { mode, ok: true, message: `Te hemos enviado un enlace de acceso a ${email}. Ábrelo en este dispositivo para entrar.` },
      { headers }
    );
  }

  const password = String(form.get('password') ?? '');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = /confirm/i.test(error.message)
      ? 'Confirma primero tu email con el enlace que te enviamos al registrarte.'
      : 'Email o contraseña incorrectos.';
    return data<ActionResult>({ mode, ok: false, message }, { status: 400, headers });
  }
  throw redirect(next, { headers });
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const { next, configured, signup } = loaderData;

  return (
    <div className="section">
      <div className="container auth-page">
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="account-page__title">Acceder</h1>
        <p className="caption">
          La cuenta es opcional: puedes reservar y comprar como invitado. Con ella verás todas tus reservas y pedidos en
          un sitio; las compras que hiciste con tu email se vinculan automáticamente.
        </p>

        {!configured && <div className="notice">El acceso de clientes estará disponible próximamente.</div>}

        <div className="auth-grid">
          <section className="account-card">
            <h2 className="account-card__title">Con un enlace por email</h2>
            <p className="caption">Sin contraseña. Sirve también para crear la cuenta o recuperar el acceso.</p>
            <Form method="post" className="auth-form">
              <input type="hidden" name="intent" value="magic" />
              <input type="hidden" name="next" value={next} />
              <label className="presale-field">
                <span>Email</span>
                <input type="email" name="email" required autoComplete="email" />
              </label>
              {actionData?.mode === 'magic' && (
                <p className={actionData.ok ? 'notice notice--ok' : 'presale-form__error'} role="status">{actionData.message}</p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={busy || !configured}>Enviarme el enlace</button>
            </Form>
          </section>

          <section className="account-card">
            <h2 className="account-card__title">Con contraseña</h2>
            <Form method="post" className="auth-form">
              <input type="hidden" name="intent" value="password" />
              <input type="hidden" name="next" value={next} />
              <label className="presale-field">
                <span>Email</span>
                <input type="email" name="email" required autoComplete="username" />
              </label>
              <label className="presale-field">
                <span>Contraseña</span>
                <input type="password" name="password" required autoComplete="current-password" />
              </label>
              {actionData?.mode === 'password' && !actionData.ok && (
                <p className="presale-form__error" role="alert">{actionData.message}</p>
              )}
              <button type="submit" className="btn btn-outline w-full" disabled={busy || !configured}>Entrar</button>
            </Form>
            <p className="caption auth-links">
              <Link to="/cuenta/recuperar">¿Has olvidado la contraseña?</Link>
              {signup && (
                <>
                  {' · '}
                  <Link to="/cuenta/registro">Crear cuenta con contraseña</Link>
                </>
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
