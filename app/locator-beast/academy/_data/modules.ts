// Beast Academy — single source of truth for modules + lessons.
//
// Pure, serializable data (strings/numbers/booleans only — no React, no icons)
// so it can be swapped for a database later without touching the UI: replace
// the ACADEMY_MODULES constant + the helpers below with DB-backed equivalents
// that return the same shapes.

export type Lesson = {
  slug: string;
  title: string;
  description: string;
  durationMin: number; // placeholder estimate (3–5)
  comingSoon: boolean;
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
    description: "Set up your account and be ready to receive your first lead.",
    lessons: [
      {
        slug: "welcome-to-locator-beast",
        title: "Welcome to Locator Beast",
        description: "A quick tour of what Locator Beast does and how it fits into your locating business.",
        durationMin: 3,
        comingSoon: true,
      },
      {
        slug: "setting-up-your-profile",
        title: "Setting Up Your Profile",
        description: "Add your name, brokerage, and details so your guest cards and messages look professional.",
        durationMin: 4,
        comingSoon: true,
      },
      {
        slug: "connecting-your-business",
        title: "Connecting Your Business",
        description: "Connect the tools and accounts Locator Beast uses to run your workflow.",
        durationMin: 5,
        comingSoon: true,
      },
      {
        slug: "your-first-lead",
        title: "Your First Lead",
        description: "What happens when a lead comes in — and how to work it from the very first message.",
        durationMin: 4,
        comingSoon: true,
      },
    ],
  },
  {
    slug: "using-locator-beast",
    title: "Using Locator Beast",
    description: "Learn every core feature of the platform.",
    lessons: [
      {
        slug: "the-lead-board",
        title: "The Lead Board",
        description: "Move leads through your pipeline with a fast, visual board.",
        durationMin: 5,
        comingSoon: true,
      },
      {
        slug: "next-actions",
        title: "Next Actions",
        description: "Never lose a lead — let Locator Beast tell you exactly what to do next.",
        durationMin: 4,
        comingSoon: true,
      },
      {
        slug: "ai-client-insights",
        title: "AI Client Insights",
        description: "Understand each client's responsiveness and likelihood to close.",
        durationMin: 4,
        comingSoon: true,
      },
      {
        slug: "property-matching",
        title: "Property Matching",
        description: "Find and save the right communities for each client.",
        durationMin: 5,
        comingSoon: true,
      },
      {
        slug: "dashboard-and-reports",
        title: "Dashboard & Reports",
        description: "Track your pipeline, commissions, and goals at a glance.",
        durationMin: 3,
        comingSoon: true,
      },
    ],
  },
  {
    slug: "getting-leads",
    title: "Getting Leads",
    description: "Learn how to consistently generate apartment locating leads.",
    lessons: [
      {
        slug: "facebook-ads",
        title: "Facebook Ads",
        description: "Run ads that consistently bring in renters looking for an apartment.",
        durationMin: 5,
        comingSoon: true,
      },
      {
        slug: "instagram-and-tiktok",
        title: "Instagram & TikTok",
        description: "Turn short-form content into a steady stream of locating leads.",
        durationMin: 5,
        comingSoon: true,
      },
      {
        slug: "referral-partners",
        title: "Referral Partners",
        description: "Build partnerships that send you qualified clients on repeat.",
        durationMin: 4,
        comingSoon: true,
      },
      {
        slug: "building-your-brand",
        title: "Building Your Brand",
        description: "Become the locator renters know, trust, and refer.",
        durationMin: 4,
        comingSoon: true,
      },
    ],
  },
  {
    slug: "closing-more-leases",
    title: "Closing More Leases",
    description: "Improve your closing rate and earn more commissions.",
    lessons: [
      {
        slug: "qualifying-clients",
        title: "Qualifying Clients",
        description: "Spend your time on the clients most likely to lease.",
        durationMin: 3,
        comingSoon: true,
      },
      {
        slug: "building-the-perfect-list",
        title: "Building the Perfect List",
        description: "Assemble a tour list that gets clients excited to move.",
        durationMin: 5,
        comingSoon: true,
      },
      {
        slug: "setting-up-tours",
        title: "Setting Up Tours",
        description: "Book tours that convert interest into signed leases.",
        durationMin: 4,
        comingSoon: true,
      },
      {
        slug: "following-up",
        title: "Following Up",
        description: "Stay top-of-mind with follow-ups that feel helpful, not pushy.",
        durationMin: 4,
        comingSoon: true,
      },
      {
        slug: "closing-the-lease",
        title: "Closing the Lease",
        description: "Guide clients across the finish line and earn your commission.",
        durationMin: 5,
        comingSoon: true,
      },
    ],
  },
];

// ── Access helpers (swap these for DB queries later; keep the return shapes) ──

export function getModule(moduleSlug: string): Module | undefined {
  return ACADEMY_MODULES.find((m) => m.slug === moduleSlug);
}

export function getLesson(
  moduleSlug: string,
  lessonSlug: string
): { module: Module; lesson: Lesson } | undefined {
  const module = getModule(moduleSlug);
  const lesson = module?.lessons.find((l) => l.slug === lessonSlug);
  if (!module || !lesson) return undefined;
  return { module, lesson };
}

// Every (module, lesson) pair — used by generateStaticParams for the lesson route.
export function allLessonParams(): { module: string; lesson: string }[] {
  return ACADEMY_MODULES.flatMap((m) =>
    m.lessons.map((l) => ({ module: m.slug, lesson: l.slug }))
  );
}
