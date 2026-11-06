/**
 * Google Analytics 4 (gtag.js) + Google Tag Manager.
 *
 * Consent Mode v2: todo arranca en "denied" y solo pasa a "granted" cuando el
 * usuario acepta en el CookieBanner (o ya lo había aceptado en otra visita).
 * Sin consentimiento, GA solo envía pings anónimos sin cookies.
 */
export const GA_MEASUREMENT_ID = 'G-WYSKN889Q8';
export const GTM_CONTAINER_ID = 'GTM-NPFNDRSF';

/** Misma clave que usa el CookieBanner. */
export const CONSENT_STORAGE_KEY = 'samorai_cookie_consent';

/**
 * Script inline para el <head>. Debe ejecutarse ANTES de que carguen gtag.js
 * y gtm.js: fija el consentimiento por defecto, configura GA4 y arranca GTM.
 */
export const googleHeadScript = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
var c='denied';try{if(localStorage.getItem('${CONSENT_STORAGE_KEY}')==='accepted')c='granted';}catch(e){}
gtag('consent','default',{ad_storage:c,ad_user_data:c,ad_personalization:c,analytics_storage:c,wait_for_update:500});
gtag('js',new Date());
gtag('config','${GA_MEASUREMENT_ID}');
dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
`.trim();

type Gtag = (...args: unknown[]) => void;

function getGtag(): Gtag | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { gtag?: Gtag }).gtag;
}

/** Actualiza el consentimiento tras la decisión del usuario en el banner. */
export function updateAnalyticsConsent(granted: boolean): void {
  const v = granted ? 'granted' : 'denied';
  getGtag()?.('consent', 'update', {
    ad_storage: v,
    ad_user_data: v,
    ad_personalization: v,
    analytics_storage: v,
  });
}

/** Envía un evento a GA4 (y queda en dataLayer para GTM). */
export function sendGoogleEvent(name: string, params: Record<string, unknown>): void {
  getGtag()?.('event', name, params);
}
