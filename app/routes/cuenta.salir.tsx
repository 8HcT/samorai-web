import type { Route } from './+types/cuenta.salir';
import { redirect } from 'react-router';
import { createAuthClient, isAuthConfigured } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';

/** Cierre de sesión (solo POST: un enlace no puede cerrar la sesión a nadie). */
export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (!isAuthConfigured()) throw redirect('/');
  const { supabase, headers } = createAuthClient(request);
  await supabase.auth.signOut();
  throw redirect('/', { headers });
}

export function loader() {
  throw redirect('/cuenta');
}
