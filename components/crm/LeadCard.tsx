"use client"

import { useDraggable } from "@dnd-kit/core"
import { getNextAction } from "@/lib/nextAction"
import { supabase } from "@/lib/supabase/client"
import { useState } from "react"
import { formatPhone } from "@/lib/utils/formatPhone"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
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

function formatStatus(status: string) {
  if (!status) return "New"
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadCard({ lead, isSelected, onSelect, view = "detailed" }: any) {
  const compact = view === "compact"
  const overview = view === "overview"
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: String(lead.id),
  })

  const style = {
    opacity: transform ? 0 : undefined,
    transition: transform ? "none" : "transform 200ms ease",
  }

  const [followUps, setFollowUps] = useState(lead.follow_up_count || 0)
  const [copied, setCopied] = useState(false)

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

  async function handleFollowUpClick(e: React.MouseEvent) {
    e.stopPropagation()
    const nextValue = followUps >= 3 ? 0 : followUps + 1
    setFollowUps(nextValue)
    const { error } = await supabase
      .from("leads")
      .update({ follow_up_count: nextValue })
      .eq("id", lead.id)
    if (error) {
      console.error("Follow-up update error:", error)
      alert("Could not update follow-up count")
    }
  }

  // ─── Risk classification ────────────────────────────────────────────────

  const credit = Number(lead.credit_score || 0)
  const history = String(lead.credit_history || "").toLowerCase()
  const hasBrokenLease = history.includes("broken")
  const hasEviction = history.includes("eviction")
  const hasFelony = lead.criminal_background === "Felony"

  const isHighRisk = credit < 500 || hasEviction || hasFelony
  const isMediumRisk = !isHighRisk && (credit < 620 || hasBrokenLease)

  // Same underlying risk calculation as before — only the display label is
  // inverted to "Approval" framing (high risk reads as low approval odds).
  const approvalLabel = isHighRisk ? "Low Approval" : isMediumRisk ? "Medium Approval" : "High Approval"
  const riskClass = isHighRisk
    ? "bg-red-50 text-red-600 border-red-200"
    : isMediumRisk
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200"

  // ─── Follow-up action ───────────────────────────────────────────────────

  const action = getNextAction(lead)
  // Archived leads are out of the active workflow — never show an
  // urgency badge for them, regardless of a possibly-stale next_action_date.
  const followUpStatus = lead.next_action_date && lead.crm_status !== "archived"
    ? getFollowUpStatus(lead.next_action_date)
    : "none"

  // ─── Short-form market inference (display only) ────────────────────────
  const inferredMarket =
    lead.lead_type === "short" && !lead.city
      ? inferMarketFromLandingPage(lead.landing_page)
      : null

  // ─── Archive reason badge (archived leads only) ────────────────────────
  const archiveBadgeLabel =
    lead.crm_status === "archived"
      ? getArchiveReasonBadgeLabel(lead.archive_reason)
      : null

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={style}
      onClick={() => onSelect?.(lead.id)}
      className={[
        "group relative bg-white rounded-2xl border select-none cursor-pointer",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(59,130,246,0.13),0_8px_28px_rgba(0,0,0,0.10)] hover:border-blue-300",
        "active:scale-[0.99]",
        isSelected
          ? "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.30),0_6px_24px_rgba(59,130,246,0.18)]"
          : "border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag handle strip */}
      <div
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 w-10 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-tr-2xl opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to move"
      >
        <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="text-gray-300">
          <circle cx="4"  cy="2" r="1.5" fill="currentColor"/>
          <circle cx="10" cy="2" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="2" r="1.5" fill="currentColor"/>
          <circle cx="4"  cy="6" r="1.5" fill="currentColor"/>
          <circle cx="10" cy="6" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="6" r="1.5" fill="currentColor"/>
        </svg>
      </div>

      {overview ? (
        <div className="px-2 pt-1.5 pb-1.5">
          {/* Name row — archive badge kept (an important at-a-glance
              signal), HOT badge removed everywhere per the current spec. */}
          <div className="flex items-start justify-between gap-1.5 mb-0">
            <p className="text-[13px] font-bold text-gray-900 leading-tight tracking-tight truncate">
              {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
            </p>
            {archiveBadgeLabel && (
              <span className="flex-none text-[8.5px] font-semibold px-1 py-px rounded-full bg-slate-100 text-slate-600 border border-slate-300 whitespace-nowrap">
                {archiveBadgeLabel}
              </span>
            )}
          </div>

          {/* Phone — plain link, no Copy control (not one of the five
              things Overview is meant to show). */}
          {lead.phone && (
            <div className="mb-1">
              <a
                href={`sms:${lead.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] font-medium text-blue-600 hover:underline"
              >
                {formatPhone(lead.phone)}
              </a>
            </div>
          )}

          {/* City / Move / Next — same label-left, value-right row
              convention as the Detailed/Compact info grid, just three
              rows instead of five or six, and tighter to maximize how
              many cards/columns fit on screen at once. */}
          <div className="bg-gray-50 border border-gray-100 rounded-lg px-1.5 py-1 space-y-0.5 text-[10px]">
            <div className="flex justify-between leading-[1.2]">
              <span className="text-gray-400">{inferredMarket ? "Interest" : "City"}</span>
              <span className="font-medium text-gray-800 truncate ml-1">{inferredMarket || lead.city || "—"}</span>
            </div>
            <div className="flex justify-between leading-[1.2]">
              <span className="text-gray-400">Move</span>
              <span className="font-medium text-gray-800 truncate ml-1">{formatDate(lead.move_date) || "—"}</span>
            </div>
            <div className="flex justify-between leading-[1.2]">
              <span className="text-gray-400">Next</span>
              <span className="font-medium text-gray-800 truncate ml-1">{action}</span>
            </div>
          </div>
        </div>
      ) : (
      <div className={compact ? "px-2 pt-2 pb-1.5" : "px-3 pt-3 pb-2.5"}>

        {/* Name row */}
        <div className={`flex items-start justify-between gap-2 ${compact ? "mb-0" : "mb-0.5"}`}>
          <p className={[
            "font-bold text-gray-900 leading-tight tracking-tight",
            compact ? "text-[13px]" : "text-[16px]",
          ].join(" ")}>
            {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
          </p>
          {archiveBadgeLabel && (
            <span className={[
              "flex-none font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-300 whitespace-nowrap mt-0.5",
              compact ? "text-[8.5px] px-1 py-px" : "text-[9.5px] px-1.5 py-px",
            ].join(" ")}>
              {archiveBadgeLabel}
            </span>
          )}
        </div>

        {/* Phone */}
        {lead.phone && (
          <div className={`flex items-center gap-1.5 ${compact ? "mb-1" : "mb-2"}`}>
            <a
              href={`sms:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className={compact ? "text-[12px] font-medium text-blue-600 hover:underline" : "text-[14px] font-medium text-blue-600 hover:underline"}
            >
              {formatPhone(lead.phone)}
            </a>
            <button
              type="button"
              onClick={copyPhone}
              className={[
                "font-medium rounded border transition-colors",
                compact ? "text-[9px] px-1 py-px" : "text-[9.5px] px-1.5 py-px",
                copied
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100",
              ].join(" ")}
            >
              {copied ? "✓" : "Copy"}
            </button>
          </div>
        )}

        {/* Info grid */}
        <div className={[
          "bg-gray-50 border border-gray-100 rounded-lg",
          compact ? "px-2 py-1 space-y-0.5 text-[10px] mb-1.5" : "px-2.5 py-1.5 space-y-1 text-[11.5px] mb-2",
        ].join(" ")}>
          <div className={`flex justify-between ${compact ? "leading-[1.2]" : "leading-[1.35]"}`}>
            <span className="text-gray-400">{inferredMarket ? "Interest" : "City"}</span>
            <span className="font-medium text-gray-800">{inferredMarket || lead.city || "—"}</span>
          </div>
          <div className={`flex justify-between ${compact ? "leading-[1.2]" : "leading-[1.35]"}`}>
            <span className="text-gray-400">Budget</span>
            <span className="font-medium text-gray-800">{formatRent(lead.desired_rent)}</span>
          </div>
          <div className={`flex justify-between ${compact ? "leading-[1.2]" : "leading-[1.35]"}`}>
            <span className="text-gray-400">Property</span>
            <span className="font-medium text-gray-800">{lead.property_type || "—"}</span>
          </div>
          <div className={`flex justify-between ${compact ? "leading-[1.2]" : "leading-[1.35]"}`}>
            <span className="text-gray-400">Move Date</span>
            <span className="font-medium text-gray-800">{formatDate(lead.move_date) || "—"}</span>
          </div>
          <div className={`flex justify-between ${compact ? "leading-[1.2]" : "leading-[1.35]"}`}>
            <span className="text-gray-400">Credit</span>
            <span className="font-medium text-gray-800">{lead.credit_score || "—"}</span>
          </div>
          {lead.source && (
            <div className={`flex justify-between items-center ${compact ? "leading-[1.2]" : "leading-[1.35]"}`}>
              <span className="text-gray-400">Source</span>
              <span
                className={[
                  "font-semibold rounded-full border",
                  compact ? "text-[9px] px-1 py-px" : "text-[10px] px-1.5 py-px",
                  getSourceStyle(lead.source).badgeClassName,
                ].join(" ")}
              >
                {getSourceStyle(lead.source).label}
              </span>
            </div>
          )}
        </div>

        {/* Badge row */}
        <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
          <span
            className={[
              "font-semibold rounded-full border whitespace-nowrap flex-none",
              compact ? "text-[9px] px-1 py-px" : "text-[10px] px-1.5 py-px",
              riskClass,
            ].join(" ")}
          >
            {approvalLabel}
          </span>

          <span
            className={[
              "font-semibold rounded-full border ml-auto whitespace-nowrap flex-none",
              compact ? "text-[9px] px-1 py-px" : "text-[10px] px-1.5 py-px",
              followUpStatus === "overdue"
                ? "bg-red-50 text-red-600 border-red-200"
                : followUpStatus === "today"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-blue-50 text-blue-600 border-blue-200",
            ].join(" ")}
          >
            {action}
            {followUpStatus === "today" && " · Today"}
            {followUpStatus === "overdue" && " · Overdue"}
          </span>
        </div>

      </div>
      )}
    </div>
  )
}
