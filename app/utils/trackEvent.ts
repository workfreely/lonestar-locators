// /app/utils/trackEvent.ts

type EventPayload = Record<string, unknown>;

type GtagFunction = (
  command: "event",
  eventName: string,
  params?: EventPayload
) => void;

export const trackEvent = (
  event: string,
  data: EventPayload = {}
) => {
  if (typeof window === "undefined") return;

  const w = window as unknown as {
    gtag?: GtagFunction;
  };

  // Google Analytics (gtag)
  if (w.gtag) {
    w.gtag("event", event, data);
  }

  // Optional: future tools (PostHog, Meta, etc.)
  // console.log("Tracked:", event, data);
};
