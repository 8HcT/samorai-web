import type { AnalyticsEventName, AnalyticsEventPayloads } from '~/types/analytics';
import { sendGoogleEvent } from './google';

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

/**
 * Fire a typed analytics event.
 *
 * Sends the event to Google Analytics 4 (gtag, respects consent mode) and
 * logs it to the console in development.
 *
 * Privacy: never call this with PII. All payloads must be consent-safe.
 */
export function trackEvent<T extends AnalyticsEventName>(
  event: T,
  payload: AnalyticsEventPayloads[T]
): void {
  if (isDev) {
    console.debug('[analytics]', event, payload);
  }
  sendGoogleEvent(event, payload as Record<string, unknown>);
  // Future: await supabase.from('events').insert({ event, payload, timestamp: new Date().toISOString() });
  // Future: posthog.capture(event, payload);
  // Future: plausible(event, { props: payload });
}
