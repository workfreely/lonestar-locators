import type { LeadSummaryDTO, NextActionDTO, FavoriteDTO, RecommendationDTO, FollowUpOverrides, ClientHistoryEntryDTO } from "@bc/companion-shared"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { visibleRecommendations, favoriteMoveBlock } from "@/lib/leads/propertyCollections"
import { isClientFavorite } from "@/lib/leads/favoriteOrigin"
import { resolveGuestCardPrimary } from "@/lib/leads/guestCardAggregate"
import { isLeadStage, APPLICATION_LAST_ACTION_LABELS, isApplicationStatus } from "@bc/companion-shared"
import { getNextAction } from "@/lib/nextAction"
import { rankLeadActions } from "@/lib/nextActions"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
import { getArchiveReasonLabel } from "@/lib/leads/archiveReasons"
import { holdFollowUpInstant } from "@/lib/leads/holdWorkflow"
import { clientCommuteCriterion } from "@/lib/commute/commuteReason"
import { SOURCE_LABELS, type CriteriaSource } from "@/lib/leads/criteriaHistory"

// Phase 2 — active-client bridge payload (CRM page → content script → panel).
//
// Kept separate from the strict, leadId-only `activeClientMsg` contract because,
// until the Chrome extension has its own auth token, the CRM (already
// authenticated via the web session) supplies the READ-ONLY display data
// directly through the local bridge. When token auth lands, the panel can switch
// to refetching by leadId and this payload shape stays the same on the panel side.
export const COMPANION_MSG_SOURCE = "lb-companion"

/** The signed-in locator's own contact identity, for Schedule Tour autofill.
 *  Client fields fill the prospect/contact inputs; THESE fill the message/comments
 *  field only (never the client's name/email/phone). Resolved CRM-side from the
 *  same ResolvedAgentIdentity used for guest cards — no extra fetch. All nullable;
 *  the autofill simply omits any missing line. */
export type CompanionLocator = {
  firstName: string | null
  lastName: string | null
  phone: string | null
  email: string | null
  title: string | null
  brokerage: string | null
}

export type CompanionActiveClientPayload = {
  /** Opaque owner key, "<userId>:<workspaceId>", identifying the signed-in
   *  locator whose session produced this payload. Beast Companion stamps every
   *  stored record with it and refuses to render a record whose owner differs
   *  from the current session — so one account can never see another account's
   *  client on a shared browser. Server-derived; never user input. */
  owner: string
  lead: LeadSummaryDTO
  nextActions: NextActionDTO[]
  /** THIS client's saved Favorite Properties — the ONLY properties a tour can be
   *  scheduled against (Schedule Tour requires one). Same lead_favorites records
   *  the CRM shows; never a separate copy. */
  favorites?: FavoriteDTO[]
  /** THIS client's canonical Recommended Properties (lead_recommendations). Same
   *  records the Workspace shows; never a separate copy. Empty when none. */
  recommendations?: RecommendationDTO[]
  agentName?: string | null
  /** The signed-in locator's contact identity for Schedule Tour autofill (message
   *  field only — never the client contact fields). Null when unresolved. */
  locator?: CompanionLocator | null
  /** The locator's uploaded profile photo URL (ResolvedAgentIdentity.photoUrl).
   *  Display-only, shown in the Companion menu's connection block; null → initials
   *  fallback. Reuses the CRM's already-resolved agent identity (no extra fetch). */
  agentAvatarUrl?: string | null
  /** Workspace-level follow-up message TEXT overrides (content only). Passed
   *  straight through so the Companion renders the same custom wording the CRM
   *  does. Absent/empty → every message uses its in-code default. Never workflow. */
  followUpTemplates?: FollowUpOverrides
  /** The locator's saved IANA timezone — the Companion formats Due / Completed /
   *  workflow times in THIS zone (via formatDueDateTime's timeZone), so display
   *  matches the CRM regardless of the device's zone. */
  timeZone?: string | null
  /** Per-client Automated Texts: the caller's account authorization + THIS lead's
   *  enrollment. Absent / unauthorized → the Companion offers no control (private
   *  rollout). Server-resolved by the CRM; the Companion never decides authorization. */
  automatedTexting?: { authorized: boolean; enrolled: boolean }
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
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Read-only invoice/commission summary from the lead's canonical leads.invoice_*
// fields (the SAME data the CRM Invoice Details section shows). Totals are computed
// live (never stored), mirroring the CRM. Surfaced ONLY for Closed leads that have
// collected some data; null otherwise — so the Companion never shows an empty card.
function buildInvoiceSummary(lead: any) {
  if ((str(lead.crm_status) ?? "new") !== "closed") return null
  const base = num(lead.invoice_base_rent)
  const commPct = num(lead.invoice_commission_pct)
  const brokerPct = num(lead.invoice_broker_split_pct)
  const totalInvoice = base != null && commPct != null ? (base * commPct) / 100 : null
  const expectedCommission = totalInvoice != null && brokerPct != null ? (totalInvoice * brokerPct) / 100 : null
  const rebateType = str(lead.invoice_rebate_type)
  const summary = {
    contactName: str(lead.invoice_contact_name),
    contactTitle: str(lead.invoice_contact_title),
    notes: str(lead.invoice_notes),
    propertyName: str(lead.invoice_property_name),
    unitNumber: str(lead.invoice_unit_number),
    leaseStartDate: (str(lead.invoice_lease_start_date) ?? "").slice(0, 10) || null,
    leaseTerm: str(lead.invoice_lease_term),
    baseRent: base,
    commissionPct: commPct,
    brokerSplitPct: brokerPct,
    totalInvoice,
    expectedCommission,
    rebateType: rebateType && rebateType !== "None" ? rebateType : null,
    rebateAmount: num(lead.invoice_rebate_amount),
    submitted: lead.invoice_submitted === true ? true : null,
    commissionPaid: lead.invoice_commission_paid === true ? true : null,
  }
  const hasAny = Object.values(summary).some((v) => v !== null && v !== undefined && v !== "")
  return hasAny ? summary : null
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
): { title: string; completedAt: string | null; propertyName: string | null; completedVia: string | null } | null {
  const candidates: { title: string; completedAt: string; propertyName: string | null; completedVia: string | null }[] = []

  const firstContact = str(lead.first_text_sent_at)
  if (firstContact) {
    // WHO reached them, carried alongside the title rather than instead of it: the task is
    // always "Contact Lead", and completedVia says whether a person or the Follow-Up Agent
    // finished it. Null for a legacy row, which then shows no method at all.
    const contactVia =
      (nextActions || []).find(
        (a: any) =>
          String(a.lead_id) === String(lead.id) &&
          String(a.action_key ?? "").toLowerCase() === "contact_lead" &&
          (a.completed === true || a.status === "completed"),
      )?.completed_via ?? null
    candidates.push({
      title: "Contact Lead",
      completedAt: firstContact,
      propertyName: null,
      // Carried to Companion so it renders the SAME completed state the CRM does — the green
      // check, the timestamp, and the method on its own line.
      completedVia: contactVia,
    })
  }

  const outreachTitle = outreachLastActionTitle(lead, latestOutreach)
  if (outreachTitle && latestOutreach) candidates.push({ title: outreachTitle, completedAt: latestOutreach.occurredAt, propertyName: null, completedVia: null })

  for (const a of nextActions || []) {
    if (String(a.lead_id) !== String(lead.id)) continue
    const done = a.completed === true || a.status === "completed"
    const at = str(a.completed_at)
    const title = str(a.title)
    // Per-property completions (Tour Scheduled = setup_tour, Guest Card Sent =
    // email_guest_card) carry their Favorite name so the Last Action line can read
    // "Tour Scheduled · The Foundry". Non-property actions have none (stays null).
    if (done && at && title) {
      // EVERY action keeps its own name. Build List stays Build List, Send Guest Cards stays
      // Send Guest Cards; the completion method travels beside the title, never over it.
      candidates.push({ title, completedAt: at, propertyName: str(a.property_name), completedVia: str(a.completed_via) })
    }
  }

  // Lowest-priority fallback: the lead's own creation. Any real activity above
  // ALWAYS takes precedence (this is only reached when there is none), so a lead
  // is never blank. This is the actual created_at event — NOT a stage-derived or
  // invented action. If created_at is somehow absent, stay null (can't invent).
  if (candidates.length === 0) {
    const createdAt = str(lead.created_at)
    return createdAt ? { title: "Lead Created", completedAt: createdAt, propertyName: null, completedVia: null } : null
  }
  candidates.sort((x, y) => (x.completedAt < y.completedAt ? 1 : x.completedAt > y.completedAt ? -1 : 0))
  return candidates[0]
}

// Build the read-only DTO the Companion renders, from a CRM `leads` row + its
// open `lead_next_actions` rows. Mirrors the Lead Panel's own field derivations
// (identity, Search Criteria, Credit Screening, Client Notes, workflow). NO
// writes, NO workflow mutation — display only.
/**
 * `criteria_changed` lead_timeline rows → the Client History DTO, newest first.
 *
 * Defensive by design: these rows are jsonb written by an older build of this
 * code, so a row whose metadata predates (or postdates) the current shape is
 * SKIPPED rather than rendered half-empty. An entry with no usable changes is
 * dropped — the panel's empty state is the honest result.
 */
function toClientHistory(rows: unknown): ClientHistoryEntryDTO[] {
  if (!Array.isArray(rows)) return []
  const out: ClientHistoryEntryDTO[] = []
  for (const r of rows as Array<Record<string, unknown>>) {
    const meta = (r?.metadata ?? {}) as { source?: unknown; changes?: unknown }
    const source = typeof meta.source === "string" ? meta.source : ""
    if (!source || !Array.isArray(meta.changes)) continue
    const changes = (meta.changes as Array<Record<string, unknown>>)
      .filter((c) => c && typeof c.label === "string")
      .map((c) => ({ label: String(c.label), from: String(c.from ?? ""), to: String(c.to ?? "") }))
    if (changes.length === 0) continue
    out.push({
      occurredAt: String(r.occurred_at ?? r.created_at ?? ""),
      source,
      sourceLabel: SOURCE_LABELS[source as CriteriaSource] ?? "Update",
      changes,
    })
  }
  // Newest first. Sorted here rather than trusted from the query so the order holds
  // whatever the caller passes in.
  return out.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

export function buildActiveClientPayload(
  lead: any,
  nextActions: any[] = [],
  agentName?: string | null,
  latestOutreach: LatestOutreach = null,
  timeZone?: string | null,
  // THIS lead's saved Favorite Properties (lead_favorites rows). Mapped to the
  // read-only FavoriteDTO the Schedule Tour dropdown renders.
  favorites: any[] = [],
  // THIS lead's lead_tours rows — used ONLY to derive the "Toured · Property"
  // Last Action once the surfaced Tour Follow-Up's tour has occurred (read-only).
  tours: any[] = [],
  // THIS lead's canonical Recommended Properties (lead_recommendations rows).
  // Read-only; mapped to RecommendationDTO and filtered to this lead below.
  recommendations: any[] = [],
  // THIS lead's AI Client Insights — the ≤4 short bullets already derived from
  // synced conversations (ai_client_briefs.insights). Read-only, passed in by the
  // caller (never generated here). Surfaced for Location Fit's current-context read.
  aiInsights: string[] = [],
  // Opaque owner key for the signed-in locator, "<userId>:<workspaceId>". Resolved
  // server-side and passed down; the Companion binds every stored record to it.
  owner = "",
  // The signed-in locator's uploaded profile photo (ResolvedAgentIdentity.photoUrl).
  // Display-only — the Companion menu's connection block shows it next to the agent
  // name, falling back to initials when null. No separate fetch: reuses the same
  // identity the CRM already resolves for guest cards.
  agentAvatarUrl?: string | null,
  // Workspace-level follow-up message TEXT overrides (content only). Passed
  // straight through to the payload so the Companion renders the same wording.
  followUpTemplates: FollowUpOverrides = {},
  // The signed-in locator's contact identity (Schedule Tour autofill → message
  // field only). Resolved CRM-side from ResolvedAgentIdentity; null when unknown.
  locator: CompanionLocator | null = null,
  // Per-client Automated Texts: the caller's account authorization + THIS lead's
  // enrollment. Null → the Companion offers no control (unauthorized / not passed).
  automatedTexting: { authorized: boolean; enrolled: boolean } | null = null,
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
  // Pre-list contact chase keys — resting status via pendingFollowUpStatus (not the
  // post-list followUpWaitingStatus path). Separate from FOLLOW_UP_KEYS on purpose.
  const CONTACT_FOLLOW_UP_KEYS = new Set(["contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3"])
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
    email: str(lead.email),
    stage: (isLeadStage(crmStatus) ? crmStatus : "new") as LeadSummaryDTO["stage"],
    isArchived: crmStatus === "archived" || !!lead.deleted_at,
    archiveReason: str(lead.archive_reason),
    // Canonical label via the ONE map in lib/leads/archiveReasons — the Companion
    // renders this verbatim in its Archive Reason row (no duplicate label logic).
    archiveReasonLabel: getArchiveReasonLabel(str(lead.archive_reason)),
    isClosed: crmStatus === "closed",
    // On Hold — separate from archived (crm_status is preserved). The panel
    // suppresses the active Next Action and shows the hold follow-up date.
    isOnHold: !!lead.held_at,
    holdFollowUpAt: str(lead.hold_follow_up_at),
    // The 9:00 AM local INSTANT for the hold follow-up, via the SAME helper the
    // Agenda uses (holdFollowUpInstant) — the panel formats it with the shared
    // due-date formatter so the held date reads identically to the Agenda. One
    // source of truth; no second date treatment.
    holdFollowUpDueAt: lead.held_at ? holdFollowUpInstant(str(lead.hold_follow_up_at), timeZone ?? DEFAULT_TIMEZONE) : null,
    searchCriteria: {
      city: str(lead.city),
      budgetText: budgetText(lead.desired_rent),
      income: str(lead.income),
      propertyType: str(lead.property_type),
      // Stored comma-joined (same precedent as `neighborhoods`); split back to the
      // canonical option values the Companion's evaluator matches on.
      mustHaveAmenities: String(lead.must_have_amenities ?? "")
        .split(",")
        .map((v: string) => v.trim())
        .filter(Boolean),
      beds: str(lead.beds),
      baths: str(lead.baths),
      moveDate: str(lead.move_date),
      desiredAreas: str(lead.neighborhoods) ?? str(lead.submarkets),
      // The client's commute REQUIREMENT, already formatted — "Within 20 min of
      // Six Flags", or just "Six Flags" when they stated no maximum.
      //
      // Through the SHARED formatter the CRM's Search Criteria card also calls, so
      // the two panels cannot disagree about it. They previously each applied the
      // alias bank themselves under a comment claiming exactly that; when the CRM
      // started showing the maximum, this one silently kept showing the bare label.
      //
      // Pre-formatted ON PURPOSE: Companion needs no commute_max_minutes field and
      // no contract change, because the string is the whole criterion.
      commuteDestination: clientCommuteCriterion(lead.commute_anchor_label, lead.commute_max_minutes) || null,
      // Readable source label via the CRM's canonical source map (same source of
      // truth as LeadSourceBadge): "instagram_ads" → "Instagram Ads".
      source: str(lead.source) ? getSourceStyle(lead.source).label : null,
    },
    // CLIENT HISTORY — read off the lead row, which the server page decorates with
    // its `criteria_changed` lead_timeline rows. Display only: it never feeds
    // searchCriteria above, which stays the current truth used for matching.
    clientHistory: toClientHistory(lead.criteria_history),
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
    // Durable one-per-lead Top Pick (leads.top_pick_favorite_id). Null when none.
    topPickFavoriteId: str(lead.top_pick_favorite_id),
    // Durable application outcome (leads.application_status). Null until recorded.
    applicationStatus: str(lead.application_status),
    // Read-only invoice/commission summary (Closed leads with collected data).
    invoice: buildInvoiceSummary(lead),
    clientNotes: str(lead.notes),
    // Agent-entered Locator Notes (may hold newer confirmed location needs) and the
    // pre-derived AI Client Insights — both read-only, both consumed ONLY by
    // Location Fit. Insights are sanitized to non-empty strings; empty → omitted.
    locatorNotes: str(lead.locator_notes),
    aiInsights: (aiInsights || []).map((s) => str(s)).filter((s): s is string => !!s),
    // The locator's saved voicemail script, passed through as stored. Shape-checked rather than
    // trusted: the column is jsonb, and a row written before this shipped (or by hand) must not
    // put a half-object in front of the panel. Anything unrecognised reads as "no saved script",
    // which renders the template fresh — the same, safe fallback as null.
    // CONFIRMED UPCOMING APPOINTMENTS, counted distinctly. `tours` is already passed in for the
    // "Toured · Property" derivation below, so this needs no new query. A row is counted only when
    // it is this lead's, still 'scheduled', and carries a PARSEABLE time in the future — an absent
    // or malformed scheduled_at is not a confirmed appointment and must not read as one.
    upcomingTourCount: (() => {
      const now = Date.now()
      const seen = new Set<string>()
      for (const t of tours || []) {
        if (String(t.lead_id ?? "") !== String(lead.id)) continue
        if (String(t.status ?? "") !== "scheduled") continue
        const at = new Date(t.scheduled_at).getTime()
        if (!Number.isFinite(at) || at <= now) continue
        // Same property at the same instant is ONE appointment, however many rows recorded it.
        seen.add(`${t.property_id ?? "none"}|${at}`)
      }
      return seen.size
    })(),
    voicemailScript: (() => {
      const v = (lead as Record<string, unknown>).voicemail_script as Record<string, unknown> | null | undefined
      if (!v || typeof v !== "object") return null
      const key = str(v.templateKey)
      const body = str(v.body)
      if (!key || !body) return null
      return {
        templateKey: key,
        body,
        specialsEnabled: v.specialsEnabled === true,
        editedAt: str(v.editedAt),
        editedBy: str(v.editedBy),
      }
    })(),
  }

  // Real open next-action rows for this lead. The canonical Follow Up created by a
  // pending outreach (action_key contacted_follow_up) carries the resting Status
  // so the panel shows "No Answer" / "Waiting for Reply" instead of plain Pending.
  const openReal: NextActionDTO[] = (nextActions || [])
    // "canceled" is a closed state — a superseded row (e.g. a Contact FU canceled
    // when the lead was reached mid-chase) must never show as an open action.
    .filter((a) => String(a.lead_id) === String(lead.id) && !a.completed && String(a.status ?? "") !== "canceled")
    .map((a) => ({
      id: a.id,
      leadId: a.lead_id,
      title: str(a.title) ?? "",
      dueAt: str(a.due_at),
      priority: priority(a.priority),
      notes: str(a.notes),
      completed: false,
      completedAt: str(a.completed_at),
      // Per-property actions (Send Guest Card, guest cards) carry the property so
      // the panel can label "Send Guest Card — {property}".
      propertyName: str(a.property_name),
      // Workflow identity — null for a manual task. Decides whether the panel offers a title edit.
      actionKey: str(a.action_key),
      // The locator's own reminder, as the ROW says it is: createManualTask stamps action_key null
      // + action_type "manual". Anything else is the workflow's, and a row that claims neither is
      // treated as the workflow's — fail closed, so a stray row can never be mistaken for a
      // personal reminder and demoted out of the headline.
      isManual: !a.action_key && String(a.action_type ?? "").toLowerCase() === "manual",
      statusLabel:
        // Pre-list contact chase (retired contacted_follow_up + Contact FU1/2/3):
        // the resting "No Answer" / "Waiting for Reply" status, same as before.
        a.action_key === "contacted_follow_up" || CONTACT_FOLLOW_UP_KEYS.has(String(a.action_key))
          ? pendingFollowUpStatus
          : FOLLOW_UP_KEYS.has(String(a.action_key))
          ? followUpWaitingStatus
          : null,
    }))

  // ONE definition of Primary Next Action. Rank the real open rows AND the automatic
  // stage action with the SAME rankLeadActions the CRM/Agenda/Board use, then surface
  // that exact primary — so the Companion can no longer disagree with the CRM surfaces
  // (previously it ignored the automatic action except as a zero-open-row fallback).
  // PASS THE LEAD'S FULL ROW SET, completed rows included.
  //
  // ── ONE ORDER, TWO QUESTIONS ────────────────────────────────────────────────────────────────
  // This ORDER is canonical and every surface receives it. The Companion's Next Action CARD then
  // picks its headline from it with one extra rule: when an open workflow action exists it is the
  // headline, and a manual reminder is shown in the row beneath instead of replacing it.
  //
  // So in one situation the Companion's headline and the Agenda's primary differ ON PURPOSE: a
  // manual reminder that is overdue (or due sooner) while the leasing step is not yet due. That is
  // not the old disagreement this comment was written about — the Companion ignoring the automatic
  // action — and it is not drift. The two surfaces answer different questions. The Agenda is a due
  // queue: "what needs me today?", and a reminder coming due is legitimately its business. The card
  // is a client workspace: "where is this client in the pipeline?", which is the leasing step.
  //
  // The ordering below stays untouched for exactly that reason: the Agenda keeps surfacing overdue
  // reminders, the Kanban badge stays stage-derived, and the card's rule is presentation only. Any
  // attempt to express this in rankLeadActions instead would have to demote overdue reminders for
  // every surface, which is how an overdue reminder stops appearing on the Agenda at all.
  //
  // This used to pass `openRaw` (completed stripped), which silently disabled the
  // two gates that suppress a redundant automatic action — `finalFollowUpCompleted`
  // and `tourScheduledComplete` both SCAN for completed rows (lib/nextActions).
  // With them permanently false, a Companion lead whose tour is already scheduled
  // re-surfaced "Schedule Tour" and a finished ladder re-surfaced a follow-up.
  // rankLeadActions does its own open-only filtering internally, so handing it the
  // full set is what the other three call sites (LeadCard, LeadPanel, FollowUpRow)
  // already do — this was the one surface that differed.
  const forLeadAll = (nextActions || []).filter((a) => String(a.lead_id) === String(lead.id))
  const openRaw = forLeadAll.filter((a) => !a.completed && String(a.status ?? "") !== "canceled")
  const rankedLead = { ...lead, follow_up_count: dto.workflow.followUpCount }
  const ranked = rankLeadActions(rankedLead, forLeadAll as any, getNextAction(rankedLead))

  // Order the real rows by the canonical rank (foreground → urgency → priority → due).
  const rankIndex = new Map<string, number>()
  ;[ranked.primary, ...ranked.others].forEach((ra, i) => {
    if (ra.manualAction) rankIndex.set(String((ra.manualAction as any).id), i)
  })
  const orderedOpen = [...openReal].sort(
    (a, b) => (rankIndex.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (rankIndex.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER),
  )

  // When the automatic stage action is the canonical primary (it outranks every real
  // open row, or there are none), surface it first — exactly as the CRM surfaces do.
  // Skip the generic "Next Action" sentinel and the spent closing placeholder. When a
  // real row is the primary, orderedOpen already has it first (it carries propertyName).
  let actions = orderedOpen
  if (ranked.primary.kind === "automatic") {
    const title = ranked.primary.title
    const isSentinel = title === "Next Action"
    const isSpentClosingPlaceholder = title === "Invoice Details" && !!lead.invoice_commission_paid
    if (title && !isSentinel && !isSpentClosingPlaceholder) {
      actions = [
        {
          id: `computed-${lead.id}`,
          leadId: lead.id,
          title,
          dueAt: dto.workflow.nextActionDate ?? null,
          priority: "medium",
          notes: null,
          completed: false,
          completedAt: null,
          // THE STAGE'S OWN ACTION. It carries no action_key (there is no row behind it), which is
          // precisely why isManual has to be stated rather than inferred.
          isManual: false,
        },
        ...orderedOpen,
      ]
    }
  }

  // Aggregate the Guest Card objective: when the Primary Next Action is a genuine-
  // Favorite Guest Card and 2+ are outstanding, present ONE "Send Guest Cards · N
  // properties" instead of competing per-property rows. Derived live from the open
  // email_guest_card actions of genuine Favorites (application-only identity rows and
  // non-Favorite guest cards are excluded), so it collapses 3 → 2 → 1 → none as they
  // complete. Clicking it opens the sequential bulk modal (open-guest-card verb).
  if (actions[0]) {
    const rawPrimary = (nextActions || []).find((a: any) => String(a.id) === String(actions[0].id))
    const gcPrimary = resolveGuestCardPrimary(lead.id, rawPrimary, nextActions || [], favorites || [])
    if (gcPrimary?.aggregate) {
      actions = [
        {
          id: `gc-bulk-${lead.id}`,
          leadId: lead.id,
          title: gcPrimary.title,
          dueAt: actions[0].dueAt,
          priority: actions[0].priority,
          notes: null,
          completed: false,
          completedAt: null,
          propertyName: gcPrimary.detail,
          // An aggregate of email_guest_card rows — workflow work, not a personal reminder.
          isManual: false,
        },
        ...actions.slice(1),
      ]
    }
  }

  // "Toured · Property" — once the SURFACED Tour Follow-Up's OWN tour has occurred
  // (scheduled_at ≤ now, still awaiting its outcome), the Last Action reflects the
  // tour happening, aligned to the exact property being surfaced. This can never
  // show a different property's tour than the primary Tour Follow-Up (§15).
  const primaryDto = actions[0]
  if (primaryDto && (primaryDto.title || "").trim().toLowerCase() === "tour follow-up" && primaryDto.propertyName) {
    const rawPrimary = (nextActions || []).find((a: any) => String(a.id) === String(primaryDto.id))
    const propId = rawPrimary ? rawPrimary.property_id : null
    const tour = (tours || []).find(
      (t: any) =>
        propId != null &&
        String(t.property_id ?? "") === String(propId) &&
        (String(t.status ?? "scheduled") === "scheduled" || String(t.status ?? "") === "completed") &&
        Number.isFinite(new Date(t.scheduled_at).getTime()) &&
        new Date(t.scheduled_at).getTime() <= Date.now(),
    )
    if (tour) dto.lastAction = { title: "Toured", completedAt: str(tour.scheduled_at), propertyName: primaryDto.propertyName }
  }

  // Furthest application-phase Last Action, in canonical order (later milestones
  // win). Derived from durable state + the property-scoped rows — never fabricated:
  //   • a completed Get Invoice Details → deriveLastAction already surfaced it
  //     ("Got Invoice Details · Property") — leave it (the terminal record).
  //   • else a completed Confirm Lease → "Lease Signed · Property".
  //   • else an application outcome (leads.application_status) → the fully-contextual
  //     application label ("Application Approved · Property", "Application Still
  //     Pending · Property", …), anchored on the check_application row (open for
  //     Pending — re-dated, not completed; completed for the terminal outcomes).
  // Each is property-scoped to the Top Pick and never clobbers a later milestone.
  const forLead = (nextActions || []).filter((a: any) => String(a.lead_id) === String(lead.id))
  const isKey = (a: any, key: string, title: string) =>
    String(a.action_key ?? "") === key || String(a.title ?? "").trim().toLowerCase() === title
  const completedInvoice = forLead.some((a: any) => (a.completed === true || a.status === "completed") && isKey(a, "get_invoice_details", "get invoice details"))
  const completedLease = forLead
    .filter((a: any) => (a.completed === true || a.status === "completed") && isKey(a, "confirm_lease", "confirm lease") && !!str(a.completed_at))
    .sort((x: any, y: any) => (str(x.completed_at)! < str(y.completed_at)! ? 1 : -1))[0]
  const appStatus = str(lead.application_status)
  if (completedInvoice) {
    // deriveLastAction already produced "Got Invoice Details · Property" — terminal.
  } else if (completedLease) {
    dto.lastAction = { title: "Lease Signed", completedAt: str(completedLease.completed_at), propertyName: str(completedLease.property_name) }
  } else if (isApplicationStatus(appStatus)) {
    const check = forLead
      .filter((a: any) => isKey(a, "check_application", "check app"))
      .sort((x: any, y: any) => ((str(x.completed_at) ?? "") < (str(y.completed_at) ?? "") ? 1 : -1))[0]
    if (check) {
      const done = check.completed === true || check.status === "completed"
      dto.lastAction = {
        title: APPLICATION_LAST_ACTION_LABELS[appStatus],
        completedAt: done ? str(check.completed_at) : null,
        propertyName: str(check.property_name),
      }
    }
  }

  const favoriteDtos: FavoriteDTO[] = (favorites || [])
    // GENUINE Client Favorites only — application-only identity rows stay hidden.
    .filter((f: any) => String(f.lead_id) === String(lead.id) && isClientFavorite(f))
    .map((f: any) => ({
      id: f.id,
      propertyName: str(f.property_name) ?? "Property",
      propertyAddress: str(f.property_address),
      // Property photo, resolved read-side by attachCatalogRatings (same source as
      // the CRM's PropertyThumb). Null → the Companion shows the clean placeholder.
      propertyImageUrl: str(f.property_image_url),
      propertyUrl: str(f.property_url),
      // Real property website (property_catalog.website_url), resolved read-side by
      // attachCatalogRatings. The only URL the name may link to — never propertyUrl.
      websiteUrl: str(f.website_url),
      // Google rating resolved read-side from property_catalog (attachCatalogRatings
      // at the fetch). Null when uncatalogued/unrated — never fabricated.
      googleRating: typeof f.google_rating === "number" ? f.google_rating : null,
      // Resolved HERE because this is where the tours + next actions live. Null when
      // the Favorite can move back to Recommendations.
      moveBlockedReason: favoriteMoveBlock({ favorite: f, lead, tours, nextActions }).reason,
    }))

  // THIS lead's canonical recommendations — same lead_id filter as favorites, so
  // no cross-client leakage. Empty array when the client has none.
  // Legacy duplicates resolve in favour of Favorites so the same property never
  // renders in both lists. Nothing is deleted — the next deliberate move resolves it.
  const recommendationDtos: RecommendationDTO[] = visibleRecommendations(recommendations || [], favorites || [], lead.id)
    .filter((r: any) => String(r.lead_id) === String(lead.id))
    .map((r: any) => ({
      id: r.id,
      propertyName: str(r.property_name) ?? "Property",
      propertyAddress: str(r.property_address),
      propertyUrl: str(r.property_url),
      // Real property website (property_catalog.website_url), resolved read-side.
      // The only URL the name may link to — never propertyUrl (Google Maps).
      websiteUrl: str(r.website_url),
      // Google rating resolved read-side from property_catalog. Null when
      // uncatalogued/unrated.
      googleRating: typeof r.google_rating === "number" ? r.google_rating : null,
    }))

  return { owner, lead: dto, nextActions: actions, favorites: favoriteDtos, recommendations: recommendationDtos, agentName: str(agentName), locator, agentAvatarUrl: str(agentAvatarUrl), followUpTemplates, timeZone: str(timeZone), automatedTexting: automatedTexting ?? undefined }
}
