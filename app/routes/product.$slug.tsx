import { redirect } from 'react-router';
import type { Route } from './+types/product.$slug';

export function loader({ params }: Route.LoaderArgs) {
  return redirect(`/wheels/${params.slug}`, 301);
}

export default function ProductRedirect() {
  return null;
}
