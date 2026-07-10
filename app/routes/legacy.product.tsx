import { redirect } from 'react-router';
import type { Route } from './+types/legacy.product';

export function loader({ params }: Route.LoaderArgs) {
  return redirect(`/the-wheels/${params.slug}`, 301);
}

export default function ProductLegacyRedirect() {
  return null;
}
