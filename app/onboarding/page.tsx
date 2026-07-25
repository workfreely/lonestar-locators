import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "./_components/OnboardingWizard";
import type { OnboardingData } from "./_lib/types";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed) {
    redirect("/admin/leads");
  }

  const initialData: OnboardingData = {
    full_name: profile?.full_name ?? "",
    business_name: profile?.business_name ?? "",
    brokerage: profile?.brokerage ?? "",
    phone_number: profile?.phone_number ?? "",
    service_areas: profile?.service_areas ?? [],
    profile_photo_url: profile?.profile_photo_url ?? null,
    business_logo_url: profile?.business_logo_url ?? null,
    brand_color: profile?.brand_color ?? null,
    google_connected: profile?.google_connected ?? false,
    phone_sync_connected: profile?.phone_sync_connected ?? false,
    leads_import_status: profile?.leads_import_status ?? null,
  };

  return (
    <OnboardingWizard
      userId={user.id}
      initialStep={profile?.onboarding_step ?? 1}
      initialData={initialData}
    />
  );
}
