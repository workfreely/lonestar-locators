// /app/lib/analytics.ts

/**
 * Centralized analytics helper
 *
 * Safe by default:
 * - Does NOTHING in development
 * - Prevents crashes if GA / Meta / PostHog not loaded yet
 * - One place to wire all analytics later
 */

type AnalyticsPayload = Record<string, unknown>;

type GtagFunction = (
  command: "event",
  eventName: string,
  params?: AnalyticsPayload
) => void;

type FbqFunction = (
  command: string,
  eventName: string,
  params?: AnalyticsPayload
) => void;

type Posthog = {
  capture: (eventName: string, properties?: AnalyticsPayload) => void;
};

export function track(event: string, payload: AnalyticsPayload = {}) {
  // 🚧 Never track in development
  if (process.env.NODE_ENV !== "production") {
    console.log("[analytics skipped]", event, payload);
    return;
  }

  if (typeof window === "undefined") return;

  const w = window as unknown as {
    gtag?: GtagFunction;
    fbq?: FbqFunction;
    posthog?: Posthog;
  };

  // ✅ GA4
  if (w.gtag) {
    w.gtag("event", event, payload);
  }

  // ✅ Meta Pixel
  if (w.fbq) {
    w.fbq("trackCustom", event, payload);
  }

  // ✅ PostHog
  if (w.posthog) {
    w.posthog.capture(event, payload);
  }
}
