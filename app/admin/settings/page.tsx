export const dynamic = "force-dynamic"

import SettingsClient from "@/components/crm/settings/SettingsClient"
import { createClient } from "@/lib/supabase/server"
import {
  DEFAULT_MONTHLY_COMMISSION_GOAL,
  DEFAULT_AVG_COMMISSION_PER_LEASE,
} from "@/lib/demo/demoWorkspace"

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: { demo_mode?: boolean; monthly_commission_goal?: number; avg_commission_per_lease?: number } | null = null
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("demo_mode, monthly_commission_goal, avg_commission_per_lease")
      .eq("id", user.id)
      .single()
    profile = data
  }

  return (
    <SettingsClient
      demoMode={!!profile?.demo_mode}
      monthlyGoal={profile?.monthly_commission_goal ?? DEFAULT_MONTHLY_COMMISSION_GOAL}
      avgCommission={profile?.avg_commission_per_lease ?? DEFAULT_AVG_COMMISSION_PER_LEASE}
    />
  )
}
