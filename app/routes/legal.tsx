import type { Route } from './+types/legal';
import { LegalPage } from '~/components/LegalPage';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Aviso legal — SAMORAI Wheels' },
    { name: 'description', content: 'Aviso legal de SAMORAI Wheels: datos del titular, condiciones de uso y propiedad intelectual.' },
    { name: 'robots', content: 'noindex' },
  ];
}

export default function Legal() {
  return (
    <LegalPage eyebrow="Información legal" title="Aviso legal" updated="pendiente">
      <h3>1 · Datos del titular</h3>
      <p>
        [Razón social / nombre del titular] · [NIF/CIF] · [Domicilio] ·
        [Email de contacto] · [Datos registrales si aplica].
      </p>

      <h3>2 · Objeto y condiciones de uso</h3>
      <p>
        Condiciones generales que regulan el acceso y uso del sitio web. Texto
        pendiente de redacción legal.
      </p>

      <h3>3 · Propiedad intelectual e industrial</h3>
      <p>
        Titularidad de la marca SAMORAI, logotipos, diseños, fotografías y demás
        contenidos del sitio. Texto pendiente de redacción legal.
      </p>

      <h3>4 · Responsabilidad</h3>
      <p>
        Limitación de responsabilidad sobre contenidos y enlaces. Texto pendiente
        de redacción legal.
      </p>

      <h3>5 · Legislación aplicable</h3>
      <p>
        Legislación española (LSSI-CE) y jurisdicción aplicable. Texto pendiente
        de redacción legal.
      </p>
    </LegalPage>
  );
}
