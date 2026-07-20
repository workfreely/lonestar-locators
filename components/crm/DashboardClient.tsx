"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import FollowUpRow from "./FollowUpRow"
import LeadBoard from "./LeadBoard"
import LeadPanel from "./LeadPanel"
import LeadInsights from "./LeadInsights"
import LeadFormModal from "../LeadFormModal"
import DashboardStats from "./DashboardStats"
import CollapsibleSection from "./CollapsibleSection"

export default function DashboardClient({ leads, nextActions, favorites }: { leads: any[]; nextActions: any[]; favorites: any[] }) {
  const router = useRouter()
  const [selectedLeadId, setSelectedLeadId] = useState<string | number | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("id")
    if (id) setSelectedLeadId(id)
  }, [])

  const [topMatches, setTopMatches] = useState<any[]>([])
  const [localLeads, setLocalLeads] = useState(leads)
  const [localNextActions, setLocalNextActions] = useState(nextActions)
  const [localFavorites, setLocalFavorites] = useState(favorites)
  const [showLeadModal, setShowLeadModal] = useState(false)

  const selectedLead = localLeads.find(
    (l) => String(l.id) === String(selectedLeadId)
  )

  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200">

      {/* ─── TOP NAVIGATION BAR ─── */}
      <header className="relative z-30 flex-none py-2 bg-white border-b border-gray-200 flex items-center px-5 gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">

        {/* Brand */}
        <div className="flex items-center gap-2.5 mr-4">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 10L7 4L12 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-bold text-[18px] text-gray-900 tracking-tight">Locator Beast AI</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/admin/performance"
            className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            📊 Performance
          </Link>
          <button
            onClick={() => setShowLeadModal(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add Lead
          </button>
        </div>
      </header>

      {/* ─── DASHBOARD STATS ─── */}
      <CollapsibleSection
        title="Dashboard Metrics"
        storageKey="dashboard-metrics-expanded"
        className="flex-none rounded-none border-x-0 border-t-0 shadow-none"
      >
        <DashboardStats leads={localLeads} />
      </CollapsibleSection>

      {/* ─── BODY ─── */}
      <div className="relative flex-1 flex overflow-hidden">

        {/* Background (behind board only) */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg')",
            filter: "brightness(0.55) saturate(0.8)",
          }}
        />
        <div className="absolute inset-0 bg-black/35" />

        {/* LEFT SIDEBAR — Follow-ups */}
        <div className="relative z-10 flex-none w-[220px] border-r border-white/10 bg-black/20 backdrop-blur-md overflow-y-auto">
          <FollowUpRow
            leads={localLeads}
            nextActions={localNextActions}
            onSelectLead={(id) => {
              setSelectedLeadId(id)
              router.push(`/admin/leads?id=${id}`)
            }}
          />
        </div>

        {/* MAIN BOARD */}
        <div
          className={`relative z-10 flex-1 overflow-hidden ${
            selectedLead ? "hidden" : "block"
          }`}
        >
          <LeadBoard
            leads={localLeads}
            setLeads={setLocalLeads}
            selectedLeadId={selectedLeadId}
            onSelectLead={(id) => {
              setSelectedLeadId(id)
              router.push(`/admin/leads?id=${id}`)
            }}
          />
        </div>

        {/* LEAD DETAIL OVERLAY */}
        {selectedLead && (
          <div className="absolute inset-y-0 left-[220px] right-0 z-40 flex pointer-events-none">
            <div className="flex w-full bg-white h-full shadow-2xl pointer-events-auto">

              {/* LEAD PANEL */}
              <div className="w-[420px] flex-none border-r border-gray-200 bg-white overflow-y-auto shadow-[4px_0_24px_rgba(0,0,0,0.06)]">
                <LeadPanel
                  lead={selectedLead}
                  topMatches={topMatches}
                  nextActions={localNextActions}
                  setNextActions={setLocalNextActions}
                  favorites={localFavorites}
                  setFavorites={setLocalFavorites}
                  onClose={() => {
                    setSelectedLeadId(null)
                    router.push("/admin/leads")
                  }}
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
              <div className="flex-1 bg-gradient-to-b from-zinc-100 to-zinc-200 p-6 overflow-y-auto">
                <LeadInsights
                  lead={selectedLead}
                  onMatchesChange={setTopMatches}
                />
              </div>

            </div>
          </div>
        )}

      </div>

      <LeadFormModal
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        onLeadCreated={(newLead) => {
          setLocalLeads((prev) => [{ ...newLead, _isNew: true }, ...prev])
        }}
      />
    </div>
  )
}
