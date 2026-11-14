import type { Route } from './+types/cuenta.contrasena';
import { Form, Link, data, useNavigation } from 'react-router';
import { requireUser } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';
import { accountHomePath } from '~/lib/presale/config.server';
import { t as translations } from '~/i18n/config';
import { useT } from '~/i18n/useT';
import { rootSeoData } from '~/lib/seo';

const MIN_PASSWORD_LENGTH = 10;

export function meta(args: Route.MetaArgs) {
  return [{ title: translations(rootSeoData(args).locale).account.titles.password }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, auth } = await requireUser(request);
  // Con la preventa apagada no hay «Mi cuenta»: la vuelta es al panel.
  return data({ email: user.email ?? '', home: accountHomePath() }, { headers: auth.headers });
}

/** La página traduce el código (`t.account.msg`). */
type ActionResult = { ok: boolean; code: string };

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { auth } = await requireUser(request);
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    return data<ActionResult>({ ok: false, code: 'passwordMin' }, { status: 400, headers: auth.headers });
  }
  if (password !== String(form.get('password2') ?? '')) {
    return data<ActionResult>({ ok: false, code: 'passwordMismatch' }, { status: 400, headers: auth.headers });
  }
  const { error } = await auth.supabase.auth.updateUser({ password });
  if (error) {
    console.error('[auth] updateUser password', error.status, error.message);
    return data<ActionResult>({ ok: false, code: 'passwordFailed' }, { status: 400, headers: auth.headers });
  }
  return data<ActionResult>({ ok: true, code: 'passwordSaved' }, { headers: auth.headers });
}

export default function Password({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  const a = useT().account;
  const n = String(MIN_PASSWORD_LENGTH);
  const message = actionData ? (a.msg[actionData.code] ?? actionData.code).replace('{n}', n) : null;
  return (
    <div className="section">
      <div className="container auth-page auth-page--narrow">
        <p className="eyebrow">{a.eyebrow}</p>
        <h1 className="account-page__title">{a.passwordPageTitle}</h1>
        <p className="caption">{a.passwordAccount.replace('{email}', loaderData.email)}</p>
        <section className="account-card">
          <Form method="post" className="auth-form">
            <label className="presale-field">
              <span>{a.newPassword.replace('{n}', n)}</span>
              <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <label className="presale-field">
              <span>{a.repeatPassword}</span>
              <input type="password" name="password2" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            {actionData && (
              <p className={actionData.ok ? 'notice notice--ok' : 'presale-form__error'} role="status">{message}</p>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>{a.savePassword}</button>
          </Form>
          <p className="caption auth-links">
            <Link to={loaderData.home}>{loaderData.home === '/admin' ? a.backAdmin : a.backAccount}</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
