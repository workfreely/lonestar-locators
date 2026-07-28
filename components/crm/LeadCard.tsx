"use client"

import { useDraggable } from "@dnd-kit/core"
import { getNextAction } from "@/lib/nextAction"
import { useState, useRef, useLayoutEffect } from "react"
import { formatPhone } from "@/lib/utils/formatPhone"
import LeadSourceBadge from "./LeadSourceBadge"
import { inferMarketFromLandingPage } from "@/lib/leads/inferMarketFromLandingPage"
import { getArchiveReasonBadgeLabel } from "@/lib/leads/archiveReasons"

function normalizeName(name: string) {
  if (!name) return ""
  return name
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDate(date: string) {
  if (!date) return ""
  return new Date(date).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
}

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
  isSelected,
  onSelect,
  onArchive,
  view = "detailed",
}: any) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: String(lead.id),
  })

  // Original card is hidden while dragging — the DragOverlay renders the copy.
  const style: React.CSSProperties = {
    opacity: transform ? 0 : undefined,
  }

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
  const action = getNextAction(lead)
  const followUpStatus =
    lead.next_action_date && lead.crm_status !== "archived"
      ? getFollowUpStatus(lead.next_action_date)
      : "none"

  const nextClass =
    followUpStatus === "overdue" ? "kb-pill--crit" : followUpStatus === "today" ? "kb-pill--warn" : "kb-pill--info"
  const nextText = `${action}${followUpStatus === "today" ? " · Today" : followUpStatus === "overdue" ? " · Overdue" : ""}`

  // ─── Short-form market inference (display only) ─────────────────────────
  const inferredMarket =
    lead.lead_type === "short" && !lead.city ? inferMarketFromLandingPage(lead.landing_page) : null

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
        <span className="kb-card-tools">
          {archiveButton}
          {lead.phone && (
            <button type="button" onClick={copyPhone} className={`kb-copy${copied ? " kb-copy--done" : ""}`}>
              {copied ? "✓" : "Copy"}
            </button>
          )}
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
        <div className="kb-grid">
          <div className="kb-row">
            <span className="kb-k">{inferredMarket ? "Interest" : "City"}</span>
            <span className="kb-v">{inferredMarket || lead.city || "—"}</span>
          </div>
          {!twoFields && (
            <div className="kb-row">
              <span className="kb-k">Budget</span>
              <span className="kb-v">{formatRent(lead.desired_rent)}</span>
            </div>
          )}
          {extras && (
            <div className="kb-row">
              <span className="kb-k">Property</span>
              <span className="kb-v">{lead.property_type || "—"}</span>
            </div>
          )}
          <div className="kb-row">
            <span className="kb-k">Move Date</span>
            <span className="kb-v">{formatDate(lead.move_date) || "—"}</span>
          </div>
          {!twoFields && (
            <div className="kb-row">
              <span className="kb-k">Credit</span>
              <span className="kb-v">{lead.credit_score || "—"}</span>
            </div>
          )}
          {extras && lead.source && (
            <div className="kb-row">
              <span className="kb-k">Source</span>
              <LeadSourceBadge source={lead.source} className="text-[11px] px-2 py-0.5" />
            </div>
          )}
        </div>
        <div className="kb-badges" data-fit="0" ref={badgesRef}>
          <span className={`kb-pill ${approvalClass}`}>{approvalLabel}</span>
          <span className={`kb-pill kb-pill--push ${nextClass}`}>{nextText}</span>
        </div>
      </>
    )
  }

  // ─── Density modes: Detailed / Compact / Overview (one full card) ─────────
  const cardClass = ["kb-card", isSelected ? "kb-card--selected" : "", isFresh ? "kb-fresh" : ""]
    .filter(Boolean)
    .join(" ")

  return (
    <article ref={setNodeRef} {...attributes} style={style} onClick={() => onSelect?.(lead.id)} className={cardClass}>
      {dragHandle}
      <div className="kb-card-pad">{cardBody(view)}</div>
    </article>
  )
}
