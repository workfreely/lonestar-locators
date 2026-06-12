export interface ContactNotesInput {
  // CRM state (optional — included at top when present)
  crm_status?: string | null
  next_follow_up?: string | null
  follow_up_count?: number | null

  // Lead info
  source?: string | null
  moveDate?: string | null
  desiredRent?: string | null

  // Location
  neighborhoods?: string | null
  submarkets?: string | null

  // Property
  propertyType?: string | null
  beds?: string | null
  baths?: string | null

  // Credit
  creditScore?: string | null
  creditHistory?: string | null

  // Background
  brokenLeaseAge?: string | null
  brokenLeaseAmount?: string | null
  evictionAge?: string | null
  evictionBalance?: string | null
  evictionCourt?: string | null
  criminalBackground?: string | null
  criminalCharge?: string | null

  // Client notes
  notes?: string | null
}

export function buildContactNotes(input: ContactNotesInput): string {
  const lines: string[] = []

  // ── CRM State (top section, only when values exist) ──────────────────────
  if (input.crm_status || input.next_follow_up || input.follow_up_count != null) {
    lines.push("CRM:")
    if (input.crm_status) {
      lines.push(`Stage: ${input.crm_status}`)
    }
    if (input.next_follow_up) {
      lines.push(`Next Follow-Up: ${input.next_follow_up}`)
    }
    if (input.follow_up_count != null) {
      lines.push(`Follow-Up Count: ${input.follow_up_count}`)
    }
    lines.push("")
  }

  // ── Lead Info ─────────────────────────────────────────────────────────────
  lines.push(`Source: ${input.source || "Website"}`)
  lines.push("")
  lines.push(`Move Date: ${input.moveDate || "N/A"}`)
  lines.push(`Budget: ${input.desiredRent || "N/A"}`)
  lines.push("")

  // ── Location ──────────────────────────────────────────────────────────────
  lines.push("Location:")
  lines.push(`Neighborhoods: ${input.neighborhoods || "N/A"}`)
  lines.push(`Submarkets: ${input.submarkets || "N/A"}`)
  lines.push("")

  // ── Property ──────────────────────────────────────────────────────────────
  lines.push("Property:")
  lines.push(`Type: ${input.propertyType || "N/A"}`)
  lines.push(`Beds/Baths: ${input.beds || "N/A"} / ${input.baths || "N/A"}`)
  lines.push("")

  // ── Credit ────────────────────────────────────────────────────────────────
  lines.push("Credit:")
  lines.push(`Score: ${input.creditScore || "N/A"}`)
  lines.push(`History: ${input.creditHistory || "N/A"}`)
  lines.push("")

  // ── Background ────────────────────────────────────────────────────────────
  lines.push("Background:")

  const brokenLease = input.brokenLeaseAge
    ? `${input.brokenLeaseAge} (${input.brokenLeaseAmount || "No balance"})`
    : "None"
  lines.push(`Broken Lease: ${brokenLease}`)
  lines.push("")

  const eviction = input.evictionAge
    ? `${input.evictionAge} (${input.evictionBalance || "No balance"})`
    : (input.evictionCourt ?? "None")
  lines.push(`Eviction: ${eviction}`)
  lines.push("")

  lines.push(`Criminal: ${input.criminalBackground || "None"}`)
  if (input.criminalCharge) {
    lines.push(`Charge: ${input.criminalCharge}`)
  }
  lines.push("")

  // ── Client Notes ──────────────────────────────────────────────────────────
  lines.push("Client Notes:")
  lines.push(input.notes || "None")

  return lines.join("\n").trim()
}
