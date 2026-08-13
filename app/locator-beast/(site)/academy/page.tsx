import type { Metadata } from "next";
import PageHero from "@/app/locator-beast/(site)/_components/PageHero";
import AcademyModules, { type AcademyAccess } from "@/app/locator-beast/(site)/academy/_components/AcademyModules";
import { createClient } from "@/lib/supabase/server";
import { getAccessState } from "@/lib/billing/access";
import { getOrganizationStatus } from "@/lib/billing/organization";

export const metadata: Metadata = {
  title: "Beast Academy",
  description: "Learn how to build and grow a successful apartment locating business.",
  alternates: { canonical: "https://locatorbeast.com/academy" },
};

// The lock/play state reflects the visitor's REAL entitlement, resolved
// server-side so it is authoritative — a client cannot forge it, and there is no
// lesson-content route to reach directly (lessons are non-navigating cards).
// Reuses the shared getAccessState() (subscription_status + trial_ends_at):
//   logged-out / expired / canceled / past_due → "none"  (everything locked)
//   active trial (trialing)                     → "trial" (trial-tier unlocked)
//   active subscription                         → "paid"  (everything unlocked)
export const dynamic = "force-dynamic";

async function resolveAcademyAccess(): Promise<AcademyAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "none";
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return "none";
  const organizationStatus = await getOrganizationStatus(supabase, user.id);
  const state = getAccessState({ ...profile, organization_status: organizationStatus });
  // Complimentary (organization) and paid subscribers both get full unlock.
  if (state.allowed) {
    return state.reason === "subscribed" || state.reason === "organization" ? "paid" : "trial";
  }
  return "none";
}

export default async function BeastAcademyPage() {
  const access = await resolveAcademyAccess();
  return (
    <>
      <PageHero
        title="Beast Academy"
        subtitle="Learn how to build and grow a successful apartment locating business."
      />
      <AcademyModules access={access} />
    </>
  );
}
