// ── The ONE public feature list ──────────────────────────────────────────────
//
// Homepage cards (FeatureGrid), the /features detail sections, and the
// "everything included" checklist all read from this array, in this order. They
// previously kept THREE separate copies and had already drifted: the homepage
// said "Phone Sync" / "Smart Lead Pages" / "Performance Dashboard" while
// /features said "Phone Sync" / "Smart Form Pages" / "Analytics Dashboard", and
// each carried different wording for the same feature. One list means a rename
// lands everywhere or nowhere.
//
// `title` + `body` are the public name and one-liner (shown on both surfaces).
// `bullets` are the supporting points the /features detail sections render.
// Icons stay in FeatureGrid, keyed by title, so the icon system is untouched.

export type Feature = {
  title: string;
  body: string;
  bullets: string[];
};

export const FEATURES: Feature[] = [
  {
    title: "Workflow Engine",
    body: "The heart of Locator Beast — the next step, every time.",
    bullets: ["AI-powered workflow", "Follow-up reminders", "Next Action system", "Never miss another lead"],
  },
  {
    title: "AI-powered CRM",
    body: "Every client and every conversation, organized automatically.",
    bullets: ["Lead panel", "Timeline", "Notes", "Tags", "Status tracking", "Duplicate detection"],
  },
  {
    title: "Beast Sync",
    body: "Use your existing number. Every call and text stays tracked.",
    bullets: ["Sync conversations", "Faster texting", "Message summaries", "Everything stays organized"],
  },
  {
    title: "Smart Lead Forms",
    body: "Capture leads the moment they come in, no manual entry.",
    bullets: ["Custom branding", "Built-in lead forms", "Conditional logic", "Automatic CRM integration"],
  },
  {
    title: "AI Client Insights",
    body: "Know who's ready to close and who needs a nudge.",
    bullets: ["AI summaries", "Conversation history", "Recommendations"],
  },
  {
    title: "Google Contacts",
    body: "New clients are added to your contacts automatically.",
    bullets: ["New leads added automatically", "Contact details kept in sync", "Less manual data entry"],
  },
  {
    title: "Google Calendar",
    body: "Tours and follow-ups sync straight to your calendar.",
    bullets: ["Tours added to your calendar", "Follow-ups stay on schedule", "Keep your day organized"],
  },
  {
    title: "Analytics Dashboard",
    body: "Track closings, commissions, and progress toward your goals.",
    bullets: ["Closings", "Commissions", "Conversion rates", "Sales goals", "Sales Performance"],
  },
  {
    title: "Agenda",
    body: "Your day, laid out — no more digging through notes.",
    bullets: ["Today's next actions", "Follow-ups due", "Scheduled tours"],
  },
  {
    title: "Templates",
    body: "Reusable messages that keep every follow-up consistent.",
    bullets: ["Text templates", "Email templates", "AI responses", "Consistent follow-ups"],
  },
  {
    title: "Meta + Instagram Ads",
    body: "See which ads are actually driving leads.",
    bullets: [
      "Track which ads generate leads",
      "See your best-performing campaigns",
      "Understand where your leads come from",
    ],
  },
];

/** Names only — the "everything included" checklist. Derived so it can't drift. */
export const FEATURE_NAMES: string[] = FEATURES.map((f) => f.title);

export const COMING_SOON_FEATURES = [
  { title: "Call Recording", body: "Every conversation captured, automatically." },
  { title: "AI Call Summaries", body: "Know what was said without replaying the call." },
  { title: "Voicemail Drops", body: "Leave a follow-up voicemail without dialing." },
  { title: "Smart Apartment Data Integration", body: "Live property data, connected directly." },
  { title: "Additional AI Features", body: "Every future AI feature, included automatically." },
] as const;
