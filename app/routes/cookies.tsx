import type { Route } from './+types/cookies';
import { seoMeta, seoStrings } from '~/lib/seo';
import { LegalPage } from '~/components/LegalPage';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).cookies;
  return seoMeta(args, { title: s.title, description: s.description, noindex: true });
}

export default function Cookies() {
  return <LegalPage doc="cookies" />;
}
