import type { Route } from './+types/cuenta.recuperar';
import { Form, Link, data, useNavigation } from 'react-router';
import { siteUrl } from '~/lib/env.server';
import { createAuthClient, isAuthConfigured } from '~/lib/auth/session.server';
import { assertSameOrigin, normalizeEmail } from '~/lib/security.server';
import { t as translations } from '~/i18n/config';
import { useT } from '~/i18n/useT';
import { rootSeoData } from '~/lib/seo';

export function meta(args: Route.MetaArgs) {
  return [{ title: translations(rootSeoData(args).locale).account.titles.recover }, { name: 'robots', content: 'noindex' }];
}

/** La página traduce el código (`t.account.msg`); `email` rellena «{email}». */
type ActionResult = { ok: boolean; code: string; email?: string };

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!isAuthConfigured()) return data<ActionResult>({ ok: false, code: 'notAvailable' }, { status: 503 });
  const form = await request.formData();
  const email = normalizeEmail(form.get('email'));
  if (!email) return data<ActionResult>({ ok: false, code: 'invalidEmail' }, { status: 400 });
  const { supabase, headers } = createAuthClient(request);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=%2Fcuenta%2Fcontrasena`,
  });
  if (error) console.error('[auth] resetPasswordForEmail', error.status, error.message);
  // Respuesta neutra: no se revela si el email tiene cuenta.
  return data<ActionResult>({ ok: true, code: 'recoverSent', email }, { headers });
}

export default function Recover({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  const a = useT().account;
  const message = actionData ? (a.msg[actionData.code] ?? actionData.code).replace('{email}', actionData.email ?? '') : null;
  return (
    <div className="section">
      <div className="container auth-page auth-page--narrow">
        <p className="eyebrow">{a.eyebrow}</p>
        <h1 className="account-page__title">{a.recoverTitle}</h1>
        <section className="account-card">
          {actionData?.ok ? (
            <p className="notice notice--ok" role="status">{message}</p>
          ) : (
            <Form method="post" className="auth-form">
              <label className="presale-field">
                <span>{a.recoverEmail}</span>
                <input type="email" name="email" required autoComplete="email" />
              </label>
              {actionData && !actionData.ok && <p className="presale-form__error" role="alert">{message}</p>}
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>{a.sendLink}</button>
            </Form>
          )}
          <p className="caption auth-links">
            {a.noPassword} <Link to="/cuenta/acceso">{a.magicLinkCta}</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
