// Beast Academy — single source of truth for modules + lessons.
//
// Academy is positioned as premium, members-only content included with a
// Locator Beast membership. Every lesson is locked; clicking one opens a
// "start your free trial" modal (see _components/AcademyModules.tsx) rather than
// navigating anywhere. Pure serializable data so it can move to a database
// later without UI changes.

export type Lesson = {
  slug: string;
  title: string;
  durationMin: number; // placeholder estimate shown on the locked card
};

export type Module = {
  slug: string;
  title: string;
  description: string;
  lessons: Lesson[];
};

export const ACADEMY_MODULES: Module[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "For new locators and first-time setup.",
    lessons: [
      { slug: "welcome-to-beast-academy", title: "Welcome to Beast Academy", durationMin: 3 },
      { slug: "setting-up-your-profile", title: "Setting Up Your Profile", durationMin: 4 },
      { slug: "connecting-your-business", title: "Connecting Your Business", durationMin: 5 },
      { slug: "your-first-lead", title: "Your First Lead", durationMin: 4 },
    ],
  },
  {
    slug: "using-locator-beast",
    title: "Using Locator Beast",
    description: "How to use the platform effectively.",
    lessons: [
      { slug: "lead-board", title: "Lead Board", durationMin: 5 },
      { slug: "next-actions", title: "Next Actions", durationMin: 4 },
      { slug: "ai-client-insights", title: "AI Client Insights", durationMin: 4 },
      { slug: "approval-intelligence", title: "Approval Intelligence", durationMin: 4 },
      { slug: "smart-forms", title: "Smart Forms", durationMin: 4 },
      { slug: "templates-and-automations", title: "Templates & Automations", durationMin: 5 },
    ],
  },
  {
    slug: "growing-your-business",
    title: "Growing Your Business",
    description: "Focus on becoming a better apartment locator.",
    lessons: [
      { slug: "managing-more-clients", title: "Managing More Clients", durationMin: 4 },
      { slug: "following-up-consistently", title: "Following Up Consistently", durationMin: 4 },
      { slug: "tour-best-practices", title: "Tour Best Practices", durationMin: 5 },
      { slug: "closing-more-leases", title: "Closing More Leases", durationMin: 5 },
      { slug: "building-client-referrals", title: "Building Client Referrals", durationMin: 4 },
    ],
  },
  {
    slug: "marketing",
    title: "Marketing",
    description: "Teach locators how to generate business.",
    lessons: [
      { slug: "instagram", title: "Instagram", durationMin: 4 },
      { slug: "facebook-ads", title: "Facebook Ads", durationMin: 5 },
      { slug: "tiktok", title: "TikTok", durationMin: 4 },
      { slug: "google-business-profile", title: "Google Business Profile", durationMin: 4 },
      { slug: "building-your-personal-brand", title: "Building Your Personal Brand", durationMin: 5 },
      { slug: "converting-leads", title: "Converting Leads", durationMin: 4 },
    ],
  },
];
