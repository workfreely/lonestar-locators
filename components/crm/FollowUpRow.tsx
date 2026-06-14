"use client"

function isDue(date: string | null) {
  if (!date) return false
  const today = new Date()
  const followUp = new Date(date)
  today.setHours(0, 0, 0, 0)
  followUp.setHours(0, 0, 0, 0)
  return followUp.getTime() <= today.getTime()
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
  if (!rent) return ""
  const matches = rent.match(/\d[\d,]*/g)
  if (!matches) return ""
  const nums = matches.map((v) => Number(v.replace(/,/g, ""))).filter((n) => !Number.isNaN(n))
  if (nums.length >= 2) return `$${nums[0].toLocaleString()} – $${nums[1].toLocaleString()}`
  if (nums.length === 1) return `$${nums[0].toLocaleString()}`
  return ""
}

export default function FollowUpRow({
  leads,
  onSelectLead,
}: {
  leads: any[]
  onSelectLead?: (leadId: string | number) => void
}) {
  const dueLeads = leads.filter(
    (lead) => isDue(lead.next_action_date) && lead.crm_status !== "closed"
  )

  return (
    <div className="flex flex-col h-full">

      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-xs font-semibold text-white/80 uppercase tracking-widest">
          Follow-Ups
        </h2>
        {dueLeads.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {dueLeads.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">

        {dueLeads.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3.5 3.5L12 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-xs text-white/40 leading-snug">All caught up</p>
          </div>
        )}

        {dueLeads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => onSelectLead?.(lead.id)}
            className="group relative bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2.5
              cursor-pointer transition-all duration-200
              hover:bg-white/15 hover:border-blue-400/40 hover:-translate-y-0.5
              hover:shadow-[0_4px_16px_rgba(59,130,246,0.22),0_8px_24px_rgba(0,0,0,0.22)]"
          >
            {/* Left accent line indicating urgency */}
            <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-red-400" />

            <div className="pl-2">
              <p className="text-sm font-semibold text-white leading-tight">
                {lead.first_name} {lead.last_name}
              </p>

              <p className="text-[11px] text-white/55 mt-0.5">
                {lead.city}
                {lead.desired_rent && <> · {formatRent(lead.desired_rent)}</>}
              </p>

              {lead.move_date && (
                <p className="text-[11px] text-white/70 font-medium mt-1">
                  Moves {formatDate(lead.move_date)}
                </p>
              )}

              <p className="text-[10.5px] text-red-300 font-semibold mt-1.5">
                Follow-up due
              </p>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
