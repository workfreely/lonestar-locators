// /app/lib/analytics.ts

/**
 * Centralized analytics helper
 *
 * Safe by default:
 * - Does NOTHING in development
 * - Prevents crashes if GA / Meta / PostHog not loaded yet
 * - One place to wire all analytics later
 */

type AnalyticsPayload = Record<string, any>;

export function track(event: string, payload: AnalyticsPayload = {}) {
  // 🚧 Never track in development
  if (process.env.NODE_ENV !== "production") {
    console.log("[analytics skipped]", event, payload);
    return;
  }

  // ✅ GA4
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", event, payload);
  }

  // ✅ Meta Pixel
  if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("trackCustom", event, payload);
  }

  // ✅ PostHog
  if (typeof window !== "undefined" && (window as any).posthog) {
    (window as any).posthog.capture(event, payload);
  }
}
