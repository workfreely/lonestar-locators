export const SITE_URL = "https://locatorbeast.com";
export const SITE_NAME = "Locator Beast";
export const SITE_TAGLINE = "The Operating System for Apartment Locators";
export const SITE_DESCRIPTION =
  "The operating system built exclusively for apartment locators. Replace Trello, Google Forms, spreadsheets, sticky notes, and disconnected tools with one desktop application.";

export const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
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

// Footer SEO market list — only cities explicitly provided are listed here.
// No dedicated per-market pages exist yet, so these render as plain text.
export const MARKETS: { state: string; cities: string[] }[] = [
  {
    state: "Texas",
    cities: ["Abilene", "Amarillo", "Austin", "Corpus Christi", "Dallas–Fort Worth", "Houston", "San Antonio"],
  },
  { state: "Georgia", cities: ["Atlanta", "Savannah", "Augusta"] },
  { state: "Arizona", cities: ["Phoenix", "Tucson", "Flagstaff"] },
  { state: "Florida", cities: ["Miami–Fort Lauderdale", "Orlando"] },
  { state: "Illinois", cities: ["Chicago"] },
  { state: "Colorado", cities: ["Denver"] },
  { state: "Tennessee", cities: ["Nashville"] },
];
