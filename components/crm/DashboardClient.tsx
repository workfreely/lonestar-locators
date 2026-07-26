"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import FollowUpRow from "./FollowUpRow"
import LeadBoard from "./LeadBoard"
import LeadPanel from "./LeadPanel"
import LeadInsights from "./LeadInsights"
import LeadFormModal from "../LeadFormModal"
import WorkflowActionToast from "./WorkflowActionToast"
import { emitWorkflowActionCreated, type WorkflowToastAction } from "@/lib/workflowToast"
import Logo from "./Logo"
import ProfileAvatarMenu from "./ProfileAvatarMenu"
import { CRM_PRIMARY_BUTTON, CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"

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
  const [followUpsOpen, setFollowUpsOpen] = useState(true)
  const [pendingEditActionId, setPendingEditActionId] = useState<number | null>(null)

  // Workflow Engine — a drag-triggered stage change created this action;
  // mirror it into local state and show the toast the same way
  // LeadPanel's own trigger points (First Text, FU chain completion) do.
  function handleWorkflowAction(action: WorkflowToastAction) {
    setLocalNextActions((prev) => [...prev, action])
    emitWorkflowActionCreated(action)
  }

  useEffect(() => {
    const stored = localStorage.getItem("follow-ups-expanded")
    if (stored === "true" || stored === "false") setFollowUpsOpen(stored === "true")
  }, [])

  function toggleFollowUps() {
    setFollowUpsOpen((prev) => {
      const next = !prev
      localStorage.setItem("follow-ups-expanded", String(next))
      return next
    })
  }

  const selectedLead = localLeads.find(
    (l) => String(l.id) === String(selectedLeadId)
  )

  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">

      {/* ─── TOP NAVIGATION BAR ───
          z-50 (not z-30) so the header's own stacking context sits above
          the z-40 Lead Detail Overlay below — otherwise the profile
          dropdown, despite its own z-50, is bounded by the header's lower
          context and renders behind AI Insights/Property Matches/Lead
          Panel whenever a lead is selected (see UI Polish Pass point 2). */}
      <header className="crm-header relative z-50 flex-none py-2 bg-[var(--crm-panel)] border-b border-[var(--crm-border)] flex items-center px-5 gap-4 shadow-[0_1px_3px_rgba(var(--crm-shadow-color),0.06)]">

        <Logo />

        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/performance" className={CRM_SECONDARY_BUTTON}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="8" width="3" height="5" rx="0.5" fill="currentColor"/>
              <rect x="5.5" y="4" width="3" height="9" rx="0.5" fill="currentColor"/>
              <rect x="10" y="1" width="3" height="12" rx="0.5" fill="currentColor"/>
            </svg>
            Analytics
          </Link>
          <button
            onClick={() => setShowLeadModal(true)}
            className={CRM_PRIMARY_BUTTON}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add Lead
          </button>
          <ProfileAvatarMenu />
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="relative flex-1 flex overflow-hidden">

        {/* Workspace background comes from the board's own themed surface
            (.kb-workspace) and the container gradient above. The old dark
            Texas-photo backdrop was retired with the design refresh so the
            workspace recedes and the lead cards become the focal point. */}

        {/* Workspace veil — when the Lead Detail Overlay is open, covers
            the dark board backdrop everywhere right of the Follow-Ups
            sidebar with the same light gray workspace gradient used
            elsewhere, so the Lead Panel floats on the workspace instead of
            the dark photo. Left untouched (and unrendered) behind the
            sidebar itself, so its frosted-glass look over the dark photo
            is fully preserved. */}
        {selectedLead && (
          <div className={`absolute top-2 bottom-2 ${followUpsOpen ? "left-[228px]" : "left-[48px]"} right-0 bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]`} />
        )}

        {/* LEFT SIDEBAR — Agenda (Follow-ups). Recessed column-like panel so
            its task cards (Kanban card surfaces) read as the focus. */}
        {followUpsOpen ? (
          <div className="relative z-10 flex-none w-[220px] my-2 ml-2 rounded-xl overflow-hidden bg-[var(--kb-col)] border border-[var(--kb-col-border)] shadow-[var(--kb-col-shadow)]">
            <FollowUpRow
              leads={localLeads}
              nextActions={localNextActions}
              selectedLeadId={selectedLeadId}
              onSelectLead={(id) => {
                setSelectedLeadId(id)
                router.push(`/admin/leads?id=${id}`)
              }}
              onCollapse={toggleFollowUps}
            />
          </div>
        ) : (
          <div className="relative z-10 flex-none w-10 my-2 ml-2 rounded-xl bg-[var(--kb-col)] border border-[var(--kb-col-border)] shadow-[var(--kb-col-shadow)] flex items-start justify-center pt-3">
            <button
              onClick={toggleFollowUps}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--kb-ink-muted)] hover:text-[var(--kb-ink)] transition-colors"
              aria-label="Expand Agenda"
              title="Expand Agenda"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

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
            onWorkflowAction={handleWorkflowAction}
          />
        </div>

        {/* LEAD DETAIL OVERLAY */}
        {selectedLead && (
          <div className={`absolute top-2 bottom-2 ${followUpsOpen ? "left-[242px]" : "left-[62px]"} right-0 z-40 flex pointer-events-none`}>
            <div className="flex gap-2 w-full h-full pointer-events-auto">

              {/* LEAD PANEL */}
              <div className="w-[420px] flex-none rounded-2xl bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_10px_rgba(15,23,42,0.06),0_10px_24px_rgba(15,23,42,0.10)]">
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
                  pendingEditActionId={pendingEditActionId}
                  onPendingEditHandled={() => setPendingEditActionId(null)}
                />
              </div>

              {/* INSIGHTS PANEL */}
              <div className="flex-1 bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)] p-6 overflow-y-auto">
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

      <WorkflowActionToast
        onUndo={(actionId) => {
          setLocalNextActions((prev) => prev.filter((a) => a.id !== actionId))
        }}
        onEdit={(action) => {
          setSelectedLeadId(action.lead_id)
          router.push(`/admin/leads?id=${action.lead_id}`)
          setPendingEditActionId(action.id)
        }}
      />
    </div>
  )
}
