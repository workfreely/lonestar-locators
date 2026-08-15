import type { LeadSummaryDTO, NextActionDTO, FavoriteDTO } from "@bc/companion-shared"
import { isLeadStage } from "@bc/companion-shared"
import { getNextAction } from "@/lib/nextAction"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
import { getArchiveReasonLabel } from "@/lib/leads/archiveReasons"

// Phase 2 — active-client bridge payload (CRM page → content script → panel).
//
// Kept separate from the strict, leadId-only `activeClientMsg` contract because,
// until the Chrome extension has its own auth token, the CRM (already
// authenticated via the web session) supplies the READ-ONLY display data
// directly through the local bridge. When token auth lands, the panel can switch
// to refetching by leadId and this payload shape stays the same on the panel side.
export const COMPANION_MSG_SOURCE = "lb-companion"

export type CompanionActiveClientPayload = {
  lead: LeadSummaryDTO
  nextActions: NextActionDTO[]
  /** THIS client's saved Favorite Properties — the ONLY properties a tour can be
   *  scheduled against (Schedule Tour requires one). Same lead_favorites records
   *  the CRM shows; never a separate copy. */
  favorites?: FavoriteDTO[]
  agentName?: string | null
  /** The locator's saved IANA timezone — the Companion formats Due / Completed /
   *  workflow times in THIS zone (via formatDueDateTime's timeZone), so display
   *  matches the CRM regardless of the device's zone. */
  timeZone?: string | null
}

// The lead's most recent NON-successful outreach (a No-Answer call or a sent
// text) from lead_timeline — the discriminator that turns an otherwise-identical
// New-lead Follow Up into "Called — No Answer" / Status "No Answer" vs "Sent
// Text" / Status "Waiting for Reply". Null when the lead has had no such outreach.
export type LatestOutreach = {
  type: "contact_attempt" | "text_sent" | string
  method: "call" | "text" | "email" | string | null
  occurredAt: string
} | null

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}
// Budget display — mirrors the CRM Lead Panel's `formatRent` so Companion shows
// budgets identically ("2500-2700" / "$2,500-$2,700" → "$2,500 – $2,700").
function budgetText(desiredRent: unknown): string | null {
  const s = str(desiredRent)
  if (!s) return null
  const groups = s.match(/\d[\d,]*/g)
  if (!groups || groups.length === 0) return s
  const formatted = groups
    .map((v) => {
      const n = Number(v.replace(/,/g, ""))
      return Number.isNaN(n) ? null : `$${n.toLocaleString()}`
    })
    .filter(Boolean) as string[]
  if (formatted.length >= 2) return `${formatted[0]} – ${formatted[1]}`
  return formatted[0] ?? s
}
function priority(p: unknown): "low" | "medium" | "high" {
  return p === "low" || p === "high" ? p : "medium"
}

// The most recent NON-successful outreach on a still-New lead, expressed as its
// Last Action title. Returns null unless the lead is New and has such an event —
// a genuine first contact (first_text_sent_at) or any later stage supersedes it.
function outreachLastActionTitle(lead: any, latestOutreach: LatestOutreach): string | null {
  if (!latestOutreach) return null
  if (String(lead.crm_status ?? "new") !== "new") return null
  if (str(lead.first_text_sent_at)) return null // already successfully contacted
  return latestOutreach.type === "text_sent" ? "Sent Text" : "Called — No Answer"
}

// Last Action = the most recent thing the locator DID on this lead. Mirrors the
// CRM Lead Panel's derivation (components/crm/LeadPanel.tsx): first contact is
// signaled by the persisted first_text_sent_at (there is no completed "Contact
// Lead" row — the timestamp IS the completion), and any genuinely completed
// lead_next_actions row competes on its completed_at. The most recent wins.
//
// A still-New lead's pending outreach ALSO competes here now: a No-Answer call
// ("Called — No Answer") or a sent text ("Sent Text"), timestamped by the
// lead_timeline event. It is NOT a completion (the lead stays New, nothing
// advances) but it IS the last thing done, so it surfaces as the Last Action.
// Brand-new lead with no outreach → null (the panel hides Last Action).
function deriveLastAction(
  lead: any,
  nextActions: any[] = [],
  latestOutreach: LatestOutreach = null,
): { title: string; completedAt: string | null } | null {
  const candidates: { title: string; completedAt: string }[] = []

  const firstContact = str(lead.first_text_sent_at)
  if (firstContact) candidates.push({ title: "Contact Lead", completedAt: firstContact })

  const outreachTitle = outreachLastActionTitle(lead, latestOutreach)
  if (outreachTitle && latestOutreach) candidates.push({ title: outreachTitle, completedAt: latestOutreach.occurredAt })

  for (const a of nextActions || []) {
    if (String(a.lead_id) !== String(lead.id)) continue
    const done = a.completed === true || a.status === "completed"
    const at = str(a.completed_at)
    const title = str(a.title)
    if (done && at && title) candidates.push({ title, completedAt: at })
  }

  // Lowest-priority fallback: the lead's own creation. Any real activity above
  // ALWAYS takes precedence (this is only reached when there is none), so a lead
  // is never blank. This is the actual created_at event — NOT a stage-derived or
  // invented action. If created_at is somehow absent, stay null (can't invent).
  if (candidates.length === 0) {
    const createdAt = str(lead.created_at)
    return createdAt ? { title: "Lead Created", completedAt: createdAt } : null
  }
  candidates.sort((x, y) => (x.completedAt < y.completedAt ? 1 : x.completedAt > y.completedAt ? -1 : 0))
  return candidates[0]
}

// Build the read-only DTO the Companion renders, from a CRM `leads` row + its
// open `lead_next_actions` rows. Mirrors the Lead Panel's own field derivations
// (identity, Search Criteria, Credit Screening, Client Notes, workflow). NO
// writes, NO workflow mutation — display only.
export function buildActiveClientPayload(
  lead: any,
  nextActions: any[] = [],
  agentName?: string | null,
  latestOutreach: LatestOutreach = null,
  timeZone?: string | null,
  // THIS lead's saved Favorite Properties (lead_favorites rows). Mapped to the
  // read-only FavoriteDTO the Schedule Tour dropdown renders.
  favorites: any[] = [],
): CompanionActiveClientPayload {
  const crmStatus = str(lead.crm_status) ?? "new"
  const historyLower = String(lead.credit_history || "").toLowerCase()

  // Resting Status for a still-New lead's pending-outreach Follow Up (Overdue,
  // decided in the panel from dueAt, still wins). "No Answer" for a No-Answer
  // call; "Waiting for Reply" for a sent text. Null → the action stays Pending.
  const pendingFollowUpStatus: string | null =
    crmStatus === "new" && latestOutreach && !str(lead.first_text_sent_at)
      ? latestOutreach.type === "text_sent"
        ? "Waiting for Reply"
        : "No Answer"
      : null

  // List Sent follow-up "Waiting for Reply" — reuses the SAME text_sent →
  // latestOutreach mechanism as the New-lead flow. Once the locator has SENT the
  // current sequence's latest follow-up, the newly-open successor shows "Waiting
  // for Reply" until its own due time passes (the panel's Overdue precedence then
  // wins). Anchored on a text_sent outreach at-or-after the most recently COMPLETED
  // follow-up, so a fresh FU1 (nothing sent yet) and any stale New-lead text never
  // trigger it. Never stored — derived only. Pending/Overdue logic is untouched.
  const FOLLOW_UP_KEYS = new Set(["follow_up_1", "follow_up_2", "follow_up_3", "final_follow_up"])
  const lastCompletedFollowUpAt =
    (nextActions || [])
      .filter(
        (a) =>
          String(a.lead_id) === String(lead.id) &&
          (a.completed === true || a.status === "completed") &&
          FOLLOW_UP_KEYS.has(String(a.action_key)) &&
          !!str(a.completed_at),
      )
      .map((a) => str(a.completed_at) as string)
      .sort()
      .pop() ?? null
  const followUpWaitingStatus: string | null =
    crmStatus === "list_sent" &&
    latestOutreach?.type === "text_sent" &&
    lastCompletedFollowUpAt != null &&
    latestOutreach.occurredAt >= lastCompletedFollowUpAt
      ? "Waiting for Reply"
      : null

  const dto: LeadSummaryDTO = {
    id: lead.id,
    firstName: str(lead.first_name),
    lastName: str(lead.last_name),
    phone: str(lead.phone),
    stage: (isLeadStage(crmStatus) ? crmStatus : "new") as LeadSummaryDTO["stage"],
    isArchived: crmStatus === "archived" || !!lead.deleted_at,
    archiveReason: str(lead.archive_reason),
    // Canonical label via the ONE map in lib/leads/archiveReasons — the Companion
    // renders this verbatim in its Archive Reason row (no duplicate label logic).
    archiveReasonLabel: getArchiveReasonLabel(str(lead.archive_reason)),
    isClosed: crmStatus === "closed",
    searchCriteria: {
      city: str(lead.city),
      budgetText: budgetText(lead.desired_rent),
      income: str(lead.income),
      propertyType: str(lead.property_type),
      beds: str(lead.beds),
      baths: str(lead.baths),
      moveDate: str(lead.move_date),
      desiredAreas: str(lead.neighborhoods) ?? str(lead.submarkets),
      // Readable source label via the CRM's canonical source map (same source of
      // truth as LeadSourceBadge): "instagram_ads" → "Instagram Ads".
      source: str(lead.source) ? getSourceStyle(lead.source).label : null,
    },
    creditScreening: {
      creditScore: str(lead.credit_score),
      creditHistory: str(lead.credit_history),
      brokenLeaseAge: historyLower.includes("broken") ? str(lead.broken_lease_age) : null,
      evictionAge: lead.credit_history === "Eviction" ? str(lead.eviction_age) : null,
      criminalBackground: str(lead.criminal_background),
      felonyAge: str(lead.felony_age),
      misdemeanorAge: str(lead.misdemeanor_age),
    },
    workflow: {
      followUpCount: Number(lead.follow_up_count) || 0,
      nextActionDate: str(lead.next_action_date),
      firstContactAt: str(lead.first_text_sent_at),
    },
    lastAction: deriveLastAction(lead, nextActions, latestOutreach),
    clientNotes: str(lead.notes),
  }

  // Real open next-action rows for this lead. The canonical Follow Up created by a
  // pending outreach (action_key contacted_follow_up) carries the resting Status
  // so the panel shows "No Answer" / "Waiting for Reply" instead of plain Pending.
  const openReal: NextActionDTO[] = (nextActions || [])
    .filter((a) => String(a.lead_id) === String(lead.id) && !a.completed)
    .map((a) => ({
      id: a.id,
      leadId: a.lead_id,
      title: str(a.title) ?? "",
      dueAt: str(a.due_at),
      priority: priority(a.priority),
      notes: str(a.notes),
      completed: false,
      completedAt: str(a.completed_at),
      statusLabel:
        a.action_key === "contacted_follow_up"
          ? pendingFollowUpStatus
          : FOLLOW_UP_KEYS.has(String(a.action_key))
          ? followUpWaitingStatus
          : null,
    }))

  // If there's no real open row, synthesize the stage-computed action (same title
  // the CRM shows) so the Next Action still renders read-only. The generic "Next
  // Action" fallback (archived leads / stages with no workflow rule) is omitted —
  // it's a placeholder, not a real action, so those correctly show no open action.
  let actions = openReal
  if (openReal.length === 0) {
    const computed = getNextAction({ ...lead, follow_up_count: dto.workflow.followUpCount })
    if (computed && computed !== "Next Action") {
      actions = [
        {
          id: `computed-${lead.id}`,
          leadId: lead.id,
          title: computed,
          dueAt: dto.workflow.nextActionDate ?? null,
          priority: "medium",
          notes: null,
          completed: false,
          completedAt: null,
        },
      ]
    }
  }

  const favoriteDtos: FavoriteDTO[] = (favorites || [])
    .filter((f: any) => String(f.lead_id) === String(lead.id))
    .map((f: any) => ({
      id: f.id,
      propertyName: str(f.property_name) ?? "Property",
      propertyAddress: str(f.property_address),
      propertyUrl: str(f.property_url),
    }))

  return { lead: dto, nextActions: actions, favorites: favoriteDtos, agentName: str(agentName), timeZone: str(timeZone) }
}
