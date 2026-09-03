// Help Center categories. The full set is defined so the directory never has to
// be redesigned as more categories go live; a category only becomes browsable
// once it actually has live (published + verified) articles. Categories without
// live content render as "Coming soon" and never show an empty article list.

export type HelpCategory = {
  slug: string
  title: string
  description: string
  order: number
}

export const CATEGORIES: HelpCategory[] = [
  { slug: "getting-started", title: "Getting Started", description: "Set up your account and learn your way around Locator Beast.", order: 1 },
  { slug: "leads", title: "Leads & Client Management", description: "Add, edit, and organize your clients.", order: 2 },
  { slug: "agenda", title: "Agenda & Follow-Up", description: "See who needs your attention today and stay on top of follow-ups.", order: 3 },
  { slug: "smart-lead-form", title: "Smart Lead Form", description: "Create and share the form that collects what you need from new clients.", order: 4 },
  { slug: "property-search", title: "Property Search & Recommendations", description: "Find and recommend the right properties.", order: 5 },
  { slug: "map-unleash", title: "Map & Unleash Beast", description: "Surface property matches for your client on the map.", order: 6 },
  { slug: "messages", title: "Messages & Templates", description: "Send the right message at the right moment.", order: 7 },
  { slug: "analytics", title: "Sales Analytics & Commissions", description: "Track your progress toward your commission goal.", order: 8 },
  { slug: "integrations", title: "Integrations", description: "Beast Companion, Beast Sync, and connected tools.", order: 9 },
  { slug: "playbook", title: "Apartment-Locating Playbook", description: "Guidance for common client and application situations.", order: 10 },
  { slug: "troubleshooting", title: "Troubleshooting", description: "Quick fixes for common issues.", order: 11 },
  { slug: "videos", title: "Video Tutorials", description: "Watch step-by-step Beast Academy lessons.", order: 12 },
]

export function getCategory(slug: string): HelpCategory | undefined {
  return CATEGORIES.find((c) => c.slug === slug)
}
