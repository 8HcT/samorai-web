import type { AnalyticsEventName, AnalyticsEventPayloads } from '~/types/analytics';

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

/**
 * Fire a typed analytics event.
 *
 * Currently a no-op in production and a console logger in development.
 * Replace the body of this function to send events to Supabase, PostHog,
 * Plausible, or any other provider — without touching call sites.
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
  // Future: await supabase.from('events').insert({ event, payload, timestamp: new Date().toISOString() });
  // Future: posthog.capture(event, payload);
  // Future: plausible(event, { props: payload });
}
