// Shared with app/admin/leads/page.tsx's dedupeLeads() — kept as a
// separate copy here rather than importing from that file, so the
// existing Dashboard page stays completely untouched. Both copies must
// stay identical; this is the version the Performance page uses so its
// "Leads" metrics count unique people, not raw form submissions.
//
// Distinct from a future "Form Submissions" metric, which would use the
// full, undeduped leads array on purpose.

export function dedupeLeads(leads: any[]) {
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
