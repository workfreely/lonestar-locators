import { SUPPORTED_MARKETS } from "@/lib/markets/catalog";
export const SITE_URL = "https://locatorbeast.com";
export const SITE_NAME = "Locator Beast";
export const SITE_TAGLINE = "The AI-powered CRM platform built for apartment locators.";
export const SITE_DESCRIPTION =
  "The operating system built exclusively for apartment locators. Replace Trello, Google Forms, spreadsheets, sticky notes, and disconnected tools with one desktop application.";

export const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Beast Academy", href: "/academy" },
  { label: "Live Demo", href: "/#live-demo" },
] as const;

export const TRIAL_URL = "/signup";
export const DEMO_URL = "#";
export const SUPPORT_EMAIL = "support@locatorbeast.com";
export const FAQ_URL = "/pricing#faq";

// Named by which background they're designed to sit on (per the provided
// brand assets: white wordmark for dark backgrounds, black wordmark for
// light backgrounds) — not by the logo's own color.
export const LOGO_FOR_DARK_BG = "/locator-beast/locator-beast-on-dark.png";
export const LOGO_FOR_LIGHT_BG = "/locator-beast/locator-beast-on-light.png";

// Footer SEO market list — DERIVED from the canonical catalog
// (lib/markets/catalog.ts) rather than hand-maintained, so the marketing site
// can never advertise a market the product doesn't actually offer. This list
// previously said "Dallas–Fort Worth" and "Miami–Fort Lauderdale" long after
// those were split into separate selectable markets.
// No dedicated per-market pages exist yet, so these render as plain text.
const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  GA: "Georgia",
  AZ: "Arizona",
  FL: "Florida",
  IL: "Illinois",
  CO: "Colorado",
  TN: "Tennessee",
};

export const MARKETS: { state: string; cities: string[] }[] = SUPPORTED_MARKETS.reduce(
  (groups, market) => {
    // The catalog's order is authoritative and already grouped by state; an
    // unmapped state falls back to its code rather than disappearing.
    const state = STATE_NAMES[market.state] ?? market.state;
    const existing = groups.find((g) => g.state === state);
    if (existing) existing.cities.push(market.name);
    else groups.push({ state, cities: [market.name] });
    return groups;
  },
  [] as { state: string; cities: string[] }[]
);
