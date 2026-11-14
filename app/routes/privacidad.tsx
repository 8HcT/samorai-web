import type { Route } from './+types/privacidad';
import { seoMeta, seoStrings } from '~/lib/seo';
import { LegalPage } from '~/components/LegalPage';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).privacy;
  return seoMeta(args, { title: s.title, description: s.description, noindex: true });
}

export default function Privacidad() {
  return <LegalPage doc="privacy" />;
}
