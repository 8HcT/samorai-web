import type { Route } from './+types/privacidad';
import { LegalPage } from '~/components/LegalPage';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Política de privacidad — SAMORAI Wheels' },
    { name: 'description', content: 'Política de privacidad de SAMORAI Wheels: tratamiento de datos personales conforme al RGPD.' },
    { name: 'robots', content: 'noindex' },
  ];
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
