"use client"

import { useDraggable } from "@dnd-kit/core"
import { getNextAction } from "@/lib/nextAction"
import { supabase } from "@/lib/supabase/client"
import { useState } from "react"

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  if (!phone) return ""
  const cleaned = phone.replace(/\D/g, "")
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/)
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`
  return phone
}

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

// ─── Source badge styles ─────────────────────────────────────────────────────

const SOURCE_STYLES: Record<string, string> = {
  tiktok:    "bg-amber-50 text-amber-700 border-amber-200",
  instagram: "bg-purple-50 text-purple-700 border-purple-200",
  facebook:  "bg-blue-50 text-blue-700 border-blue-200",
  youtube:   "bg-red-50 text-red-700 border-red-200",
  website:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  referral:  "bg-orange-50 text-orange-700 border-orange-200",
  direct:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual:    "bg-gray-50 text-gray-600 border-gray-200",
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadCard({ lead, isSelected, onSelect }: any) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: String(lead.id),
  })

  const style = {
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px)`
      : undefined,
    transition: transform ? "none" : "transform 200ms ease",
    zIndex: transform ? 50 : ("auto" as const),
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

  const riskLabel = isHighRisk ? "High Risk" : isMediumRisk ? "Med Risk" : "Low Risk"
  const riskClass = isHighRisk
    ? "bg-red-50 text-red-600 border-red-200"
    : isMediumRisk
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200"

  // ─── Close probability ──────────────────────────────────────────────────

  const CLOSE_MAP: Record<string, number> = {
    new: 10, contacted: 20, qualified: 35, list_sent: 50,
    ready_to_tour: 65, done_touring: 80, applied: 95, closed: 100,
  }
  const closePct = CLOSE_MAP[lead.crm_status] ?? 0

  // ─── Follow-up action ───────────────────────────────────────────────────

  const action = getNextAction(lead)
  const followUpStatus = lead.next_action_date
    ? getFollowUpStatus(lead.next_action_date)
    : "none"

  const isHot = ["done_touring", "applied", "closed"].includes(lead.crm_status)

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={style}
      onClick={() => onSelect?.(lead.id)}
      className={[
        "group relative bg-white rounded-2xl border select-none cursor-pointer",
        "transition-all duration-150",
        "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:border-blue-200",
        "active:scale-[0.99]",
        isSelected
          ? "border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.2),0_4px_16px_rgba(0,0,0,0.08)]"
          : "border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
        transform ? "scale-[1.02] shadow-2xl border-blue-400" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag handle strip */}
      <div
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 left-0 right-0 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"
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

      <div className="px-3 pt-3 pb-2.5">

        {/* Name row */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className="text-[13.5px] font-bold text-gray-900 leading-tight tracking-tight">
            {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
          </p>
          {isHot && (
            <span className="flex-none text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-red-50 text-red-600 border border-red-200 whitespace-nowrap mt-0.5">
              HOT
            </span>
          )}
        </div>

        {/* Phone */}
        {lead.phone && (
          <div className="flex items-center gap-1.5 mb-2">
            <a
              href={`sms:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[12px] font-medium text-blue-600 hover:underline"
            >
              {formatPhone(lead.phone)}
            </a>
            <button
              type="button"
              onClick={copyPhone}
              className={[
                "text-[9.5px] font-medium px-1.5 py-px rounded border transition-colors",
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
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 space-y-1 text-[11.5px] mb-2">
          <div className="flex justify-between leading-[1.35]">
            <span className="text-gray-400">City</span>
            <span className="font-medium text-gray-800">{lead.city || "—"}</span>
          </div>
          <div className="flex justify-between leading-[1.35]">
            <span className="text-gray-400">Budget</span>
            <span className="font-medium text-gray-800">{formatRent(lead.desired_rent)}</span>
          </div>
          <div className="flex justify-between leading-[1.35]">
            <span className="text-gray-400">Property</span>
            <span className="font-medium text-gray-800">{lead.property_type || "—"}</span>
          </div>
          <div className="flex justify-between leading-[1.35]">
            <span className="text-gray-400">Move Date</span>
            <span className="font-medium text-gray-800">{formatDate(lead.move_date) || "—"}</span>
          </div>
          <div className="flex justify-between leading-[1.35]">
            <span className="text-gray-400">Credit</span>
            <span className="font-medium text-gray-800">{lead.credit_score || "—"}</span>
          </div>
          {lead.source && (
            <div className="flex justify-between items-center leading-[1.35]">
              <span className="text-gray-400">Source</span>
              <span
                className={[
                  "text-[10px] font-semibold px-1.5 py-px rounded-full border",
                  SOURCE_STYLES[lead.source] ?? "bg-gray-50 text-gray-600 border-gray-200",
                ].join(" ")}
              >
                {lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}
              </span>
            </div>
          )}
        </div>

        {/* Badge row */}
        <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
          <span
            className={[
              "text-[10px] font-semibold px-1.5 py-px rounded-full border whitespace-nowrap flex-none",
              riskClass,
            ].join(" ")}
          >
            {riskLabel}
          </span>

          <span className="text-[10px] font-semibold px-1.5 py-px rounded-full border bg-violet-50 text-violet-700 border-violet-200 whitespace-nowrap flex-none">
            {closePct}%
          </span>

          <span
            className={[
              "text-[10px] font-semibold px-1.5 py-px rounded-full border ml-auto whitespace-nowrap flex-none",
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
    </div>
  )
}
