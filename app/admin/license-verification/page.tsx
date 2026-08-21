export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import AppHeader from "@/components/crm/AppHeader"
import BackToDashboard from "@/components/crm/BackToDashboard"
import LicensePanel, { OfficialLookups } from "./_components/LicensePanel"
import type { LicenseRow } from "./_components/types"

// License Verification — platform owner only.
//
// Universal: it lists every Locator Beast user from `profiles`, so a regular trial or
// paid agent who never joined the referral network is reviewable here. Beast Referral
// Network keeps its own referral-specific controls and is untouched; nothing on this
// page reads or writes network membership, so a normal user can never be pulled into a
// referral tier by being verified.
//
// Access is enforced three times over, and the redirect below is the weakest of them:
// the menu entry is owner-gated, this page redirects, and lb_list_licenses /
// lb_verify_license / lb_unverify_license each raise not_authorized internally. A user
// who reaches the URL or calls the RPC directly gets nothing either way.
export default async function LicenseVerificationPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: isAdmin } = await supabase.rpc("is_platform_admin")
  if (!isAdmin) redirect("/admin/leads")

  const { data } = await supabase.rpc("lb_list_licenses")
  // Already ordered by the RPC: unverified first, then newest signup.
  const rows = (data ?? []) as LicenseRow[]

  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">
      <AppHeader variant="dark" fullBleed>
        <BackToDashboard />
      </AppHeader>

      <div className="beast-ai-clearance flex-1 overflow-y-auto p-5">
        {/* Wider than the Network page's max-w-2xl: each row carries a badge, a
            state lookup link and an action, and at 2xl the metadata line truncated
            mid-date. Widening the column is a page concern — MemberCard is shared
            with Network and stays untouched. */}
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <div>
            {/* text-left overrides the legacy global `h1 { text-align: center }` in
                globals.css, which is a marketing-page rule this admin surface inherits. */}
            <h1 className="text-left text-[19px] font-semibold text-[var(--crm-text-primary)]">License Verification</h1>
            <p className="mt-0.5 text-[13px] text-[var(--crm-text-muted)]">Review and verify agent licenses.</p>
          </div>

          <OfficialLookups />

          <LicensePanel rows={rows} />
        </div>
      </div>
    </div>
  )
}
