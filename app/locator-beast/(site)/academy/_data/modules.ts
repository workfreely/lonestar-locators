// Beast Academy — single source of truth for modules + lessons.
//
// This is the PUBLIC marketing Academy page (no authenticated session here).
// Access TIERS are centralized on each module via `access`:
//   - "trial" → included during the free trial (Getting Started, Using Locator Beast)
//   - "paid"  → available only with an active paid membership (Growing Your
//               Business, Marketing)
// The marketing page renders these tiers statically (it has no authoritative
// subscription status — see AcademyModules.tsx). When the Academy is wired into
// the authenticated app, the same `access` field drives real per-user
// lock/unlock against getAccessState/getFeatureEntitlement. Pure serializable
// data so it can move to a database later without UI changes.

export type Access = "trial" | "paid";

export type Lesson = {
  slug: string;
  title: string;
  durationMin: number; // placeholder estimate shown on the card
};

export type Module = {
  slug: string;
  title: string;
  description: string;
  access: Access;
  lessons: Lesson[];
};

export const ACADEMY_MODULES: Module[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Learn how apartment locating works and set up Locator Beast for your first client.",
    access: "trial",
    lessons: [
      { slug: "welcome-to-beast-academy", title: "Start Here: Welcome to Beast Academy", durationMin: 3 },
      { slug: "how-apartment-locating-works", title: "How Apartment Locating Works", durationMin: 3 },
      { slug: "setting-up-your-profile", title: "Set Up Your Profile", durationMin: 4 },
      { slug: "connecting-your-business", title: "Connect Your Business", durationMin: 5 },
      { slug: "your-first-lead", title: "Add Your First Lead", durationMin: 4 },
    ],
  },
  {
    slug: "using-locator-beast",
    title: "Using Locator Beast",
    description: "Follow the complete workflow from capturing a lead to recommending the right properties.",
    access: "trial",
    lessons: [
      { slug: "smart-forms", title: "Capture Leads Automatically With Your Smart Form", durationMin: 4 },
      { slug: "lead-board", title: "Move Clients Through Your Lead Board", durationMin: 5 },
      { slug: "ai-client-insights", title: "Prioritize Leads With AI Client Insights", durationMin: 4 },
      { slug: "next-actions", title: "Never Lose a Lead With Next Actions", durationMin: 4 },
      { slug: "templates-and-automations", title: "Follow Up Faster With Templates & Automations", durationMin: 5 },
      { slug: "approval-intelligence", title: "Make Smarter Recommendations With Approval Intelligence", durationMin: 4 },
    ],
  },
  {
    slug: "growing-your-business",
    title: "Growing Your Business",
    description: "Build a repeatable process for managing clients, closing leases, and generating referrals.",
    access: "paid",
    lessons: [
      { slug: "managing-more-clients", title: "Manage More Clients Without Losing Track", durationMin: 4 },
      { slug: "following-up-consistently", title: "Build a Consistent Follow-Up System", durationMin: 4 },
      { slug: "tour-best-practices", title: "Turn Tours Into Applications", durationMin: 5 },
      { slug: "closing-more-leases", title: "Move Clients From Application to Closed", durationMin: 5 },
      { slug: "building-client-referrals", title: "Generate More Business Through Client Referrals", durationMin: 4 },
    ],
  },
  {
    slug: "marketing",
    title: "Marketing",
    description: "Learn how to generate leads, build your brand, and start more client conversations.",
    access: "paid",
    lessons: [
      { slug: "instagram", title: "Generate Leads With Instagram", durationMin: 4 },
      { slug: "facebook-ads", title: "Launch Your First Facebook Lead Campaign", durationMin: 5 },
      { slug: "tiktok", title: "Generate Leads With TikTok", durationMin: 4 },
      { slug: "google-business-profile", title: "Get Discovered With Your Google Business Profile", durationMin: 4 },
      { slug: "building-your-personal-brand", title: "Build a Personal Brand Clients Remember", durationMin: 5 },
      { slug: "converting-leads", title: "Turn New Leads Into Conversations", durationMin: 4 },
    ],
  },
];
