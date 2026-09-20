"use client"

import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import { formatWorkflowActionLabel } from "@/lib/leads/workflowActionLabels"
import { resolveGuestCardPrimary } from "@/lib/leads/guestCardAggregate"
import { getActionIcon, formatDueDateTime } from "@/lib/actionDisplay"
import { isOnHold, holdReminderUrgency, holdFollowUpInstant } from "@/lib/leads/holdWorkflow"
import HoldControls from "./HoldControls"
import { formatPersonName } from "@bc/companion-shared"

// The Agenda no longer keeps its own label switch. Its automatic Next Action is
// the CANONICAL stage action (lib/nextAction.getNextAction — same source the
// Kanban badge / Lead Panel / Companion use), and every displayed title (manual
// or automatic) is run through the shared formatWorkflowActionLabel so wording
// stays aligned everywhere and can't drift. Raw titles are still passed to
// rankLeadActions/getActionIcon so ranking, suppression, and the existing emoji
// lookup keep matching on stable identity.

export default function FollowUpRow({
  leads,
  nextActions,
  favorites = [],
  selectedLeadId,
  activeLeadId,
  onSelectLead,
  onCollapse,
  // Which outer edge the Agenda collapses toward — drives the collapse arrow
  // direction so it always points at the nearest app edge. Mirrors agendaSide.
  collapseToward = "left",
  timeZone,
  onResumeLead,
  onRescheduleHold,
}: {
  leads: any[]
  nextActions: any[]
  /** Genuine Client Favorites — for the canonical Guest Card aggregation. */
  favorites?: any[]
  selectedLeadId?: string | number | null
  /** The active/current client (Companion's active client). The Lead Board card
   *  shows its visible highlight from this same id (kb-card--active-client), so the
   *  Agenda item highlights on it too — keeping both surfaces in sync. Reuses the
   *  existing active-client identity; no Agenda-only selection state. */
  activeLeadId?: string | number | null
  onSelectLead?: (leadId: string | number) => void
  onCollapse?: () => void
  collapseToward?: "left" | "right"
  // Saved locator IANA timezone — Agenda due times render in this zone.
  timeZone?: string | null
  // On Hold reminder actions (Resume / Reschedule) — same canonical handlers the
  // board's Inactive → On Hold card uses.
  onResumeLead?: (leadId: string | number) => void
  onRescheduleHold?: (leadId: string | number, followUpDate: string) => void
}) {
  // An Agenda entry is either a NORMAL ranked Next Action or a HOLD reminder. Both
  // carry an urgency + dueAt so they queue and sort together in one list.
  type Entry = {
    lead: any
    kind: "normal" | "hold"
    urgency: "overdue" | "today" | "upcoming" | "none"
    dueAt: string | null
    primary?: ReturnType<typeof rankLeadActions>["primary"]
  }

  // NORMAL — same ranking LeadPanel/board use. Closed, archived AND held leads are
  // excluded (held leads surface via the hold reminder below, not their dormant
  // Next Action; rankLeadActions already returns an inert sentinel for them).
  const normalEntries: Entry[] = leads
    .filter((lead) => !isOnHold(lead) && lead.crm_status !== "closed" && lead.crm_status !== "archived")
    .map((lead) => {
      const { primary } = rankLeadActions(lead, nextActions, getNextAction(lead))
      return { lead, kind: "normal" as const, urgency: primary.urgency, dueAt: primary.dueAt, primary }
    })
    .filter(
      (e) =>
        // "Next Action" is the generic no-real-step sentinel — never surface it.
        e.primary!.title !== "Next Action" && (e.urgency === "overdue" || e.urgency === "today"),
    )

  // HOLD — a held lead surfaces a "Follow Up · On Hold" reminder on its
  // hold_follow_up_at (today/overdue). A reminder only; it never resumes the lead.
  // dueAt is the 9:00 AM local INSTANT derived from the date (holdFollowUpInstant),
  // so ordering + the "· 9:00 AM" display use real scheduling data; urgency stays
  // date-based (day-granularity) — the same overdue/today the card + tab use.
  const holdEntries: Entry[] = leads
    .filter((lead) => isOnHold(lead) && lead.crm_status !== "archived")
    .map((lead) => ({
      lead,
      kind: "hold" as const,
      urgency: holdReminderUrgency(lead.hold_follow_up_at),
      dueAt: holdFollowUpInstant(lead.hold_follow_up_at, timeZone),
    }))
    .filter((e) => e.urgency === "overdue" || e.urgency === "today")

  const dueEntries: Entry[] = [...normalEntries, ...holdEntries]

  // Split the SAME canonical due entries into the two ALWAYS-rendered sections. There is no
  // filter-selection state any more: Today and Overdue are derived and shown together on every
  // render (initial load, refresh, remount, selection change, collapse/expand), so there is
  // nothing to restore and no "neither selected" ambiguity. Within each section the previous
  // ordering is preserved — earliest due first. Which action represents a lead (its PRIMARY) and
  // its urgency are chosen upstream by rankLeadActions; the UI invents no second priority.
  const byDueAsc = (a: Entry, b: Entry) =>
    (a.dueAt ? new Date(a.dueAt).getTime() : 0) - (b.dueAt ? new Date(b.dueAt).getTime() : 0)
  const todayEntries = dueEntries.filter((e) => e.urgency === "today").sort(byDueAsc)
  const overdueEntries = dueEntries.filter((e) => e.urgency === "overdue").sort(byDueAsc)
  // Red badge = actionable Today + Overdue (dueEntries already holds ONLY those two urgencies).
  const badgeCount = todayEntries.length + overdueEntries.length

  // One Agenda card (hold reminder OR normal ranked Next Action). Shared by both sections so the
  // presentation can never drift between Today and Overdue.
  const renderEntry = (entry: Entry) => {
    const { lead, kind } = entry
    // Highlight the current client on the SAME identity the Lead Board card uses: the CRM
    // selection (selectedLeadId) OR the active client (activeLeadId) — keeps them in sync.
    const isSelected =
      (selectedLeadId != null && String(selectedLeadId) === String(lead.id)) ||
      (activeLeadId != null && String(activeLeadId) === String(lead.id))
    const urg = entry.urgency === "overdue" ? "crit" : "warn"

    // HOLD reminder — "Follow Up / Lead On Hold" on hold_follow_up_at. A reminder only: it
    // offers Resume / Reschedule but never auto-resumes.
    if (kind === "hold") {
      return (
        <div key={lead.id} onClick={() => onSelectLead?.(lead.id)} className={`ag-card${isSelected ? " ag-card--selected" : ""}`}>
          <span className={`ag-strip ag-strip--${urg}`} />
          {/* Same hierarchy as a normal card: name → action → date; hold context inline. */}
          <p className="ag-name">{formatPersonName(`${lead.first_name ?? ""} ${lead.last_name ?? ""}`)}</p>
          <p className="ag-action">📌 Follow Up · On Hold</p>
          <p className={`ag-due ag-due--${urg}`}>{entry.dueAt ? formatDueDateTime(entry.dueAt, { timeZone: timeZone ?? undefined }) : ""}</p>
          <HoldControls leadId={lead.id} followUpAt={lead.hold_follow_up_at} onResume={onResumeLead} onReschedule={onRescheduleHold} size="xs" />
        </div>
      )
    }

    const primary = entry.primary!
    // Canonical Guest Card Primary presentation (shared helper): 2+ outstanding genuine-Favorite
    // Guest Cards → "Send Guest Cards · N properties"; 1 → "Send Guest Card · {Property}".
    const gcPrimary = primary.manualAction
      ? resolveGuestCardPrimary(lead.id, primary.manualAction, nextActions, favorites)
      : null
    return (
      <div key={lead.id} onClick={() => onSelectLead?.(lead.id)} className={`ag-card${isSelected ? " ag-card--selected" : ""}`}>
        <span className={`ag-strip ag-strip--${urg}`} />
        {/* Who */}
        <p className="ag-name">{formatPersonName(`${lead.first_name ?? ""} ${lead.last_name ?? ""}`)}</p>
        {/* What */}
        <p className="ag-action">{getActionIcon(primary.title)} {gcPrimary ? gcPrimary.title : formatWorkflowActionLabel(primary.title)}</p>
        {gcPrimary && <p className="ag-action" style={{ opacity: 0.7, marginTop: -2 }}>{gcPrimary.detail}</p>}
        {/* When */}
        <p className={`ag-due ag-due--${urg}`}>{primary.dueAt ? formatDueDateTime(primary.dueAt, { timeZone: timeZone ?? undefined }) : ""}</p>
      </div>
    )
  }

  return (
    <div className="ag-root">
      {/* Header — the day's work queue. Badge = Today + Overdue. */}
      <div className="ag-head">
        <h2 className="ag-title">Agenda</h2>
        <div className="ag-head-right">
          {badgeCount > 0 && <span className="ag-count">{badgeCount}</span>}
          {onCollapse && (
            <button onClick={onCollapse} className="ag-collapse" aria-label="Collapse Agenda" title="Collapse Agenda">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={collapseToward === "right" ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Two ALWAYS-present sections, stacked: Today then Overdue. No filter controls, no All tab. */}
      <div className="ag-list">
        <section className="ag-section" aria-label="Due today">
          <div className="ag-section-head">Today{todayEntries.length > 0 ? ` · ${todayEntries.length}` : ""}</div>
          {todayEntries.length === 0
            ? <p className="ag-section-empty">Nothing due today.</p>
            : todayEntries.map(renderEntry)}
        </section>

        <section className="ag-section" aria-label="Overdue">
          <div className="ag-section-head">Overdue{overdueEntries.length > 0 ? ` · ${overdueEntries.length}` : ""}</div>
          {overdueEntries.length === 0
            ? <p className="ag-section-empty">Nothing overdue.</p>
            : overdueEntries.map(renderEntry)}
        </section>
      </div>
    </div>
  )
}
