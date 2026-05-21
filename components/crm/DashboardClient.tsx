"use client"

import { useState } from "react"
import FollowUpRow from "./FollowUpRow"
import LeadBoard from "./LeadBoard"
import LeadPanel from "./LeadPanel"
import LeadInsights from "./LeadInsights"

export default function DashboardClient({ leads }: { leads: any[] }) {
  const [selectedLeadId, setSelectedLeadId] = useState<
    string | number | null
  >(null)

  const [topMatches, setTopMatches] = useState<any[]>([])
  const [localLeads, setLocalLeads] = useState(leads)
  const totalLeads = localLeads.length
const pipelineValue = totalLeads * 1000

  const selectedLead = localLeads.find(
    (l) => String(l.id) === String(selectedLeadId)
  )

  return (
   <div className="relative h-screen w-full">

      {/* 🌆 BACKGROUND IMAGE (ONLY THIS GETS FILTERS) */}
      <div
        className="absolute inset-0 bg-cover bg-center brightness-125 contrast-110"
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg')",
        }}
      />

      {/* 🌑 LIGHT OVERLAY (NOT TOO DARK) */}
      <div className="absolute inset-0 bg-black/20" />

      {/* PIPELINE VALUE */}
<div className="absolute top-[-55px] right-10 z-30">
<div className="bg-white border border-gray-200 shadow-[0_6px_20px_rgba(0,0,0,0.06)] rounded-full px-6 py-3 flex items-center gap-4">

   <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold whitespace-nowrap">
  Pipeline Value:
</div>

<div className="text-2xl font-black text-green-600 leading-none whitespace-nowrap">
  ${pipelineValue.toLocaleString()}
</div>

<div className="h-5 w-px bg-gray-200" />

<div className="text-sm text-gray-500 whitespace-nowrap">
  {totalLeads} active leads
</div>

  </div>
</div>

      {/* 🚀 APP CONTENT (NOT AFFECTED BY FILTERS) */}
      <div className="relative z-10 flex h-screen w-full overflow-hidden">

        {/* LEFT SIDEBAR */}
     <div className="w-[220px] min-w-[220px] border-r border-gray-200 bg-white overflow-y-auto z-10 shadow-[6px_0_20px_rgba(0,0,0,0.06)]">
          <FollowUpRow
            leads={localLeads}
            onSelectLead={setSelectedLeadId}
          />
        </div>

        {/* MAIN BOARD */}
        <div
  className={`flex-1 overflow-hidden relative ${
    selectedLead ? "hidden" : "block"
  }`}
>


  
  <LeadBoard
    leads={localLeads}
    setLeads={setLocalLeads}
    selectedLeadId={selectedLeadId}
    onSelectLead={setSelectedLeadId}
  />

</div>

        {/* OVERLAY PROFILE VIEW */}
        {selectedLead && (
          <div className="absolute top-0 bottom-0 left-[220px] right-0 flex pointer-events-none">

            {/* MAIN PROFILE */}
            <div className="flex w-full bg-white border-l shadow-xl h-full">

              {/* LEAD PANEL */}
          <div className="w-[420px] border-r border-gray-200 bg-white overflow-y-auto pointer-events-auto shadow-[8px_0_30px_rgba(0,0,0,0.08)] relative z-20">
                <LeadPanel
                  lead={selectedLead}
                  topMatches={topMatches}
                  onClose={() => setSelectedLeadId(null)}
                  onUpdateLead={(updatedLead) => {
                    setLocalLeads((prev) =>
                      prev.map((l) =>
                        l.id === updatedLead.id ? updatedLead : l
                      )
                    )
                  }}
                />
              </div>

              {/* INSIGHTS PANEL */}
             <div className="flex-1 bg-[#f4f6f8] p-6 overflow-y-auto pointer-events-auto">
                <LeadInsights
                  lead={selectedLead}
                  onMatchesChange={setTopMatches}
                />
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  )
}