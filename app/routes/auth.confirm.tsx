import type { Route } from './+types/auth.confirm';
import type { EmailOtpType } from '@supabase/supabase-js';
import { Link, redirect } from 'react-router';
import { createAuthClient, isAuthConfigured } from '~/lib/auth/session.server';
import { claimGuestRecords, markEmailVerified } from '~/lib/presale/account.server';
import { safeNextPath } from '~/lib/security.server';
import { accountHomePath } from '~/lib/presale/config.server';
import { t as translations } from '~/i18n/config';
import { useT } from '~/i18n/useT';
import { rootSeoData } from '~/lib/seo';

export function meta(args: Route.MetaArgs) {
  return [{ title: translations(rootSeoData(args).locale).account.titles.access }, { name: 'robots', content: 'noindex' }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
}

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'recovery', 'invite', 'email_change'];

/**
 * Destino de TODOS los enlaces de Supabase Auth (alta, enlace mágico,
 * recuperación, cambio de email). Admite el formato recomendado para SSR
 * (`token_hash` + `type`, funciona en cualquier dispositivo) y el de PKCE
 * (`code`, mismo navegador). Abrir el enlace demuestra que el email es del
 * usuario: se marca como verificado y se vinculan sus compras de invitado.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (!isAuthConfigured()) return { error: 'not_configured' };
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'), accountHomePath());
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');

  const { supabase, headers } = createAuthClient(request);
  let ok = false;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
    if (error) console.error('[auth] verifyOtp', error.status, error.message);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) console.error('[auth] exchangeCodeForSession', error.status, error.message);
  }

  if (!ok) return { error: 'invalid_link' };

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    try {
      await markEmailVerified(data.user);
      await claimGuestRecords(data.user);
    } catch (err) {
      console.error('[auth] vinculación tras confirmar', err);
    }
  }
  throw redirect(type === 'recovery' ? '/cuenta/contrasena' : next, { headers });
}

export default function AuthConfirm({ loaderData }: Route.ComponentProps) {
  const a = useT().account;
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <h1>{a.invalidLinkTitle}</h1>
        <p>{loaderData.error === 'not_configured' ? a.notAvailableYet : a.invalidLinkBody}</p>
        <Link to="/cuenta/acceso" className="btn btn-primary">{a.newLink}</Link>
      </div>
    </div>
  );
}
