export const trackEvent = (
  event: string,
  data: Record<string, any> = {}
) => {
  if (typeof window === "undefined") return;

  // Google Analytics (gtag)
  if ((window as any).gtag) {
    (window as any).gtag("event", event, data);
  }

  // Optional: future tools (PostHog, Meta, etc.)
  // console.log("Tracked:", event, data);
};
