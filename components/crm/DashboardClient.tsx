"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import FollowUpRow from "./FollowUpRow"
import LeadBoard from "./LeadBoard"
import LeadPanel from "./LeadPanel"
import LeadInsights from "./LeadInsights"
import LeadFavorites from "./LeadFavorites"
import LeadNotes from "./LeadNotes"
import LeadFormModal from "../LeadFormModal"
import WorkflowActionToast from "./WorkflowActionToast"
import { emitWorkflowActionCreated, type WorkflowToastAction } from "@/lib/workflowToast"
import { readAgendaExpanded, writeAgendaExpanded, DEFAULT_AGENDA_EXPANDED, readDemoBannerDismissed, writeDemoBannerDismissed } from "@/lib/preferences"
import { exitDemoWorkspace } from "@/lib/demo/exitDemo"
import FirstRunChecklist from "./FirstRunChecklist"
import AppHeader from "./AppHeader"
import { CRM_PRIMARY_BUTTON, CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"
import type { GuestCardAgent } from "@/lib/leads/guestCard"

function titleCaseName(name: string): string {
  return name.trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function DashboardClient({ leads, nextActions, favorites, demoMode = false, firstName = "", googleConnected = false, agent }: { leads: any[]; nextActions: any[]; favorites: any[]; demoMode?: boolean; firstName?: string; googleConnected?: boolean; agent?: GuestCardAgent }) {
  const router = useRouter()
  const [selectedLeadId, setSelectedLeadId] = useState<string | number | null>(null)
  const [bannerVisible, setBannerVisible] = useState(false)
  const [leavingDemo, setLeavingDemo] = useState(false)

  // Show the sample-workspace banner once per user (until Explore/Start Fresh).
  useEffect(() => {
    if (demoMode) setBannerVisible(!readDemoBannerDismissed())
  }, [demoMode])

  function exploreDemo() {
    writeDemoBannerDismissed(true)
    setBannerVisible(false)
  }

  // Turn the demo workspace off and reveal the real (clean) CRM.
  async function startFresh() {
    setLeavingDemo(true)
    await exitDemoWorkspace()
    setBannerVisible(false)
    router.refresh()
  }

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
  const [followUpsOpen, setFollowUpsOpen] = useState(DEFAULT_AGENDA_EXPANDED)
  const [pendingEditActionId, setPendingEditActionId] = useState<number | null>(null)

  // Workflow Engine — a drag-triggered stage change created this action;
  // mirror it into local state and show the toast the same way
  // LeadPanel's own trigger points (First Text, FU chain completion) do.
  function handleWorkflowAction(action: WorkflowToastAction) {
    setLocalNextActions((prev) => [...prev, action])
    emitWorkflowActionCreated(action)
  }

  useEffect(() => {
    setFollowUpsOpen(readAgendaExpanded())
  }, [])

  function toggleFollowUps() {
    setFollowUpsOpen((prev) => {
      const next = !prev
      writeAgendaExpanded(next)
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
      {/* zClass z-50 (not z-30) so the header's stacking context sits above
          the z-40 Lead Detail Overlay — otherwise the profile dropdown renders
          behind the Lead Panel whenever a lead is selected. */}
      <AppHeader variant="dark" zClass="z-50">
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
      </AppHeader>

      {/* ─── SAMPLE WORKSPACE WELCOME BANNER (demo mode, first entry) ─── */}
      {bannerVisible && (
        <div className="crm-fade-in relative z-20 flex-none mx-2 mt-2">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-5 py-3 shadow-[0_1px_3px_rgba(var(--crm-shadow-color),0.08)]">
            <div className="text-2xl leading-none">🎉</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--crm-text-primary)]">
                {firstName.trim() ? `Welcome, ${titleCaseName(firstName)}!` : "Welcome!"}
              </p>
              <p className="text-[12.5px] text-[var(--crm-text-secondary)]">
                We&apos;ve created a Sample Workspace so you can explore every feature before adding your own leads.
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <button onClick={exploreDemo} className={CRM_PRIMARY_BUTTON}>Explore Demo Workspace</button>
              <button onClick={startFresh} disabled={leavingDemo} className={CRM_SECONDARY_BUTTON}>
                {leavingDemo ? "Clearing…" : "Start Fresh"}
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="relative z-10 flex-none w-[220px] my-2 ml-2 rounded-xl overflow-hidden bg-[var(--kb-col)] border border-[var(--kb-bg)] shadow-[var(--kb-col-shadow)]">
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
          <div className="relative z-10 flex-none w-10 my-2 ml-2 rounded-xl bg-[var(--kb-col)] border border-[var(--kb-bg)] shadow-[var(--kb-col-shadow)] flex items-start justify-center pt-3">
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
          } ${demoMode ? "crm-fade-in" : ""}`}
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
              <div className="w-[420px] flex-none rounded-2xl bg-[var(--crm-panel)] overflow-hidden shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.06),0_4px_10px_rgba(var(--crm-shadow-color),0.14),0_10px_28px_rgba(var(--crm-shadow-color),0.28)]">
                <LeadPanel
                  lead={selectedLead}
                  topMatches={topMatches}
                  nextActions={localNextActions}
                  setNextActions={setLocalNextActions}
                  favorites={localFavorites}
                  agent={agent}
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
                <LeadInsights lead={selectedLead} onMatchesChange={setTopMatches}>
                  <LeadFavorites
                    lead={selectedLead}
                    favorites={localFavorites}
                    setFavorites={setLocalFavorites}
                    nextActions={localNextActions}
                    setNextActions={setLocalNextActions}
                  />
                  <LeadNotes
                    lead={selectedLead}
                    onUpdateLead={(updatedLead) =>
                      setLocalLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)))
                    }
                  />
                </LeadInsights>
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

      {demoMode && <FirstRunChecklist googleConnected={googleConnected} />}
    </div>
  )
}
