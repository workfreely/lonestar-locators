export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import NetworkClient from "./_components/NetworkClient"
import type { DownlineMember, AdminMember } from "./_components/types"

// Beast Network — authenticated member page (inside the CRM shell). Members see
// their profile/status, Copy My Join Link, their brokerage referral URL setting,
// and their Direct / Tier 2 / Tier 3 downline. The platform owner additionally
// sees a clearly-separated Admin / Pending Members section. Regular network
// members NEVER see the admin section; non-members are redirected away entirely.
export default async function NetworkPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [overviewRes, adminRes, downlineRes, profileRes] = await Promise.all([
    supabase.rpc("lb_my_network_overview"),
    supabase.rpc("is_platform_admin"),
    supabase.rpc("lb_network_downline", { p_max_depth: 3 }),
    supabase
      .from("profiles")
      .select("preferred_name, first_name, last_name, profile_photo_url, brokerage")
      .eq("id", user.id)
      .maybeSingle(),
  ])

  const overview = (Array.isArray(overviewRes.data) ? overviewRes.data[0] : overviewRes.data) as
    | { status: string | null; slug: string | null; brokerage_referral_url: string | null }
    | undefined
  const isAdmin = Boolean(adminRes.data)
  const status = overview?.status ?? null

  // Non-members who aren't the platform owner never see Beast Network.
  if (!status && !isAdmin) redirect("/admin/leads")

  const downline = (downlineRes.data ?? []) as DownlineMember[]

  let members: AdminMember[] = []
  if (isAdmin) {
    const { data } = await supabase.rpc("lb_list_network_members", { p_status: null })
    members = (data ?? []) as AdminMember[]
  }

  const profile = profileRes.data
  const myName =
    profile?.preferred_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    "You"

  return (
    <NetworkClient
      isAdmin={isAdmin}
      myName={myName}
      myPhotoUrl={profile?.profile_photo_url ?? null}
      brokerageName={profile?.brokerage ?? null}
      status={status}
      slug={overview?.slug ?? null}
      referralUrl={overview?.brokerage_referral_url ?? null}
      downline={downline}
      members={members}
    />
  )
}
