"use client"

import { useDraggable } from "@dnd-kit/core"
import { getNextAction } from "@/lib/nextAction"
import { rankLeadActions } from "@/lib/nextActions"
import { formatWorkflowActionLabel } from "@/lib/leads/workflowActionLabels"
import { resolveGuestCardPrimary } from "@/lib/leads/guestCardAggregate"
import { useState, useRef, useLayoutEffect } from "react"
import { formatPhone } from "@/lib/utils/formatPhone"
import LeadSourceBadge from "./LeadSourceBadge"
import { getArchiveReasonBadgeLabel } from "@/lib/leads/archiveReasons"
import { isOnHold as leadIsOnHold, formatHoldFollowUpNumeric } from "@/lib/leads/holdWorkflow"
import HoldControls from "./HoldControls"
// formatDateDisplay, NOT a local formatter: move_date is a date-only "YYYY-MM-DD",
// and `new Date(that)` parses it as UTC midnight — which in Central renders the
// PREVIOUS day (10/10 showed as 10/09, and 01/01 as the prior year). This card had
// its own copy doing exactly that while the Companion used the shared one, so the
// same lead read differently on two screens.
import { formatPersonName, formatDateDisplay } from "@bc/companion-shared"

// Canonical, shared person-name display formatter — the Agenda, Lead Card, Lead
// Panel and Companion all use it, so a client's name never renders two ways.
const normalizeName = formatPersonName

function formatRent(rent: string) {
  if (!rent) return "Not listed"
  const matches = rent.match(/\d[\d,]*/g)
  if (!matches || matches.length === 0) return "Not listed"
  const formatted = matches
    .map((v) => {
      const n = Number(v.replace(/,/g, ""))
      return Number.isNaN(n) ? null : `$${n.toLocaleString()}`
    })
    .filter(Boolean)
  if (formatted.length >= 2) return `${formatted[0]} – ${formatted[1]}`
  return formatted[0] ?? "Not listed"
}

// A saved value is "meaningful" only when present and non-blank. Uncollected
// card rows are omitted entirely — never shown as "—" / "Not listed" / "$0".
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === "string") return v.trim().length > 0
  return true
}

function getFollowUpStatus(date: string) {
  if (!date) return "none"
  const today = new Date()
  const d = new Date(date)
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() < today.getTime()) return "overdue"
  if (d.getTime() === today.getTime()) return "today"
  return "upcoming"
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadCard({
  lead,
  nextActions,
  favorites,
  isSelected,
  isActiveClient,
  onSelect,
  onArchive,
  // On Hold (Inactive → On Hold tab): Resume / Reschedule handlers. When present
  // the card shows the hold state + controls in place of the Next Action pill.
  onResumeHold,
  onRescheduleHold,
  // Held cards are non-draggable in v1 (no drag-to-resume). Defaults to draggable.
  draggable = true,
  view = "detailed",
}: any) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: String(lead.id),
    disabled: !draggable,
  })

  // Original card is hidden while dragging — the DragOverlay renders the copy.
  const style: React.CSSProperties = {
    opacity: transform ? 0 : undefined,
  }

  // On Hold: crm_status is preserved, so the card is identified by held_at, not a
  // stage. While held (like archived) the normal Next Action is suppressed — the
  // pill shows the useful hold state instead (see cardBody).
  const onHold = leadIsOnHold(lead)

  const [copied, setCopied] = useState(false)

  // Responsive badge row: pick the largest fit tier that doesn't overflow.
  const badgesRef = useRef<HTMLDivElement>(null)

  async function copyPhone(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!lead.phone) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(lead.phone)
      } else {
        const ta = document.createElement("textarea")
        ta.value = lead.phone
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  // ─── Risk → Approval classification ─────────────────────────────────────
  const credit = Number(lead.credit_score || 0)
  const history = String(lead.credit_history || "").toLowerCase()
  const hasBrokenLease = history.includes("broken")
  const hasEviction = history.includes("eviction")
  const hasFelony = lead.criminal_background === "Felony"

  const isHighRisk = credit < 500 || hasEviction || hasFelony
  const isMediumRisk = !isHighRisk && (credit < 620 || hasBrokenLease)

  const approvalLabel = isHighRisk ? "Approval: Low" : isMediumRisk ? "Approval: Moderate" : "Approval: High"
  const approvalClass = isHighRisk ? "kb-pill--crit" : isMediumRisk ? "kb-pill--warn" : "kb-pill--ok"

  // ─── Next action + urgency ──────────────────────────────────────────────
  // Derive the Next Action from the SAME canonical ranked state the Lead Panel /
  // Agenda use — so a scheduled tour shows "Tour Follow-Up" (not the stage's
  // automatic "Schedule Tour"), guest-card leads show the guest card, etc. Falls
  // back to the stage action when the actions aren't provided (unchanged).
  const rankedPrimary =
    Array.isArray(nextActions)
      ? rankLeadActions(
          lead,
          nextActions.filter((a: any) => String(a.lead_id) === String(lead.id)),
          getNextAction(lead)
        ).primary
      : null
  const action = rankedPrimary ? rankedPrimary.title : getNextAction(lead)
  // Urgency comes from the SAME ranked primary action's own due date — one
  // definition of Primary Next Action AND its urgency. Falls back to the stage's
  // next_action_date only when the actions list wasn't provided (rankedPrimary null).
  const followUpStatus =
    lead.crm_status === "archived"
      ? "none"
      : rankedPrimary
        ? rankedPrimary.urgency
        : lead.next_action_date
          ? getFollowUpStatus(lead.next_action_date)
          : "none"

  const nextClass =
    followUpStatus === "overdue" ? "kb-pill--crit" : followUpStatus === "today" ? "kb-pill--warn" : "kb-pill--info"
  // Full follow-up label ("1st Follow-Up" …); non-FU actions pass through unchanged.
  // Canonical Guest Card Primary Next Action presentation (shared with Agenda /
  // workspace / Companion): 2+ outstanding genuine-Favorite Guest Cards aggregate to
  // "Send Guest Cards". Single/non-guest-card actions keep their normal label.
  const gcPrimary =
    rankedPrimary?.manualAction && Array.isArray(favorites)
      ? resolveGuestCardPrimary(lead.id, rankedPrimary.manualAction, Array.isArray(nextActions) ? nextActions : [], favorites)
      : null
  const actionLabel = gcPrimary?.aggregate ? gcPrimary.title : formatWorkflowActionLabel(action)
  const nextText = `${actionLabel}${followUpStatus === "today" ? " · Today" : followUpStatus === "overdue" ? " · Overdue" : ""}`


  // ─── Archive reason badge (archived leads only) ────────────────────────
  const archiveBadgeLabel =
    lead.crm_status === "archived" ? getArchiveReasonBadgeLabel(lead.archive_reason) : null

  // New leads not yet worked pulse gently until contacted.
  const isFresh = lead.crm_status === "new"

  // Keep the Approval + Next Action badges as large as possible: try full size,
  // then step down padding → radius → font (data-fit 0→4). The row never wraps
  // — if even the most aggressive tier overflows, it stays at tier 4 on a
  // single line. Re-measures whenever the labels change or the column resizes.
  useLayoutEffect(() => {
    const el = badgesRef.current
    if (!el) return

    const refit = () => {
      const tiers = ["0", "1", "2", "3", "4"]
      let chosen = "4"
      for (const tier of tiers) {
        el.dataset.fit = tier
        // scrollWidth > clientWidth means the pills overflow at this tier.
        if (el.scrollWidth <= el.clientWidth + 0.5) {
          chosen = tier
          break
        }
      }
      el.dataset.fit = chosen
    }

    refit()

    // Columns flex to fill available width, so re-fit on width changes only
    // (ignore height changes, which our own wrapping causes — avoids a loop).
    let prevWidth = el.clientWidth
    let raf = 0
    const ro = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      if (Math.abs(width - prevWidth) < 0.5) return
      prevWidth = width
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(refit)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [nextText, approvalLabel, view])

  const dragHandle = (
    <span
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className="kb-drag"
      title="Drag to move"
    >
      <svg width="18" height="7" viewBox="0 0 20 8" fill="currentColor">
        <circle cx="3" cy="2" r="1.4" /><circle cx="10" cy="2" r="1.4" /><circle cx="17" cy="2" r="1.4" />
        <circle cx="3" cy="6" r="1.4" /><circle cx="10" cy="6" r="1.4" /><circle cx="17" cy="6" r="1.4" />
      </svg>
    </span>
  )

  // Quick-archive from the board — same icon as the Lead panel, scaled per
  // density in CSS. Archives immediately (no confirm) like dragging to the
  // Archived column; the archive reason is chosen later in the panel. Hidden
  // for already-archived leads and when no handler is wired (e.g. drag ghost).
  const archiveButton =
    onArchive && lead.crm_status !== "archived" ? (
      <button
        type="button"
        className="kb-archive-btn"
        title="Archive lead"
        aria-label="Archive lead"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onArchive(lead.id)
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="3.5" width="19" height="5" rx="1.2" />
          <path d="M4.5 8.5V19a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V8.5" />
          <path d="M10 12.5h4" />
        </svg>
      </button>
    ) : null

  function nameEl() {
    return (
      <h3 className="kb-nm">
        {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
      </h3>
    )
  }

  // Archive-reason badge on its own line (all density modes), placed beneath
  // the phone number rather than crammed next to the name.
  function archiveLine() {
    if (!archiveBadgeLabel) return null
    return (
      <div className="kb-archive-line">
        <span className="kb-pill kb-pill--neutral">{archiveBadgeLabel}</span>
      </div>
    )
  }

  // Phone number on the left; the quick utility actions (Archive, Copy) grouped
  // together on the right of the same row — kept away from the drag handle,
  // which stays alone in the top-right corner for reordering.
  function phoneRow() {
    if (!lead.phone && !archiveButton) return null
    return (
      <div className="kb-phone-row">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="kb-phone">
            {formatPhone(lead.phone)}
          </a>
        )}
        {/* Copy sits immediately beside the phone number it refers to; the
            Archive icon is a separate action to its right. Same order in every
            density (Overview/Compact/Detailed). */}
        <span className="kb-card-tools">
          {lead.phone && (
            <button type="button" onClick={copyPhone} className={`kb-copy${copied ? " kb-copy--done" : ""}`}>
              {copied ? "✓" : "Copy"}
            </button>
          )}
          {archiveButton}
        </span>
      </div>
    )
  }

  // The one card interior, shared by every density mode — same layout, panel,
  // padding, typography and hierarchy; only the fields differ.
  //   Detailed: City, Budget, Property, Move Date, Credit, Source + Approval + Next
  //   Compact:  City, Budget, Move Date, Credit               + Approval + Next
  //   Overview: City, Move Date                               + Approval + Next
  function cardBody(kind: "detailed" | "compact" | "overview") {
    const twoFields = kind === "overview" // City + Move Date only
    const extras = kind === "detailed" // Property + Source rows
    return (
      <>
        {nameEl()}
        {phoneRow()}
        {archiveLine()}
        {/* Canonical order (subset of the panel): City, Budget, Income,
            Property, Move Date, Credit, Source. Each row shows only when the
            lead has that saved value — no "—" / "Not listed" / "$0" rows.
            Income (SmartLead Form Monthly Household Income) sits directly after
            Budget, on the layouts that show Budget (detailed + compact). */}
        <div className="kb-grid">
          {hasValue(lead.city) && (
            <div className="kb-row">
              <span className="kb-k">City</span>
              <span className="kb-v">{lead.city}</span>
            </div>
          )}
          {!twoFields && hasValue(lead.desired_rent) && (
            <div className="kb-row">
              <span className="kb-k">Budget</span>
              <span className="kb-v">{formatRent(lead.desired_rent)}</span>
            </div>
          )}
          {!twoFields && hasValue(lead.income) && (
            <div className="kb-row">
              <span className="kb-k">Income</span>
              <span className="kb-v">{lead.income}</span>
            </div>
          )}
          {extras && hasValue(lead.property_type) && (
            <div className="kb-row">
              <span className="kb-k">Property</span>
              <span className="kb-v">{lead.property_type}</span>
            </div>
          )}
          {hasValue(lead.move_date) && (
            <div className="kb-row">
              <span className="kb-k">Move Date</span>
              <span className="kb-v">{formatDateDisplay(lead.move_date)}</span>
            </div>
          )}
          {!twoFields && hasValue(lead.credit_score) && (
            <div className="kb-row">
              <span className="kb-k">Credit</span>
              <span className="kb-v">{lead.credit_score}</span>
            </div>
          )}
          {extras && hasValue(lead.source) && (
            <div className="kb-row">
              <span className="kb-k">Source</span>
              <LeadSourceBadge source={lead.source} className="text-[11px] px-2 py-0.5" />
            </div>
          )}
        </div>
        <div className={`kb-badges${onHold ? " kb-badges--hold" : ""}`} data-fit="0" ref={badgesRef}>
          {/* Overview is intentionally narrow: a held card drops the Approval badge
              there (Follow Up stays) so the two actions fit side-by-side cleanly.
              Detailed/Compact and all non-held cards keep Approval. */}
          {onHold && view === "overview" ? null : (
            <span className={`kb-pill ${approvalClass}`}>{approvalLabel}</span>
          )}
          {/* Next Action pill — occupies the same slot in all three states:
              • On Hold  → the useful hold state ("Follow Up · 10/05/2026"), not an action.
              • Archived → nothing (an archived lead has no active action expected —
                the archive reason already shows on its own line above).
              • Active   → the canonical ranked Next Action, as before. */}
          {onHold ? (
            <span className="kb-pill kb-pill--push kb-pill--neutral" title={`Follow Up · ${formatHoldFollowUpNumeric(lead.hold_follow_up_at)}`}>
              Follow Up{lead.hold_follow_up_at ? ` · ${formatHoldFollowUpNumeric(lead.hold_follow_up_at)}` : ""}
            </span>
          ) : lead.crm_status === "archived" ? null : (
            <span className={`kb-pill kb-pill--push ${nextClass}`} title={nextText}>{nextText}</span>
          )}
        </div>
        {/* Resume / Reschedule for a held card (Inactive → On Hold tab only). */}
        {onHold && (onResumeHold || onRescheduleHold) && (
          <HoldControls
            leadId={lead.id}
            followUpAt={lead.hold_follow_up_at}
            onResume={onResumeHold}
            onReschedule={onRescheduleHold}
          />
        )}
      </>
    )
  }

  // ─── Density modes: Detailed / Compact / Overview (one full card) ─────────
  const cardClass = [
    "kb-card",
    isSelected ? "kb-card--selected" : "",
    isActiveClient ? "kb-card--active-client" : "",
    isFresh ? "kb-fresh" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article ref={setNodeRef} {...attributes} style={style} onClick={() => onSelect?.(lead.id)} className={cardClass}>
      {draggable && dragHandle}
      <div className="kb-card-pad">{cardBody(view)}</div>
    </article>
  )
}
