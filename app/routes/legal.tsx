import type { Route } from './+types/legal';
import { seoMeta, seoStrings } from '~/lib/seo';
import { LegalPage } from '~/components/LegalPage';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).legal;
  return seoMeta(args, { title: s.title, description: s.description, noindex: true });
}

export default function Legal() {
  return <LegalPage doc="notice" />;
}
