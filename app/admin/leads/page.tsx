
import DashboardClient from "@/components/crm/DashboardClient"
import { supabaseAdmin } from "@/lib/supabase/admin"

function dedupeLeads(leads: any[]) {
  const seen = new Set()

  return leads.filter((lead) => {
    const key =
      lead.phone ||
      lead.email ||
      `${lead.first_name}-${lead.last_name}-${lead.move_date}`

    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

async function getLeads() {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("Error fetching leads:", error.message)
    return []
  }

  return dedupeLeads(data || [])
}

export default async function Page() {
  const leads = await getLeads()

  return <DashboardClient leads={leads} />
}