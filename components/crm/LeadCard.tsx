"use client"

import { useDraggable } from "@dnd-kit/core"
import { getNextAction } from "@/lib/nextAction"
import { supabase } from "@/lib/supabase/client"
import { useState } from "react"


export default function LeadCard({ lead, isSelected, onSelect }: any) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: String(lead.id),
  })

 const style = {
  transform: transform
    ? `translate(${transform.x}px, ${transform.y}px)`
    : undefined,
  transition: transform ? "none" : "transform 200ms ease",
  zIndex: transform ? 50 : "auto",
}

  const [followUps, setFollowUps] = useState(lead.follow_up_count || 0)
  const [copied, setCopied] = useState(false)

function formatPhone(phone: string) {
  if (!phone) return ""
  const cleaned = phone.replace(/\D/g, "")
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/)
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`
  return phone
}

// ✅ NORMALIZE NAMES
function normalizeName(name: string) {
  if (!name) return ""

  return name
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ")
}

async function copyPhone(e: any) {
    e.preventDefault()
    e.stopPropagation()

    if (!lead.phone) return

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(lead.phone)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = lead.phone
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }

      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("Copy failed:", err)
    }
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
    if (!rent) return "Rent not listed"

    const matches = rent.match(/\d[\d,]*/g)
    if (!matches || matches.length === 0) return "Rent not listed"

    const formatted = matches.map((value) => {
      const number = Number(value.replace(/,/g, ""))
      if (Number.isNaN(number)) return null
      return `$${number.toLocaleString()}`
    })

    const valid = formatted.filter(Boolean)

    if (valid.length >= 2) return `${valid[0]} - ${valid[1]}`
    return valid[0]
  }

  async function handleFollowUpClick(e: any) {
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

  function getFollowUpColor() {
    if (followUps === 0) return "text-gray-500"
    if (followUps === 1) return "text-yellow-500"
    if (followUps === 2) return "text-orange-500"
    if (followUps >= 3) return "text-red-500"
    return "text-gray-500"
  }

  const sourceStyles: Record<string, string> = {
  tiktok: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  instagram: "bg-purple-100 text-purple-800 border border-purple-200",
  facebook: "bg-blue-100 text-blue-800 border border-blue-200",
  youtube: "bg-red-100 text-red-800 border border-red-200",
  website: "bg-green-100 text-green-800 border border-green-200",
  referral: "bg-orange-100 text-orange-800 border border-orange-200",
  direct: "bg-gray-100 text-gray-700 border border-gray-200",
  manual: "bg-zinc-100 text-zinc-800 border border-zinc-200",
}

  function getStatusStyles(status: string) {
    switch (status) {
      case "new":
        return "bg-yellow-100 text-yellow-800"
      case "contacted":
        return "bg-blue-100 text-blue-800"
      case "qualified":
        return "bg-purple-100 text-purple-800"
      case "list_sent":
        return "bg-green-100 text-green-800"
      case "touring":
        return "bg-orange-100 text-orange-800"
      case "applied":
        return "bg-gray-200 text-gray-800"
      case "closed":
        return "bg-emerald-100 text-emerald-800"
      default:
        return "bg-gray-100 text-gray-700"
    }
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
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={style}
      onClick={() => onSelect?.(lead.id)}
      className={`rounded-[28px] bg-white border border-gray-200
shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-200 px-5 py-4 mb-1.5
hover:-translate-y-[2px]
hover:shadow-[0_0_35px_rgba(59,130,246,0.35),0_10px_25px_rgba(0,0,0,0.08)]
hover:ring-1 hover:ring-blue-300/50
active:scale-[0.98]
${
       isSelected
  ? "shadow-[0_0_0_2px_rgba(59,130,246,0.3),0_6px_18px_rgba(0,0,0,0.06)]"
  : ""} ${transform ? "scale-[1.02] shadow-2xl ring-2 ring-blue-400/60" : ""}
      }`}
    >
      {/* DRAG HANDLE */}
      <div
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 text-xs mb-[2px] hover:text-gray-600"
        onClick={(e) => e.stopPropagation()}
      >
        ⋮⋮
      </div>

      {/* ✅ INDENT WRAPPER (FIXED) */}
      <div className="pl-4">

        {/* NAME + HOT BADGE */}
<div className="flex items-center gap-2 text-[20px] font-black tracking-tight text-gray-900 leading-tight">
  <span>
   {normalizeName(lead.first_name)}{" "}
{normalizeName(lead.last_name)}
  </span>

  {["done_touring", "applied", "closed"].includes(lead.crm_status) && (
    <span className="text-[10px] px-2 py-[2px] rounded-full bg-red-50 text-red-700 border border-red-100 font-semibold">
      🔥 HOT
    </span>
  )}
</div>

        {/* PHONE */}
        {lead.phone && (
          <div className="flex items-center gap-1.5 mt-[2px] mb-1">
            <a
              href={`sms:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[15px] font-semibold tracking-tight text-blue-600 hover:underline"
            >
              📱 {formatPhone(lead.phone)}
            </a>

            <button
              type="button"
              onClick={copyPhone}
              className={`text-[11px] px-2 py-[2px] rounded-xl transition ${
                copied
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200 border border-gray-200"
              }`}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        )}

        {/* INFO */}
        <div className="mt-2 bg-[#f8fafc] border border-gray-200 rounded-2xl
shadow-[0_1px_4px_rgba(0,0,0,0.03)] px-3 py-2 text-[14px]">
          <div>
            <span className="text-gray-500">City:</span>{" "}
            <span className="font-medium text-gray-900">
              {lead.city || "—"}
            </span>
          </div>

          <div className="mt-1.5">
            <span className="text-gray-500">Budget:</span>{" "}
            <span className="font-medium text-gray-900">
              {formatRent(lead.desired_rent)}
            </span>
          </div>

          <div className="mt-1.5">
            <span className="text-gray-500">Move Date:</span>{" "}
            <span className="font-medium text-gray-900">
              {formatDate(lead.move_date)}
            </span>
          </div>

          <div className="mt-1.5">
            <span className="text-gray-500">Credit Score:</span>{" "}
            <span className="font-medium text-gray-900">
              {lead.credit_score || "—"}
            </span>
          </div>
  {lead.source && (
  <div className="mt-1.5 flex items-center gap-2">
    <span className="text-gray-500">Source:</span>
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold leading-none ${
        sourceStyles[lead.source] || "bg-gray-100 text-gray-700"
      }`}
    >
      {lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}
    </span>
  </div>
)}
        </div>


       {/* RISK + CLOSE % */}
<div className="mt-2 flex items-center gap-2 text-[11px]">

  {/* CREDIT RISK */}
<>

  {(() => {
    const credit = Number(lead.credit_score || 0)

    const history = String(
      lead.credit_history || ""
    ).toLowerCase()

    const hasBrokenLease =
      history.includes("broken")

    const hasEviction =
      history.includes("eviction")

    const hasFelony =
      lead.criminal_background === "Felony"

    // 🚨 HIGH RISK
    if (
      credit < 500 ||
      hasEviction ||
      hasFelony
    ) {
      return (
        <span className="bg-red-100 text-red-700 px-2 py-[2px] rounded-full whitespace-nowrap">
          High Risk
        </span>
      )
    }

    // ⚠️ MEDIUM RISK
    if (
      credit < 620 ||
      hasBrokenLease
    ) {
      return (
        <span className="bg-yellow-100 text-yellow-700 px-2 py-[2px] rounded-full whitespace-nowrap">
          Medium Risk
        </span>
      )
    }

    // ✅ LOW RISK
    return (
      <span className="bg-green-100 text-green-700 px-2 py-[2px] rounded-full whitespace-nowrap">
        Low Risk
      </span>
    )
  })()}
</>

  {/* CLOSE PERCENT */}
  {(() => {
    const map: Record<string, number> = {
      new: 10,
      contacted: 20,
      qualified: 35,
      list_sent: 50,
      ready_to_tour: 65,
      done_touring: 80,
      applied: 95,
      closed: 100,
    }

    const percent = map[lead.crm_status] || 0

    return (
      <span className="bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2 py-[2px] rounded-full font-medium flex items-center gap-1">
  <span className="text-[10px] opacity-70">Close Ratio</span>
  <span>{percent}%</span>
</span>
    )
  })()}

</div>

        {/* STATUS */}
        <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
          <span className="px-2 py-[2px] rounded-full font-medium bg-yellow-50 text-yellow-700 border border-yellow-100">
            {formatStatus(lead.crm_status)}
          </span>

          {(() => {
  const action = getNextAction(lead)
  const status = lead.next_action_date
    ? getFollowUpStatus(lead.next_action_date)
    : "none"

  return (
<span className="bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-[2px] rounded-full text-[11px] whitespace-nowrap">
      🔥 {action}
      {status === "today" && " • Today"}
      {status === "overdue" && " • Overdue"}
    </span>
  )
})()}
        </div>

      </div>
    </div>
  )
}