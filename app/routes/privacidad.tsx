import type { Route } from './+types/privacidad';
import { seoMeta, seoStrings } from '~/lib/seo';
import { LegalPage } from '~/components/LegalPage';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).privacy;
  return seoMeta(args, { title: s.title, description: s.description, noindex: true });
}

export default function Privacidad() {
  return (
    <LegalPage eyebrow="Protección de datos" title="Política de privacidad" updated="pendiente">
      <h3>1 · Responsable del tratamiento</h3>
      <p>
        [Identidad del responsable] · [Datos de contacto] · [Delegado de
        protección de datos, si aplica]. Texto pendiente de redacción legal.
      </p>

      <h3>2 · Datos que recogemos</h3>
      <p>
        Datos facilitados a través del formulario de contacto (nombre, email,
        mensaje) y datos de navegación. Texto pendiente de redacción legal.
      </p>

      <h3>3 · Finalidad y base jurídica</h3>
      <p>
        Atender consultas, gestionar la relación comercial y, en su caso,
        comunicaciones. Texto pendiente de redacción legal.
      </p>

      <h3>4 · Conservación y cesión de datos</h3>
      <p>
        Plazos de conservación y destinatarios. Texto pendiente de redacción legal.
      </p>

      <h3>5 · Derechos de las personas usuarias</h3>
      <p>
        Acceso, rectificación, supresión, oposición, limitación y portabilidad.
        Texto pendiente de redacción legal.
      </p>
    </LegalPage>
  );
}
