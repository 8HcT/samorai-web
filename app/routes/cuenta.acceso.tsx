import type { Route } from './+types/cuenta.acceso';
import { Form, Link, data, redirect, useNavigation } from 'react-router';
import { siteUrl } from '~/lib/env.server';
import { createAuthClient, getSessionUser, isAuthConfigured } from '~/lib/auth/session.server';
import { assertSameOrigin, normalizeEmail, safeNextPath } from '~/lib/security.server';
import { accountHomePath, presaleEnabled } from '~/lib/presale/config.server';
import { t as translations } from '~/i18n/config';
import { useT } from '~/i18n/useT';
import { rootSeoData } from '~/lib/seo';

export function meta(args: Route.MetaArgs) {
  return [{ title: translations(rootSeoData(args).locale).account.titles.login }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNextPath(new URL(request.url).searchParams.get('next'), accountHomePath());
  const { user } = await getSessionUser(request);
  if (user) throw redirect(next);
  // Registro de clientes solo con la preventa activa: sin ella solo entra el equipo.
  return { next, configured: isAuthConfigured(), signup: presaleEnabled() };
}

/** La página traduce el código (`t.account.msg`); `email` rellena «{email}». */
type ActionResult = { mode: 'magic' | 'password'; ok: boolean; code: string; email?: string };

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!isAuthConfigured()) {
    return data<ActionResult>({ mode: 'magic', ok: false, code: 'notAvailable' }, { status: 503 });
  }
  const form = await request.formData();
  const next = safeNextPath(String(form.get('next') ?? ''), accountHomePath());
  const mode = form.get('intent') === 'password' ? 'password' : 'magic';
  const email = normalizeEmail(form.get('email'));
  if (!email) return data<ActionResult>({ mode, ok: false, code: 'invalidEmail' }, { status: 400 });

  const { supabase, headers } = createAuthClient(request);

  if (mode === 'magic') {
    // Con la preventa: crear cuenta, entrar y recuperar el acceso son el mismo
    // paso. Sin ella no hay cuentas de cliente: el enlace solo sirve a cuentas
    // ya creadas (el equipo), y nadie puede darse de alta escribiendo su email.
    const createUser = presaleEnabled();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: createUser,
        emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      // Sin alta automática, un email sin cuenta da error: se responde igual
      // que si se hubiera enviado, para no revelar qué emails tienen cuenta.
      const noAccount = error.code === 'otp_disabled' || /signups? not allowed/i.test(error.message);
      if (!createUser && noAccount) {
        return data<ActionResult>({ mode, ok: true, code: 'linkSent', email }, { headers });
      }
      console.error('[auth] signInWithOtp', error.status, error.message);
      const code = error.status === 429 ? 'tooManyLinks' : 'linkFailed';
      return data<ActionResult>({ mode, ok: false, code }, { status: 400, headers });
    }
    // Las cabeceras llevan la cookie del verificador PKCE del enlace.
    return data<ActionResult>({ mode, ok: true, code: 'linkSent', email }, { headers });
  }

  const password = String(form.get('password') ?? '');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const code = /confirm/i.test(error.message) ? 'confirmFirst' : 'wrongCredentials';
    return data<ActionResult>({ mode, ok: false, code }, { status: 400, headers });
  }
  throw redirect(next, { headers });
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const { next, configured, signup } = loaderData;
  const a = useT().account;
  const message = actionData ? (a.msg[actionData.code] ?? actionData.code).replace('{email}', actionData.email ?? '') : null;

  return (
    <div className="section">
      <div className="container auth-page">
        <p className="eyebrow">{a.eyebrow}</p>
        <h1 className="account-page__title">{a.loginTitle}</h1>
        <p className="caption">{signup ? a.loginIntro : a.loginIntroTeam}</p>

        {!configured && <div className="notice">{a.notConfigured}</div>}

        <div className="auth-grid">
          <section className="account-card">
            <h2 className="account-card__title">{a.magicTitle}</h2>
            <p className="caption">{signup ? a.magicBody : a.magicBodyTeam}</p>
            <Form method="post" className="auth-form">
              <input type="hidden" name="intent" value="magic" />
              <input type="hidden" name="next" value={next} />
              <label className="presale-field">
                <span>{a.email}</span>
                <input type="email" name="email" required autoComplete="email" />
              </label>
              {actionData?.mode === 'magic' && (
                <p className={actionData.ok ? 'notice notice--ok' : 'presale-form__error'} role="status">{message}</p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={busy || !configured}>{a.sendLink}</button>
            </Form>
          </section>

          <section className="account-card">
            <h2 className="account-card__title">{a.passwordTitle}</h2>
            <Form method="post" className="auth-form">
              <input type="hidden" name="intent" value="password" />
              <input type="hidden" name="next" value={next} />
              <label className="presale-field">
                <span>{a.email}</span>
                <input type="email" name="email" required autoComplete="username" />
              </label>
              <label className="presale-field">
                <span>{a.password}</span>
                <input type="password" name="password" required autoComplete="current-password" />
              </label>
              {actionData?.mode === 'password' && !actionData.ok && (
                <p className="presale-form__error" role="alert">{message}</p>
              )}
              <button type="submit" className="btn btn-outline w-full" disabled={busy || !configured}>{a.signIn}</button>
            </Form>
            <p className="caption auth-links">
              <Link to="/cuenta/recuperar">{a.forgot}</Link>
              {signup && (
                <>
                  {' · '}
                  <Link to="/cuenta/registro">{a.createWithPassword}</Link>
                </>
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
