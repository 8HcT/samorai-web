import type { Route } from './+types/cookies';
import { LegalPage } from '~/components/LegalPage';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Política de cookies | SAMORAI' },
    { name: 'description', content: 'Política de cookies de SAMORAI Wheels: tipos de cookies utilizadas y su finalidad.' },
    { name: 'robots', content: 'noindex' },
  ];
}

export default function Cookies() {
  return (
    <LegalPage eyebrow="Cookies" title="Política de cookies" updated="pendiente">
      <h3>1 · ¿Qué son las cookies?</h3>
      <p>
        Explicación general del uso de cookies y tecnologías similares. Texto
        pendiente de redacción legal.
      </p>

      <h3>2 · Tipos de cookies utilizadas</h3>
      <p>
        Cookies técnicas, de preferencias, analíticas y, en su caso, de marketing.
        El detalle se vincula al gestor de consentimiento (Cookiebot o similar).
        Texto pendiente de redacción legal.
      </p>

      <h3>3 · Gestión del consentimiento</h3>
      <p>
        Cómo aceptar, rechazar o configurar las cookies desde el banner. Texto
        pendiente de redacción legal.
      </p>

      <h3>4 · Cómo desactivar las cookies</h3>
      <p>
        Instrucciones por navegador. Texto pendiente de redacción legal.
      </p>
    </LegalPage>
  );
}
