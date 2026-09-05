"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import BeastPropertyExplorer from "@/components/crm/explorer/BeastPropertyExplorer"
import { favoriteMoveBlock, visibleRecommendations } from "@/lib/leads/propertyCollections"
import { useRouter } from "next/navigation"
import Link from "next/link"
import FollowUpRow from "./FollowUpRow"
import LeadBoard from "./LeadBoard"
import LeadPanel from "./LeadPanel"
import LeadInsights from "./LeadInsights"
import LeadFavorites from "./LeadFavorites"
import LeadNotes from "./LeadNotes"
import ClientWorkspaceTools from "./ClientWorkspaceTools"
import BestMatches from "./BestMatches"
import LeadFormModal from "../LeadFormModal"
import FollowUpTemplatesModal from "./FollowUpTemplatesModal"
import WorkflowActionToast from "./WorkflowActionToast"
import FollowUpCalendarSync from "./FollowUpCalendarSync"
import BeastMilestoneToast from "./BeastMilestoneToast"
import { useBeastMilestones } from "@/lib/beastMilestones/useBeastMilestones"
import { emitWorkflowActionCreated, type WorkflowToastAction } from "@/lib/workflowToast"
import { readAgendaExpanded, writeAgendaExpanded, DEFAULT_AGENDA_EXPANDED, readDemoBannerDismissed, writeDemoBannerDismissed, readCrmWorkspace, writeCrmWorkspace, DEFAULT_CRM_WORKSPACE, type CrmWorkspace } from "@/lib/preferences"
import { exitDemoWorkspace } from "@/lib/demo/exitDemo"
import { isDemoLeadId, getDemoBrief } from "@/lib/demo/demoWorkspace"
import FirstRunChecklist from "./FirstRunChecklist"
import AppHeader from "./AppHeader"
import { CRM_PRIMARY_BUTTON, CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"
import type { GuestCardAgent } from "@/lib/leads/guestCard"
import { buildActiveClientPayload, COMPANION_MSG_SOURCE, type LatestOutreach, type CompanionLocator } from "@/lib/companion/leadToDto"
import { toCompanionProperty, placeUrl, placeIdFromPropertyUrl } from "@/lib/propertyExplorer/types"
import { attachCatalogRatings } from "@/lib/propertyExplorer/catalog"
import { resolveSadCatalog } from "@/lib/propertyExplorer/resolveSadCatalog"
import { recordFirstContact } from "@/lib/leads/contactWorkflow"
import { recordPendingOutreach } from "@/lib/leads/pendingOutreach"
import { completeBuildList, startBuildList } from "@/lib/leads/buildListWorkflow"
import { completeSendList } from "@/lib/leads/sendListWorkflow"
import { completeFollowUp } from "@/lib/leads/followUpWorkflow"
import { completeSetupTour, rescheduleTour, cancelTour, localTourToUtc } from "@/lib/leads/setupTourWorkflow"
import { createManualTask } from "@/lib/leads/createManualTask"
import GuestCardModal from "./GuestCardModal"
import TourFollowUpModal from "./TourFollowUpModal"
import CheckApplicationModal from "./CheckApplicationModal"
import GetInvoiceDetailsModal from "./GetInvoiceDetailsModal"
import SendInvoiceModal from "./SendInvoiceModal"
import InvoiceDetailsSection from "./InvoiceDetailsSection"
import { autoInvoicePropertyName, formatInvoiceCurrency } from "@/lib/leads/invoiceFields"
import { leaseFollowUpDueAt } from "@/lib/leads/leaseFollowUp"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import ConfirmDialog from "./ConfirmDialog"
import { isGuestCardTitle } from "@/lib/leads/guestCardWorkflow"
import { completeTourFollowUp } from "@/lib/leads/tourFollowUpWorkflow"
import { completeApplicationOutcome } from "@/lib/leads/applicationOutcomeWorkflow"
import { completeConfirmLease } from "@/lib/leads/confirmLeaseWorkflow"
import { createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import type { TourOutcome, ApplicationStatus } from "@bc/companion-shared"
import { supabase } from "@/lib/supabase/client"
import { getNextFollowUpAction } from "@/lib/workflowEngine"
import { followUpSuccessorDueAt } from "@/lib/workflow/moveDateCadence"
import { autoDueInDays } from "@/lib/workflow/autoDueDate"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { dialUrl, launchExternalProtocol } from "@/lib/leads/launchCommunication"
import { formatPersonName, greetingName, buildIntroSmsBody, type FollowUpOverrides } from "@bc/companion-shared"
import type { ResolvedAgentIdentity } from "@/lib/notifications/agentSignature"

// The legacy Lead Panel is HIDDEN in every environment (localhost AND production)
// so the current Workspace is the one visible CRM layout while we finish Beast
// Companion. It is intentionally HIDDEN, NOT deleted: `LeadPanel.tsx` and all of
// its wiring/props (render block, import, pendingEditActionId, workflow) stay
// fully intact so we can later retire it or offer it as an optional view. This
// flag is the single on/off switch — set it back to `true` to show it again.
const SHOW_LEGACY_LEAD_PANEL = false

// The signed-in locator's contact identity for Schedule Tour autofill (message
// field only — never the client contact fields). Reuses the CRM's already-resolved
// agent identity (ResolvedAgentIdentity), so no extra fetch. Name is split into
// first/last from the resolved display name. Returns null when nothing is known.
function toCompanionLocator(signature: ResolvedAgentIdentity | null, agentName?: string | null): CompanionLocator | null {
  const full = ((signature?.name ?? agentName) ?? "").trim()
  if (!full && !signature) return null
  const parts = full ? full.split(/\s+/) : []
  return {
    firstName: parts.length ? parts[0] : null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    phone: signature?.phone ?? null,
    email: signature?.email ?? null,
    title: signature?.title ?? null,
    brokerage: signature?.brokerage ?? null,
  }
}

export default function DashboardClient({ leads, nextActions, favorites, recommendations = [], outreach = [], tours = [], demoMode = false, firstName = "", googleConnected = false, agent, signature = null, avgCommission = 1000, timeZone = DEFAULT_TIMEZONE, voiceEnabled = false, companionOwner = "", userId = "", serviceAreaSlugs = [], primaryMarket = null, licenseState = null, followUpTemplates = {} }: { leads: any[]; nextActions: any[]; favorites: any[]; recommendations?: any[]; outreach?: any[]; tours?: any[]; demoMode?: boolean; firstName?: string; googleConnected?: boolean; agent?: GuestCardAgent; signature?: ResolvedAgentIdentity | null; avgCommission?: number; timeZone?: string; /** Beast Voice alpha — true only for a platform admin, resolved server-side. */ voiceEnabled?: boolean;
  /** Opaque "<userId>:<workspaceId>" for the signed-in locator. Beast Companion
   *  binds every stored client record to it so a different account on the same
   *  browser can never see this locator's client. Server-derived. */
  companionOwner?: string;
  /** Signed-in user id — namespaces the one-time demo welcome and first-run
   *  checklist so another account on the same browser never suppresses them. */
  userId?: string;
  /** Workspace markets in SELECTION order — the first is the primary market and
   *  decides Beast Property Explorer's initial viewport. */
  serviceAreaSlugs?: string[];
  /** Saved default market — where the map opens with no client selected. */
  primaryMarket?: string | null;
  /** Canonical licensed state — Property Explorer may not leave it. */
  licenseState?: string | null;
  /** Workspace-level follow-up message TEXT overrides (content only), already
   *  sanitized server-side. Threaded to the CRM intro / Text Top 3 and into the
   *  Companion active-client payload. Never per-lead; never workflow. */
  followUpTemplates?: FollowUpOverrides }) {
  const router = useRouter()
  const [selectedLeadId, setSelectedLeadId] = useState<string | number | null>(null)
  // The client the SESSION is on — the one Beast Companion is showing. It is a
  // REACTIVE twin of companionLeadIdRef (that ref serves the non-reactive guard in
  // postCompanionActiveClient; the Map has to RENDER from this, and a ref change
  // alone would leave Property Explorer on the previous client's market).
  const [companionLeadId, setCompanionLeadId] = useState<string | number | null>(null)
  // Centered CRM contact modal for a New→Contacted DRAG (the Kanban presentation
  // of the canonical contact flow). Identity captured at drag time is immutable —
  // the modal + write stay bound to this leadId regardless of the active client.
  const [dragContact, setDragContact] = useState<null | {
    leadId: string | number
    name: string
    phone: string | null
    method: "call" | "text" | null
    phase: "choose-method" | "confirm-result"
  }>(null)
  const [bannerVisible, setBannerVisible] = useState(false)
  const [leavingDemo, setLeavingDemo] = useState(false)

  // Show the sample-workspace banner once per user (until Explore/Start Fresh).
  useEffect(() => {
    if (demoMode) setBannerVisible(!readDemoBannerDismissed(userId))
  }, [demoMode, userId])

  function exploreDemo() {
    writeDemoBannerDismissed(true, userId)
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

  // Testing-only persistence of the Agenda side (no DB). Reads once on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lb-agenda-side")
      if (saved === "left" || saved === "right") setAgendaSide(saved)
    } catch {
      /* ignore */
    }
  }, [])

  function toggleAgendaSide() {
    setAgendaSide((s) => {
      const next = s === "left" ? "right" : "left"
      try {
        localStorage.setItem("lb-agenda-side", next)
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const [topMatches, setTopMatches] = useState<any[]>([])
  const [localLeads, setLocalLeads] = useState(leads)
  const [localNextActions, setLocalNextActions] = useState(nextActions)

  // Latest NON-successful outreach per lead (leadId → {type, method, occurredAt}),
  // the discriminator that turns a still-New lead's Follow Up into "Called — No
  // Answer" / "No Answer" vs "Sent Text" / "Waiting for Reply". Seeded from the
  // server (survives refresh) and updated optimistically on each No Answer / Text
  // Sent so the Companion reflects it immediately. `outreach` is ordered newest-
  // first, so the FIRST row seen per lead is the latest — keep that one.
  const [latestOutreach, setLatestOutreach] = useState<Record<string, LatestOutreach>>(() => {
    const map: Record<string, LatestOutreach> = {}
    for (const e of outreach || []) {
      const key = String(e.lead_id)
      if (map[key]) continue
      map[key] = { type: e.type, method: e.method ?? null, occurredAt: e.occurred_at }
    }
    return map
  })
  const latestOutreachRef = useRef(latestOutreach)
  useEffect(() => { latestOutreachRef.current = latestOutreach }, [latestOutreach])
  const outreachFor = (leadId: string | number): LatestOutreach =>
    latestOutreachRef.current[String(leadId)] ?? null
  const [localFavorites, setLocalFavorites] = useState(favorites)
  // Canonical per-client Recommendations (lead_recommendations), same local-state
  // pattern as localFavorites. Written by the Companion "+ Recommendation" verb
  // (Phase 2C); the CRM has no refetch path, so we advance this optimistically.
  const [localRecommendations, setLocalRecommendations] = useState(recommendations)
  // AI Client Insights for the active lead, cached per lead id — the ≤4 bullets
  // from ai_client_briefs (real) or getDemoBrief (demo). Read-only; fetched lazily
  // when a client is selected and passed to buildActiveClientPayload so Companion's
  // Location Fit can read the client's current (conversation-derived) context. Never
  // generated here. Keyed by lead id; "" fetch = [] so we don't refetch endlessly.
  const [insightsByLead, setInsightsByLead] = useState<Record<string, string[]>>({})
  // Canonical lead_tours appointments (read-only in the Workspace). Seeded from
  // the server and appended optimistically on "Yes, Scheduled" so the Favorite's
  // "Tour Scheduled" line appears without a manual refresh (same optimistic-state
  // pattern as localFavorites / localNextActions — the CRM has no refetch path).
  const [localTours, setLocalTours] = useState(tours)
  // Send Guest Card composer (reuses GuestCardModal). Opened per scheduled
  // property from the Workspace Favorite or a Companion verb; completing it marks
  // that property's email_guest_card done and lets Tour Follow-Up surface.
  const [guestCard, setGuestCard] = useState<null | { lead: any; property: any; actionId: number | string | null }>(null)
  // Tour Follow-Up outcome modal ("How did the tour go?"). Scoped to ONE
  // tour/property; completing it records the outcome + drives the next canonical
  // action. Opened from the Workspace Favorite or the Companion verb.
  const [tourFollowUp, setTourFollowUp] = useState<null | { lead: any; tour: any; favorite: any; actionId: number | string | null }>(null)
  // "Apply" (start_application) confirmation — advancing to 'applied' only on the
  // agent's explicit confirmation that the client submitted the application.
  const [confirmApply, setConfirmApply] = useState<null | { lead: any; action: any }>(null)
  // Check Application outcome modal ("What's the application status?"). Scoped to
  // the Top Pick's open check_application; completing it records the durable
  // application_status + drives the next canonical action. Opened from the
  // Workspace Favorite or the Companion verb.
  const [checkApplication, setCheckApplication] = useState<null | { lead: any; action: any; property: any }>(null)
  // Confirm Lease confirmation ("Did the client sign their lease for {Property}?").
  // 'closed' is reached ONLY on the agent's explicit "Yes, Lease Signed" — approval
  // alone never marks Closed. Scoped to the Top Pick's open confirm_lease.
  const [confirmLease, setConfirmLease] = useState<null | { lead: any; action: any }>(null)
  // Get Invoice Details intake modal (compact batch form). Opened from the Closed
  // lead's Top Pick Favorite or the Companion verb; Save persists the canonical
  // invoice_* fields and completes the get_invoice_details action.
  const [getInvoice, setGetInvoice] = useState<null | { lead: any; action: any; property: any }>(null)
  // Send Invoice composer + "Did you send the invoice?" confirmation. Opening the
  // email never marks it sent — only the explicit Yes completes send_invoice and
  // sets the durable Invoice Sent state (leads.invoice_submitted).
  const [sendInvoice, setSendInvoice] = useState<null | { lead: any; action: any; property: any }>(null)
  const [confirmInvoiceSent, setConfirmInvoiceSent] = useState<null | { lead: any; action: any }>(null)
  // "Did you receive the commission payment?" confirmation — the terminal closing
  // milestone. Yes sets the durable invoice_commission_paid; Not Yet keeps it open.
  const [confirmPayment, setConfirmPayment] = useState<null | { lead: any; action: any }>(null)
  // "Send Rebate" confirmation (Cash Rebate only) — completing send_rebate is the
  // durable Rebate Sent state (no leads.* flag). Not a payment, just a workflow log.
  const [confirmRebate, setConfirmRebate] = useState<null | { lead: any; action: any }>(null)
  const [showLeadModal, setShowLeadModal] = useState(false)
  // The lead currently open in Edit Client mode (Companion hamburger → "edit-client"
  // verb). Non-null opens the shared LeadFormModal in edit mode, pre-populated. The
  // save UPDATEs by lead.id (never a new row), so the lead ID is preserved.
  const [editLead, setEditLead] = useState<any>(null)
  // Follow-up template editor (Companion hamburger → "edit-templates" verb). Live
  // copy of the workspace overrides so a save applies to sends immediately.
  const [editTemplatesOpen, setEditTemplatesOpen] = useState(false)
  const [localFollowUpTemplates, setLocalFollowUpTemplates] = useState<FollowUpOverrides>(followUpTemplates)
  const [followUpsOpen, setFollowUpsOpen] = useState(DEFAULT_AGENDA_EXPANDED)
  const [pendingEditActionId, setPendingEditActionId] = useState<number | null>(null)

  // Agenda orientation — DEFAULT "left" (approved layout) or ALTERNATE "right",
  // a pure mirror so the CRM complements the user's chosen Chrome Companion side.
  // Testing-only for now: local state + localStorage (key below), NO DB/schema.
  // Defaults to "left", so production/first-load is unchanged.
  const [agendaSide, setAgendaSide] = useState<"left" | "right">("left")
  // Board vs Beast Property Explorer. Purely which workspace fills the centre —
  // Agenda, Companion and Focus are untouched by it.
  const [workspace, setWorkspace] = useState<CrmWorkspace>(DEFAULT_CRM_WORKSPACE)

  // Restore the last primary view AFTER mount, never in the useState
  // initializer: localStorage does not exist during SSR, so reading it there
  // would render Board on the server and Map on the client and trip a hydration
  // mismatch. Same approach LeadBoard already uses for Kanban density.
  useEffect(() => {
    setWorkspace(readCrmWorkspace())
  }, [])

  // Persist on change. Only the view NAME — nothing transient rides along.
  const selectWorkspace = useCallback((next: CrmWorkspace) => {
    setWorkspace(next)
    writeCrmWorkspace(next)
  }, [])

  // Main-view ↔ Companion tab sync. The main CRM view and the Companion's
  // top-level tab track each other so the agent never sees duplicate property
  // info: Map is a property-research context (Current Property / Recommendations
  // / Beast Suggestions live in the Companion's Properties tab), while the
  // Board/Workspace already shows Recommended/Favorite Properties itself, so the
  // Companion is most useful on Client there.
  //   • board → map   → post "map"       → Companion defaults to Properties
  //   • map   → board → post "workspace" → Companion defaults to Client
  //
  // Fires ONLY on an actual transition. A ref (not the effect's dependency list
  // alone) holds the previous workspace, so the frequent re-renders this component
  // does — search keystrokes, marker updates, pin hover, pin click, lead
  // mutations — cannot re-post while the workspace itself is unchanged. Each post
  // is a CONTEXTUAL DEFAULT the agent can override: the panel switches once per
  // transition and never fights a manual tab change made afterward.
  const prevWorkspaceRef = useRef(workspace)
  useEffect(() => {
    const prev = prevWorkspaceRef.current
    prevWorkspaceRef.current = workspace
    if (prev === workspace) return
    const mode = prev === "board" && workspace === "map" ? "map"
      : prev === "map" && workspace === "board" ? "workspace"
      : null
    if (!mode) return
    window.postMessage(
      { source: COMPANION_MSG_SOURCE, type: "workspace-mode", mode },
      window.location.origin,
    )
  }, [workspace])

  // Beast Milestones — watches the live board for newly-earned achievements
  // (First Lease, monthly commission thresholds) and fires a celebration.
  // Silent on mount for anything already earned, so only fresh crossings pop.
  useBeastMilestones(localLeads, avgCommission, demoMode)

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

  // The client the MAP resolves its market from.
  //
  // Not `selectedLead`. closeWorkspace() sets selectedLeadId to null to return to
  // the board, but the CRM deliberately never posts a "clear" — so Companion goes
  // on showing that client. Reading the CRM selection here meant the Map asked a
  // different question than the panel next to it: select an Austin client, close
  // the workspace, switch to Map, and the selection was already gone, so the map
  // fell through to the agent's Primary Market and opened the wrong city while
  // Companion still displayed the Austin client.
  //
  // companionLeadId is the same value the active-client broadcast last sent, so
  // the two surfaces now agree by construction. Demo and real leads both live in
  // localLeads and are looked up identically — there is no demo-specific path.
  const sessionClientLead =
    selectedLead ??
    localLeads.find((l: any) => String(l.id) === String(companionLeadId)) ??
    null

  // ── AI Client Insights fetch for the active lead (read-only, Location Fit) ──
  // On selection, load the lead's ai_client_briefs.insights ONCE (demo clients use
  // the in-memory getDemoBrief; real leads query the brief row). Cached by lead id
  // in insightsByLead; a lead with no brief caches [] so we never refetch it. This
  // reuses the EXISTING batch-generated insights — it never triggers generation.
  const insightsByLeadRef = useRef(insightsByLead)
  useEffect(() => { insightsByLeadRef.current = insightsByLead }, [insightsByLead])
  const insightsFor = (leadId: string | number): string[] =>
    insightsByLeadRef.current[String(leadId)] ?? []
  useEffect(() => {
    if (!selectedLead) return
    const id = String(selectedLead.id)
    if (id in insightsByLeadRef.current) return // already fetched (or known-empty)
    let cancelled = false
    const commit = (list: string[]) => {
      if (cancelled) return
      setInsightsByLead((prev) => (id in prev ? prev : { ...prev, [id]: list }))
    }
    if (isDemoLeadId(selectedLead.id)) {
      const brief = getDemoBrief(selectedLead.id)
      commit(Array.isArray(brief?.insights) ? brief!.insights : [])
      return
    }
    supabase
      .from("ai_client_briefs")
      .select("insights")
      .eq("lead_id", selectedLead.id)
      .maybeSingle()
      .then(
        ({ data }) => commit(Array.isArray(data?.insights) ? (data!.insights as string[]) : []),
        () => commit([]), // brief fetch is best-effort; absence just means no insights
      )
    return () => { cancelled = true }
  }, [selectedLead])

  // ── Beast Companion: active-client broadcast (Phase 2, read-only) ──────────
  // When a client is selected (Kanban/Agenda → workspace), push a read-only DTO
  // to the Companion through the local content-script bridge (window.postMessage
  // → content script → chrome.storage.local). Re-posts when the selected lead's
  // data or its next-actions change, so Companion stays in sync. It NEVER posts a
  // clear: closing the workspace (X) leaves selectedLead undefined, so the last
  // active client persists in Companion — matching the required lifecycle.
  useEffect(() => {
    if (!selectedLead) return
    if (typeof window === "undefined") return
    try {
      const payload = buildActiveClientPayload(selectedLead, localNextActions, agent?.name, outreachFor(selectedLead.id), timeZone, localFavorites, localTours, localRecommendations, insightsFor(selectedLead.id), companionOwner, signature?.photoUrl ?? null, localFollowUpTemplates, toCompanionLocator(signature, agent?.name))
      companionLeadIdRef.current = selectedLead.id // this lead is now what Companion shows
      setCompanionLeadId(selectedLead.id) // …and the Map resolves its market from it
      window.postMessage(
        { source: COMPANION_MSG_SOURCE, type: "active-client", payload },
        window.location.origin
      )
    } catch {
      /* bridge is best-effort; never block the CRM on a Companion push */
    }
  }, [selectedLead, localNextActions, agent?.name, latestOutreach, localFavorites, localTours, localRecommendations, insightsByLead, localFollowUpTemplates])

  // ── Beast Companion → CRM workflow verbs (Phase 3, Slice A: Contact) ────────
  // Refs so the once-registered verb listener always sees current CRM state
  // without re-subscribing on every keystroke of state change.
  const localLeadsRef = useRef(localLeads)
  const localNextActionsRef = useRef(localNextActions)
  const localRecommendationsRef = useRef(localRecommendations)
  useEffect(() => { localRecommendationsRef.current = localRecommendations }, [localRecommendations])
  const localFavoritesRef = useRef(localFavorites)
  const localToursRef = useRef(localTours)
  const selectedLeadIdRef = useRef(selectedLeadId)
  useEffect(() => { localLeadsRef.current = localLeads }, [localLeads])
  useEffect(() => { localNextActionsRef.current = localNextActions }, [localNextActions])
  useEffect(() => { localFavoritesRef.current = localFavorites }, [localFavorites])
  useEffect(() => { localToursRef.current = localTours }, [localTours])
  useEffect(() => { selectedLeadIdRef.current = selectedLeadId }, [selectedLeadId])

  // The lead Beast Companion is CURRENTLY SHOWING — distinct from selectedLeadId.
  // closeWorkspace() clears the selection (setSelectedLeadId(null)) to return to
  // the Kanban board, but the Companion keeps showing the last client (the CRM
  // never posts a clear). So a post-write refresh must target the SHOWN lead, not
  // the (now-null) selection — otherwise No Answer / Text Sent update local state
  // but never re-broadcast until the card is re-selected. Updated on every
  // broadcast below; set directly when a pending outreach acts on a lead.
  const companionLeadIdRef = useRef<string | number | null>(null)

  // Push an active-client payload for a SPECIFIC lead (used right after a
  // Companion verb runs, so the panel reflects the new stage / Next Action /
  // Last Action immediately, independent of the selectedLead broadcast above).
  //
  // GUARD: only refresh the client the panel is CURRENTLY SHOWING (companionLeadIdRef,
  // NOT the CRM selection — the two diverge when the workspace is closed but the
  // Companion still shows the last client). A verb can resolve against a lead the
  // locator has since navigated away from (e.g. call Priya, then select Hannah, then
  // answer): selecting Hannah moves companionLeadIdRef to Hannah, so re-posting Priya
  // is still blocked — no yank. Its Kanban/Agenda changes still flow through localLeads.
  function postCompanionActiveClient(lead: any, nextActionsForLead: any[]) {
    if (typeof window === "undefined" || !lead) return
    if (String(lead.id) !== String(companionLeadIdRef.current)) return
    try {
      const payload = buildActiveClientPayload(lead, nextActionsForLead, agent?.name, outreachFor(lead.id), timeZone, localFavoritesRef.current, localToursRef.current, localRecommendationsRef.current, insightsFor(lead.id), companionOwner, signature?.photoUrl ?? null, localFollowUpTemplates, toCompanionLocator(signature, agent?.name))
      window.postMessage(
        { source: COMPANION_MSG_SOURCE, type: "active-client", payload },
        window.location.origin
      )
    } catch {
      /* best-effort */
    }
  }

  // ── Beast Companion: replay handshake (answer REQUEST_CURRENT_STATE) ─────────
  // On open, the panel asks the CRM (via background → content script → this page) to
  // re-publish its current synchronized state — the fix for "Locator Beast opened
  // first, Companion opened later" needing a refresh. We re-post the SAME payloads
  // through the SAME bridge, reusing the existing publish path + DTO builder:
  //   • the active client, IF one is selected (recommendations/favorites are nested
  //     in the DTO, so they replay with it);
  //   • the Current Property, IF one exists — the exact payload we last sent (tracked
  //     in lastCurrentPropertyRef via onSelectProperty), never fabricated.
  // Absence of either replays nothing for it — it never clears state.
  const lastCurrentPropertyRef = useRef<ReturnType<typeof toCompanionProperty> | null>(null)
  const publishCurrentStateRef = useRef<() => void>(() => {})
  publishCurrentStateRef.current = () => {
    if (typeof window === "undefined") return
    if (selectedLead) {
      try {
        const payload = buildActiveClientPayload(selectedLead, localNextActions, agent?.name, outreachFor(selectedLead.id), timeZone, localFavorites, localTours, localRecommendations, insightsFor(selectedLead.id), companionOwner, signature?.photoUrl ?? null, localFollowUpTemplates, toCompanionLocator(signature, agent?.name))
        companionLeadIdRef.current = selectedLead.id
        window.postMessage({ source: COMPANION_MSG_SOURCE, type: "active-client", payload }, window.location.origin)
      } catch {
        /* best-effort */
      }
    }
    if (lastCurrentPropertyRef.current) {
      try {
        window.postMessage(
          { source: COMPANION_MSG_SOURCE, type: "current-property", payload: lastCurrentPropertyRef.current },
          window.location.origin,
        )
      } catch {
        /* best-effort */
      }
    }
  }
  useEffect(() => {
    function onReplayRequest(e: MessageEvent) {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d: any = e.data
      if (!d || d.source !== COMPANION_MSG_SOURCE || d.type !== "request-current-state") return
      publishCurrentStateRef.current()
    }
    window.addEventListener("message", onReplayRequest)
    return () => window.removeEventListener("message", onReplayRequest)
  }, [])

  // ── SAD Current Property enrichment (Companion → CRM → Companion) ────────────
  // A SAD-detected Current Property has a name + address but no Google Place ID, so
  // the Companion can't enrich it. It relays {nonce, name, address} here; we resolve
  // the place_id with the ALREADY-loaded browser Google Places library and look up
  // OUR property_catalog, returning ONLY catalog-derived fields (never the live
  // Google result). No confident name match, or no catalog row → nulls (unknown
  // stays unknown). Google is used solely to resolve identity.
  useEffect(() => {
    async function onEnrichRequest(e: MessageEvent) {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d: any = e.data
      if (!d || d.source !== COMPANION_MSG_SOURCE || d.type !== "enrich-property-request") return
      const payload = d.payload || {}
      const nonce = typeof payload.nonce === "string" ? payload.nonce : ""
      const name = typeof payload.name === "string" ? payload.name : ""
      const address = typeof payload.address === "string" ? payload.address : null
      if (!nonce || !name) return
      // Default: nothing resolved. Explicit nulls (never undefined) so the panel-side
      // schema check accepts the envelope.
      let result: {
        nonce: string
        placeId: string | null
        googleRating: number | null
        propertyImageUrl: string | null
        websiteUrl: string | null
      } = { nonce, placeId: null, googleRating: null, propertyImageUrl: null, websiteUrl: null }
      try {
        const enrichment = await resolveSadCatalog(name, address, supabase)
        if (enrichment) {
          result = {
            nonce,
            placeId: enrichment.placeId,
            googleRating: enrichment.googleRating,
            propertyImageUrl: enrichment.propertyImageUrl,
            websiteUrl: enrichment.websiteUrl,
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.error("[sad-enrich] resolve failed:", err)
      }
      window.postMessage(
        { source: COMPANION_MSG_SOURCE, type: "enrich-property-result", payload: result },
        window.location.origin,
      )
    }
    window.addEventListener("message", onEnrichRequest)
    return () => window.removeEventListener("message", onEnrichRequest)
  }, [])

  // ── Canonical tour edit/cancel (Workspace Favorite → Edit / Cancel Tour) ────
  // Both route through the SAME rescheduleTour / cancelTour helpers as any future
  // Companion edit would, and reconcile the SAME optimistic state (localTours +
  // localNextActions + localLeads) + re-post to Companion, so the Next Action
  // stays consistent across surfaces without a refresh.
  // Property-scoped: with per-property Tour Follow-Ups, always pass the property
  // so reschedule/cancel touch ONLY that property's follow-up (never another's).
  function findOpenTourFollowUp(leadId: any, propertyId?: any) {
    return localNextActionsRef.current.find(
      (a: any) =>
        String(a.lead_id) === String(leadId) &&
        !a.completed &&
        (String(a.action_key ?? "") === "tour_follow_up" || String(a.title ?? "").trim().toLowerCase() === "tour follow-up") &&
        (propertyId == null || String(a.property_id ?? "") === String(propertyId))
    )
  }
  function findCompletedSetupTour(leadId: any) {
    return localNextActionsRef.current.find(
      (a: any) =>
        String(a.lead_id) === String(leadId) &&
        (a.completed === true || a.status === "completed") &&
        (String(a.action_key ?? "") === "setup_tour" || String(a.title ?? "").trim().toLowerCase() === "setup tour")
    )
  }

  async function handleRescheduleTour(lead: any, args: { tourId: number | string; propertyId: string; tourDate: string; tourTime: string }) {
    const now = new Date().toISOString()
    const tourDate = String(args.tourDate ?? "").trim()
    const tourTime = String(args.tourTime ?? "").trim()
    const rawProperty = String(args.propertyId ?? "").trim()
    if (!tourDate || !tourTime || !rawProperty) return
    // Only a numeric Favorite id links the tour; "__other__"/"__none__" → null.
    const favProp: string | null = /^\d+$/.test(rawProperty) ? rawProperty : null
    const favId = favProp == null ? null : Number(favProp)
    const scheduledAt = localTourToUtc(tourDate, tourTime, timeZone ?? undefined)
    // Only THIS property's follow-up recalculates (property-scoped).
    const followRow = findOpenTourFollowUp(lead.id, favId)

    await rescheduleTour({
      lead,
      tourId: args.tourId,
      scheduledAt,
      propertyId: favProp,
      followUpActionRow: followRow ? { id: followRow.id } : null,
      now,
      onOptimistic: (updated, due) => {
        setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(updated.id) ? { ...l, ...updated } : l)))
        setLocalTours((prev) =>
          prev.map((t) => (String(t.id) === String(args.tourId) ? { ...t, scheduled_at: scheduledAt, property_id: favId } : t))
        )
        const merged = localNextActionsRef.current.map((a: any) =>
          followRow && String(a.id) === String(followRow.id) ? { ...a, due_at: due } : a
        )
        setLocalNextActions(merged)
        postCompanionActiveClient({ ...lead, ...updated }, merged)
      },
    })
  }

  // Schedule Tour (Slice A) — the agent opened the property's real tour/contact page,
  // came back and confirmed "Yes" + a date/time. Creates the tour through the EXISTING
  // completeSetupTour workflow (lead_tours status='scheduled', property_id = Favorite id;
  // + tour follow-up + prepared, unsent Send Guest Card). No stage change, no auto-send.
  async function handleScheduleTour(lead: any, args: { favoriteId: number | string; propertyName?: string | null; tourDate: string; tourTime: string }) {
    const now = new Date().toISOString()
    const tourDate = String(args.tourDate ?? "").trim()
    const tourTime = String(args.tourTime ?? "").trim()
    if (!tourDate || !tourTime || args.favoriteId == null) return
    const favId = Number(args.favoriteId)
    const scheduledAt = localTourToUtc(tourDate, tourTime, timeZone ?? undefined)
    // Optimistic-FIRST: surface the scheduled tour instantly with a STABLE local id,
    // BEFORE the DB round-trip — so the Favorite flips to "Tour Scheduled" the moment
    // the locator confirms, never waiting on (or silently swallowed by) the insert.
    // The canonical completeSetupTour then persists and RECONCILES the real
    // lead_tours id into THIS same row (Reschedule/Cancel key on the tour id, so a
    // stable id is what makes those edits target the real appointment — a null id
    // would strand them). This is the fix for "Yes + date → nothing happens": the
    // append no longer depends on the async insert resolving without error.
    const localTourId = `local-tour-${lead.id}-${favId}-${Date.now()}`
    setLocalTours((prev) => [
      ...prev,
      { id: localTourId, lead_id: lead.id, property_id: favId, scheduled_at: scheduledAt, status: "scheduled" },
    ])
    try {
      await completeSetupTour({
        lead,
        actionRow: null, // no open setup_tour action — this is a fresh Workspace schedule
        scheduledAt,
        propertyId: favId,
        propertyName: args.propertyName ?? null,
        now,
        // Reconcile the real DB id into the optimistic row (never append a duplicate).
        onTourScheduled: (t) =>
          setLocalTours((prev) =>
            prev.map((row) => (String(row.id) === localTourId ? { ...row, id: t.id ?? row.id } : row)),
          ),
        onWorkflowAction: (a) => setLocalNextActions((prev) => [...prev, a]),
        onGuestCardCreated: (a) => setLocalNextActions((prev) => [...prev, a]),
        onOptimistic: (updated) => {
          setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(updated.id) ? { ...l, ...updated } : l)))
          postCompanionActiveClient({ ...lead, ...updated }, localNextActionsRef.current)
        },
      })
    } catch (err) {
      // The optimistic row stays so the locator still sees the tour; surface the
      // persistence failure instead of silently reverting.
      console.error("[schedule-tour] failed to persist tour:", err)
    }
  }

  async function handleCancelTour(lead: any, args: { tourId: number | string; propertyId?: number | string | null }) {
    const now = new Date().toISOString()
    // Only the canceled property's follow-up reconciles (property-scoped).
    const followRow = findOpenTourFollowUp(lead.id, args.propertyId)
    const setupRow = findCompletedSetupTour(lead.id)
    // This property's UNSENT guest card (if any) — removed on cancel so it stops
    // gating Tour Follow-Up. A SENT (completed) card is left as history.
    const gcRow = args.propertyId == null ? null : localNextActionsRef.current.find(
      (a: any) =>
        String(a.lead_id) === String(lead.id) &&
        !a.completed &&
        String(a.property_id ?? "") === String(args.propertyId) &&
        (String(a.action_key ?? "") === "email_guest_card" || isGuestCardTitle(a.title))
    )

    await cancelTour({
      lead,
      tourId: args.tourId,
      setupTourRow: setupRow ? { id: setupRow.id } : null,
      followUpActionRow: followRow ? { id: followRow.id } : null,
      guestCardActionRow: gcRow ? { id: gcRow.id } : null,
      now,
      onOptimistic: (updated, remainingDue) => {
        setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(updated.id) ? { ...l, ...updated } : l)))
        // Mark this tour canceled locally → it drops off the Favorite display.
        setLocalTours((prev) => prev.map((t) => (String(t.id) === String(args.tourId) ? { ...t, status: "canceled" } : t)))
        // Drop this property's unsent guest card from local state too.
        const withoutGc = (rows: any[]) => (gcRow ? rows.filter((a: any) => String(a.id) !== String(gcRow.id)) : rows)
        let merged: any[]
        if (remainingDue) {
          // Other tours remain → retime the SAME follow-up; stay tour-scheduled.
          merged = withoutGc(localNextActionsRef.current).map((a: any) =>
            followRow && String(a.id) === String(followRow.id) ? { ...a, due_at: remainingDue } : a
          )
        } else {
          // Fully canceled → drop the follow-up + reopen Schedule Tour (immediate).
          merged = withoutGc(localNextActionsRef.current)
            .filter((a: any) => !(followRow && String(a.id) === String(followRow.id)))
            .map((a: any) =>
              setupRow && String(a.id) === String(setupRow.id)
                ? { ...a, completed: false, completed_at: null, status: "open", due_at: now }
                : a
            )
        }
        setLocalNextActions(merged)
        postCompanionActiveClient({ ...lead, ...updated }, merged)
      },
    })
  }

  // ── Send Guest Card (Schedule Tour → Send Guest Card → Tour Follow-Up) ───────
  // Open the reused GuestCardModal for a scheduled property. `fav` is the linked
  // Favorite; `tour` supplies the confirmed date/time for the composer. The
  // action id is the property's email_guest_card row we complete on send.
  function openGuestCardComposer(lead: any, fav: any, tour: any, actionId: number | string | null) {
    if (!lead || !fav) return
    setGuestCard({
      lead,
      property: { ...fav, tourAt: tour?.scheduled_at ?? null, timeZone },
      actionId,
    })
  }
  // From the Workspace Favorite (has the fav + tour + the open guest-card action).
  function handleSendGuestCard(lead: any, args: { favorite: any; tour: any; actionId: number | string | null }) {
    openGuestCardComposer(lead, args.favorite, args.tour, args.actionId)
  }
  // "Continue to Email" fired inside the modal → mark THIS property's guest card
  // complete (Last Action "Guest Card Sent"). No Setup Tour successor (that was the
  // old List-Sent flow); the tour_follow_up already exists and now surfaces once no
  // guest card is open. Re-posts so the Companion advances to the next card / follow-up.
  async function handleGuestCardSent() {
    const gc = guestCard
    setGuestCard(null)
    if (!gc) return
    const now = new Date().toISOString()
    if (gc.actionId != null && !isDemoLeadId(gc.lead.id)) {
      const { error } = await supabase
        .from("lead_next_actions")
        .update({ completed: true, completed_at: now })
        .eq("id", gc.actionId)
      if (error) console.error("[guest-card] complete failed:", error)
    }
    const merged = localNextActionsRef.current.map((a: any) =>
      gc.actionId != null && String(a.id) === String(gc.actionId)
        ? { ...a, completed: true, completed_at: now, status: "completed" }
        : a
    )
    setLocalNextActions(merged)
    postCompanionActiveClient({ ...gc.lead }, merged)
  }

  // ── Tour Follow-Up (property/tour-scoped) ───────────────────────────────────
  // Open the "How did the tour go?" modal for ONE tour/property. `favorite`
  // supplies property_name; `actionId` is that property's open tour_follow_up row.
  function openTourFollowUp(lead: any, tour: any, favorite: any, actionId: number | string | null) {
    if (!lead || !tour) return
    setTourFollowUp({ lead, tour, favorite, actionId })
  }
  function handleTourFollowUp(lead: any, args: { tour: any; favorite: any; actionId: number | string | null }) {
    openTourFollowUp(lead, args.tour, args.favorite, args.actionId)
  }
  // The modal's outcome submit → the ONE canonical completion. Applies every local
  // change in a single next-actions update (complete THIS follow-up, add the next
  // canonical action, reopen setup_tour), plus tour status/outcome + lead patch.
  async function handleTourFollowUpOutcome(outcome: TourOutcome, extras: { followUpDueAt?: string | null; note?: string | null }) {
    const tf = tourFollowUp
    setTourFollowUp(null)
    if (!tf) return
    const now = new Date().toISOString()
    const setupRow = findCompletedSetupTour(tf.lead.id)
    const propertyId = tf.tour.property_id ?? tf.favorite?.id ?? null
    let leadPatch: any = {}
    let nextActions = localNextActionsRef.current
    await completeTourFollowUp({
      lead: tf.lead,
      tour: { id: tf.tour.id, property_id: propertyId, scheduled_at: tf.tour.scheduled_at },
      favorite: { id: propertyId, property_name: tf.favorite?.property_name ?? tf.tour.property_name ?? null },
      outcome,
      followUpActionRow: tf.actionId != null ? { id: tf.actionId } : null,
      setupTourRow: setupRow ? { id: setupRow.id } : null,
      followUpDueAt: extras.followUpDueAt ?? null,
      note: extras.note ?? null,
      now,
      onOptimistic: (patch) => {
        leadPatch = patch.leadPatch
        setLocalTours((prev) =>
          prev.map((t) => (String(t.id) === String(patch.tourId) ? { ...t, status: patch.tourStatus, outcome: patch.tourOutcome } : t)),
        )
        nextActions = nextActions.map((a: any) => {
          if (patch.completedActionId != null && String(a.id) === String(patch.completedActionId)) return { ...a, completed: true, completed_at: now, status: "completed" }
          if (patch.reopenedSetupTourId != null && String(a.id) === String(patch.reopenedSetupTourId)) return { ...a, completed: false, completed_at: null, status: "open", due_at: now }
          return a
        })
      },
      onActionCreated: (action) => {
        nextActions = [...nextActions, action]
      },
    })
    setLocalNextActions(nextActions)
    const updatedLead = { ...tf.lead, ...leadPatch }
    setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(tf.lead.id) ? { ...l, ...leadPatch } : l)))
    postCompanionActiveClient(updatedLead, nextActions)
  }

  // ── Apply (start_application → applied) ─────────────────────────────────────
  // Open the confirmation. Reaching 'applied' requires the agent to confirm the
  // client actually submitted — Ready to Apply alone never sets 'applied'.
  function handleStartApplication(lead: any, action: any) {
    if (!lead || !action) return
    setConfirmApply({ lead, action })
  }
  async function confirmApplicationSubmitted() {
    const ca = confirmApply
    setConfirmApply(null)
    if (!ca) return
    const { lead, action } = ca
    const now = new Date().toISOString()
    const demo = isDemoLeadId(lead.id)
    // 1) Complete the start_application row.
    if (!demo && action.id != null) {
      const { error } = await supabase.from("lead_next_actions").update({ completed: true, completed_at: now, status: "completed" }).eq("id", action.id)
      if (error) console.error("[apply] complete start_application failed:", error)
    }
    // 2) Advance to 'applied' + create the canonical Check Application action.
    let checkApp: any = null
    if (!demo) {
      const { error } = await supabase.from("leads").update({ crm_status: "applied" }).eq("id", lead.id)
      if (error) console.error("[apply] advance to applied failed:", error)
      checkApp = await createWorkflowActionIfNeeded(supabase, lead.id, {
        title: "Check App",
        dueAt: autoDueInDays(3, timeZone),
        actionKey: "check_application",
        // D5 — stamp the Top Pick property so the Check Application row is
        // property-scoped identically for real and demo (start_application carries
        // the Top Pick property_id/name). top_pick_favorite_id stays the durable
        // source of the LIVE Top Pick.
        propertyId: action.property_id ?? null,
        propertyName: action.property_name ?? null,
      })
    } else {
      checkApp = {
        id: `demo-act-checkapp-${Date.now()}`,
        lead_id: lead.id,
        title: "Check App",
        action_key: "check_application",
        property_id: action.property_id ?? null,
        property_name: action.property_name ?? null,
        due_at: autoDueInDays(3, timeZone),
        priority: "medium",
        completed: false,
        status: "open",
      }
    }
    let merged = localNextActionsRef.current.map((a: any) =>
      action.id != null && String(a.id) === String(action.id) ? { ...a, completed: true, completed_at: now, status: "completed" } : a,
    )
    if (checkApp) merged = [...merged, checkApp]
    setLocalNextActions(merged)
    const updatedLead = { ...lead, crm_status: "applied" }
    setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(lead.id) ? { ...l, crm_status: "applied", _justDropped: true } : { ...l, _justDropped: false })))
    postCompanionActiveClient(updatedLead, merged)
  }

  // ── Check Application (property-scoped to the Top Pick) ──────────────────────
  // Open the "What's the application status?" modal for the Top Pick's open
  // check_application. `action` is that check_application row; the property is
  // resolved from its stamped property_id (Top Pick).
  function openCheckApplication(lead: any, action: any) {
    if (!lead || !action) return
    const property =
      localFavoritesRef.current.find((f: any) => String(f.id) === String(action.property_id)) ??
      (action.property_name ? { id: action.property_id ?? null, property_name: action.property_name } : null)
    setCheckApplication({ lead, action, property })
  }
  function handleCheckApplication(lead: any, args: { action: any }) {
    openCheckApplication(lead, args.action)
  }
  // The modal's status submit → the ONE canonical completion. Applies every local
  // change in a single next-actions update (complete/re-date check_application, add
  // the next canonical action, reopen setup_tour), plus the lead application_status
  // + Top Pick patch. Never advances the lead to 'closed'.
  async function handleCheckApplicationOutcome(status: ApplicationStatus, extras: { followUpDueAt?: string | null; note?: string | null }) {
    const ca = checkApplication
    setCheckApplication(null)
    if (!ca) return
    const now = new Date().toISOString()
    const setupRow = findCompletedSetupTour(ca.lead.id)
    const propId = ca.action.property_id ?? ca.property?.id ?? null
    let leadPatch: any = {}
    let nextActions = localNextActionsRef.current
    await completeApplicationOutcome({
      lead: ca.lead,
      checkAction: { id: ca.action.id, property_id: propId, property_name: ca.property?.property_name ?? ca.action.property_name ?? null },
      status,
      setupTourRow: setupRow ? { id: setupRow.id } : null,
      followUpDueAt: extras.followUpDueAt ?? null,
      note: extras.note ?? null,
      now,
      onOptimistic: (patch) => {
        leadPatch = patch.leadPatch
        nextActions = nextActions.map((a: any) => {
          if (patch.completedCheckId != null && String(a.id) === String(patch.completedCheckId)) return { ...a, completed: true, completed_at: now, status: "completed" }
          if (patch.recheckedCheckId != null && String(a.id) === String(patch.recheckedCheckId)) return { ...a, due_at: patch.recheckedDueAt ?? a.due_at }
          if (patch.reopenedSetupTourId != null && String(a.id) === String(patch.reopenedSetupTourId)) return { ...a, completed: false, completed_at: null, status: "open", due_at: now }
          return a
        })
      },
      onActionCreated: (action) => {
        nextActions = [...nextActions, action]
      },
    })
    setLocalNextActions(nextActions)
    const updatedLead = { ...ca.lead, ...leadPatch }
    setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(ca.lead.id) ? { ...l, ...leadPatch } : l)))
    postCompanionActiveClient(updatedLead, nextActions)
  }

  // ── Confirm Lease (Approved → Lease Signed → Closed) ────────────────────────
  // Open the "Did the client sign their lease?" confirmation. Reaching 'closed'
  // requires the explicit "Yes, Lease Signed" — approval alone never closes.
  function handleConfirmLease(lead: any, args: { action: any }) {
    if (!lead || !args.action) return
    setConfirmLease({ lead, action: args.action })
  }
  async function confirmLeaseSigned() {
    const cl = confirmLease
    setConfirmLease(null)
    if (!cl) return
    const now = new Date().toISOString()
    const { lead, action } = cl
    let leadPatch: any = {}
    let merged = localNextActionsRef.current
    await completeConfirmLease({
      lead,
      confirmAction: { id: action.id, property_id: action.property_id ?? null, property_name: action.property_name ?? null },
      now,
      onOptimistic: (patch) => {
        leadPatch = patch.leadPatch
        merged = merged.map((a: any) =>
          patch.completedConfirmLeaseId != null && String(a.id) === String(patch.completedConfirmLeaseId)
            ? { ...a, completed: true, completed_at: now, status: "completed" }
            : a,
        )
      },
      onActionCreated: (invoiceAction) => {
        merged = [...merged, invoiceAction]
      },
    })
    setLocalNextActions(merged)
    // _justDropped pins the card as it lands in Closed (same treatment as Applied).
    const updatedLead = { ...lead, ...leadPatch }
    setLocalLeads((prev) =>
      prev.map((l) => (String(l.id) === String(lead.id) ? { ...l, ...leadPatch, _justDropped: true } : { ...l, _justDropped: false })),
    )
    postCompanionActiveClient(updatedLead, merged)
  }

  // ── Get Invoice Details (Closed → collect lease/commission info) ────────────
  // Open the compact intake modal for the Closed lead's Top Pick. `action` is the
  // open get_invoice_details row; the property is resolved from the Top Pick.
  function openGetInvoiceDetails(lead: any, action: any) {
    if (!lead) return
    const property =
      localFavoritesRef.current.find((f: any) => String(f.id) === String(lead.top_pick_favorite_id)) ??
      localFavoritesRef.current.find((f: any) => String(f.id) === String(action?.property_id)) ??
      (action?.property_name ? { property_name: action.property_name } : null)
    setGetInvoice({ lead, action, property })
  }
  function handleGetInvoiceDetails(lead: any, args: { action: any }) {
    openGetInvoiceDetails(lead, args.action)
  }
  // Save Invoice Details → persist the canonical invoice_* fields (one update),
  // update the section immediately (localLeads), and COMPLETE the get_invoice_details
  // action (Save is the completion trigger — decoupled from invoice_submitted). The
  // lead stays Closed and the Top Pick/property association is untouched. No stage
  // change, no duplicate action.
  async function saveInvoiceDetails(patch: Record<string, unknown>) {
    const gi = getInvoice
    setGetInvoice(null)
    if (!gi) return
    const { lead } = gi
    const now = new Date().toISOString()
    const demo = isDemoLeadId(lead.id)
    // 1) Persist the invoice_* fields to the lead. [real only]
    if (!demo) {
      const { error } = await supabase.from("leads").update(patch).eq("id", lead.id)
      if (error) console.error("[invoice] save invoice details failed:", error.message)
    }
    // 2) Update the section immediately (same canonical lead object).
    const updatedLead = { ...lead, ...patch }
    setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(lead.id) ? { ...l, ...patch } : l)))
    // 3) Complete the get_invoice_details action (the terminal closing action).
    const inv =
      (gi.action && !gi.action.completed ? gi.action : null) ??
      localNextActionsRef.current.find(
        (a: any) =>
          String(a.lead_id) === String(lead.id) &&
          !a.completed &&
          (String(a.action_key ?? "") === "get_invoice_details" || String(a.title ?? "").trim().toLowerCase() === "get invoice details"),
      )
    let merged = localNextActionsRef.current
    if (inv) {
      if (!demo) {
        const { error } = await supabase
          .from("lead_next_actions")
          .update({ completed: true, completed_at: now, status: "completed" })
          .eq("id", inv.id)
        if (error) console.error("[invoice] complete get_invoice_details failed:", error)
      }
      merged = merged.map((a: any) =>
        String(a.id) === String(inv.id) ? { ...a, completed: true, completed_at: now, status: "completed" } : a,
      )
    }
    // 4) Create the next canonical closing action: Send Invoice, property-scoped to
    //    the Top Pick. Deduped on action_key → re-saving never doubles it.
    const propertyId = inv?.property_id ?? lead.top_pick_favorite_id ?? gi.property?.id ?? null
    const propFav = localFavoritesRef.current.find((f: any) => String(f.id) === String(propertyId))
    const propertyName = inv?.property_name ?? propFav?.property_name ?? gi.property?.property_name ?? null
    const alreadyOpen = merged.some(
      (a: any) => String(a.lead_id) === String(lead.id) && !a.completed && String(a.action_key ?? "") === "send_invoice",
    )
    let sendAction: any = null
    if (!alreadyOpen) {
      if (demo) {
        sendAction = {
          id: `demo-act-send-invoice-${now}`, lead_id: lead.id, title: "Send Invoice", due_at: now, priority: "medium",
          property_id: propertyId, property_name: propertyName, action_key: "send_invoice", action_type: "workflow", origin: "workflow", completed: false, status: "open",
        }
      } else {
        sendAction = await createWorkflowActionIfNeeded(supabase, lead.id, { title: "Send Invoice", dueAt: now, actionKey: "send_invoice", propertyId, propertyName })
      }
      if (sendAction) merged = [...merged, sendAction]
    }
    setLocalNextActions(merged)
    postCompanionActiveClient(updatedLead, merged)
  }

  // ── Send Invoice (Closed → email the invoice → confirm sent) ────────────────
  // Open the composer for the Closed lead's Top Pick. `action` is the open
  // send_invoice row; the property is resolved from the Top Pick.
  function openSendInvoice(lead: any, action: any) {
    if (!lead) return
    const property =
      localFavoritesRef.current.find((f: any) => String(f.id) === String(lead.top_pick_favorite_id)) ??
      localFavoritesRef.current.find((f: any) => String(f.id) === String(action?.property_id)) ??
      (action?.property_name ? { property_name: action.property_name } : null)
    setSendInvoice({ lead, action, property })
  }
  function handleSendInvoice(lead: any, args: { action: any }) {
    openSendInvoice(lead, args.action)
  }
  // Open Email fired → the invoice email opened, but that does NOT prove it was
  // sent. Close the composer and ask for explicit confirmation.
  function handleInvoiceEmailOpened() {
    const si = sendInvoice
    setSendInvoice(null)
    if (!si) return
    setConfirmInvoiceSent({ lead: si.lead, action: si.action })
  }
  // "Yes, Invoice Sent" → complete send_invoice, set the durable Invoice Sent state
  // (invoice_submitted), record the immutable timeline event. Lead stays Closed,
  // Top Pick unchanged. ("Not Yet" simply closes — send_invoice stays open.)
  async function confirmInvoiceSentYes() {
    const ci = confirmInvoiceSent
    setConfirmInvoiceSent(null)
    if (!ci) return
    const { lead, action } = ci
    const now = new Date().toISOString()
    const demo = isDemoLeadId(lead.id)
    if (!demo) {
      if (action?.id != null) {
        const { error } = await supabase.from("lead_next_actions").update({ completed: true, completed_at: now, status: "completed" }).eq("id", action.id)
        if (error) console.error("[send-invoice] complete send_invoice failed:", error)
      }
      const { error: leadErr } = await supabase.from("leads").update({ invoice_submitted: true }).eq("id", lead.id)
      if (leadErr) console.error("[send-invoice] set invoice_submitted failed:", leadErr.message)
    }
    recordTimelineEvent({
      leadId: lead.id,
      type: "invoice_sent",
      occurredAt: now,
      metadata: { send_action_id: action?.id ?? null, property_id: action?.property_id ?? null, property_name: action?.property_name ?? null },
    })
    let merged = localNextActionsRef.current.map((a: any) =>
      action?.id != null && String(a.id) === String(action.id) ? { ...a, completed: true, completed_at: now, status: "completed" } : a,
    )
    // Create the terminal closing action: Confirm Payment (commission_paid),
    // property-scoped to the Top Pick. Deduped on action_key → no duplicates.
    const propertyId = action?.property_id ?? lead.top_pick_favorite_id ?? null
    const propFav = localFavoritesRef.current.find((f: any) => String(f.id) === String(propertyId))
    const propertyName = action?.property_name ?? propFav?.property_name ?? null
    const cpOpen = merged.some((a: any) => String(a.lead_id) === String(lead.id) && !a.completed && String(a.action_key ?? "") === "commission_paid")
    let cpAction: any = null
    if (!cpOpen) {
      if (demo) {
        cpAction = {
          id: `demo-act-commission-paid-${now}`, lead_id: lead.id, title: "Confirm Payment", due_at: now, priority: "medium",
          property_id: propertyId, property_name: propertyName, action_key: "commission_paid", action_type: "workflow", origin: "workflow", completed: false, status: "open",
        }
      } else {
        cpAction = await createWorkflowActionIfNeeded(supabase, lead.id, { title: "Confirm Payment", dueAt: now, actionKey: "commission_paid", propertyId, propertyName })
      }
      if (cpAction) merged = [...merged, cpAction]
    }
    setLocalNextActions(merged)
    const updatedLead = { ...lead, invoice_submitted: true }
    setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(lead.id) ? { ...l, invoice_submitted: true } : l)))
    postCompanionActiveClient(updatedLead, merged)
  }

  // ── Confirm Payment (Closed → commission received) ──────────────────────────
  // Open the "Did you receive the commission payment?" confirmation for the Closed
  // lead's Top Pick. `action` is the open commission_paid row.
  function handleConfirmPayment(lead: any, args: { action: any }) {
    if (!lead || !args.action) return
    setConfirmPayment({ lead, action: args.action })
  }
  // Create the Future Lease Follow-Up — the client-retention Next Action that closes
  // the loop once ALL closing obligations are done (No Incentive / Free Movers → at
  // Commission Paid; Cash Rebate → after Rebate Sent). Property-scoped to the leased
  // Top Pick, deduped on action_key (never two per lead). Due ~90 days before the
  // estimated lease end (Lease Start + Lease Term − 90d, 9 AM local). If the term is
  // legacy/unparseable the date can't be derived — we surface it NOW (due = now) so
  // the agent can set a real date, rather than inventing a lease expiration.
  async function addLeaseFollowUp(lead: any, action: any, merged: any[], demo: boolean): Promise<any[]> {
    const already = merged.some(
      (a: any) => String(a.lead_id) === String(lead.id) && String(a.action_key ?? "") === "lease_follow_up",
    )
    if (already) return merged
    const propertyId = action?.property_id ?? lead.top_pick_favorite_id ?? null
    const propFav = localFavoritesRef.current.find((f: any) => String(f.id) === String(propertyId))
    const propertyName = action?.property_name ?? propFav?.property_name ?? null
    const derived = leaseFollowUpDueAt(lead.invoice_lease_start_date, lead.invoice_lease_term, timeZone)
    const dueAt = derived ?? new Date().toISOString()
    let lfAction: any = null
    if (demo) {
      lfAction = {
        id: `demo-act-lease-follow-up-${dueAt}`, lead_id: lead.id, title: "Future Lease Follow-Up", due_at: dueAt, priority: "medium",
        property_id: propertyId, property_name: propertyName, action_key: "lease_follow_up", action_type: "workflow", origin: "workflow", completed: false, status: "open",
      }
    } else {
      lfAction = await createWorkflowActionIfNeeded(supabase, lead.id, { title: "Future Lease Follow-Up", dueAt, actionKey: "lease_follow_up", propertyId, propertyName })
    }
    return lfAction ? [...merged, lfAction] : merged
  }

  // "Yes, Commission Paid" → complete commission_paid, set the durable state
  // (invoice_commission_paid), record the immutable timeline event. Lead stays
  // Closed, Top Pick unchanged. ("Not Yet" simply closes — commission_paid stays open.)
  async function confirmPaymentYes() {
    const cp = confirmPayment
    setConfirmPayment(null)
    if (!cp) return
    const { lead, action } = cp
    const now = new Date().toISOString()
    const demo = isDemoLeadId(lead.id)
    if (!demo) {
      if (action?.id != null) {
        const { error } = await supabase.from("lead_next_actions").update({ completed: true, completed_at: now, status: "completed" }).eq("id", action.id)
        if (error) console.error("[commission-paid] complete commission_paid failed:", error)
      }
      const { error: leadErr } = await supabase.from("leads").update({ invoice_commission_paid: true }).eq("id", lead.id)
      if (leadErr) console.error("[commission-paid] set invoice_commission_paid failed:", leadErr.message)
    }
    recordTimelineEvent({
      leadId: lead.id,
      type: "commission_paid",
      occurredAt: now,
      metadata: { commission_action_id: action?.id ?? null, property_id: action?.property_id ?? null, property_name: action?.property_name ?? null },
    })
    let merged = localNextActionsRef.current.map((a: any) =>
      action?.id != null && String(a.id) === String(action.id) ? { ...a, completed: true, completed_at: now, status: "completed" } : a,
    )
    // Client Incentive branch. Cash Rebate → the client is owed money back, so create
    // the terminal Send Rebate action (property-scoped to the Top Pick, deduped on
    // action_key → no duplicates). Free Movers and No Client Incentive create nothing:
    // commission_paid ends the closing branch (the DTO no longer fabricates a stray
    // "Get Invoice Details"). Setup Movers is intentionally NOT handled here — it will
    // be scheduled earlier (post-lease, before move-in) in a separate pass.
    if (String(lead.invoice_rebate_type ?? "") === "Cash Rebate") {
      const propertyId = action?.property_id ?? lead.top_pick_favorite_id ?? null
      const propFav = localFavoritesRef.current.find((f: any) => String(f.id) === String(propertyId))
      const propertyName = action?.property_name ?? propFav?.property_name ?? null
      const rebateOpen = merged.some(
        (a: any) => String(a.lead_id) === String(lead.id) && !a.completed && String(a.action_key ?? "") === "send_rebate",
      )
      if (!rebateOpen) {
        let rebateAction: any = null
        if (demo) {
          rebateAction = {
            id: `demo-act-send-rebate-${now}`, lead_id: lead.id, title: "Send Rebate", due_at: now, priority: "medium",
            property_id: propertyId, property_name: propertyName, action_key: "send_rebate", action_type: "workflow", origin: "workflow", completed: false, status: "open",
          }
        } else {
          rebateAction = await createWorkflowActionIfNeeded(supabase, lead.id, { title: "Send Rebate", dueAt: now, actionKey: "send_rebate", propertyId, propertyName })
        }
        if (rebateAction) merged = [...merged, rebateAction]
      }
    } else {
      // No Client Incentive / Free Movers → Commission Paid is the last closing
      // obligation, so the Future Lease Follow-Up is created now. (Cash Rebate defers
      // it to Rebate Sent, since Send Rebate is still outstanding here.)
      merged = await addLeaseFollowUp(lead, action, merged, demo)
    }
    setLocalNextActions(merged)
    const updatedLead = { ...lead, invoice_commission_paid: true }
    setLocalLeads((prev) => prev.map((l) => (String(l.id) === String(lead.id) ? { ...l, invoice_commission_paid: true } : l)))
    postCompanionActiveClient(updatedLead, merged)
  }

  // ── Send Rebate (Cash Rebate → confirm the rebate was sent) ─────────────────
  // Open the "Send Rebate · {Property}" confirmation for the Closed lead's Top Pick.
  // `action` is the open send_rebate row. Locator Beast sends NO money — this is a
  // workflow confirmation that the agent sent the rebate via their own method.
  function handleSendRebate(lead: any, args: { action: any }) {
    if (!lead || !args.action) return
    setConfirmRebate({ lead, action: args.action })
  }
  // "Mark Rebate Sent" → complete exactly the open send_rebate, record the immutable
  // rebate_sent timeline event (no leads.* flag — the completed action IS the durable
  // state), keep the lead Closed, preserve Top Pick + all invoice info + Commission
  // Paid. Terminal for this pass (no Setup Movers / Archive / new action created).
  async function confirmRebateSent() {
    const cr = confirmRebate
    setConfirmRebate(null)
    if (!cr) return
    const { lead, action } = cr
    const now = new Date().toISOString()
    const demo = isDemoLeadId(lead.id)
    if (!demo && action?.id != null) {
      const { error } = await supabase.from("lead_next_actions").update({ completed: true, completed_at: now, status: "completed" }).eq("id", action.id)
      if (error) console.error("[send-rebate] complete send_rebate failed:", error)
    }
    recordTimelineEvent({
      leadId: lead.id,
      type: "rebate_sent",
      occurredAt: now,
      metadata: {
        rebate_action_id: action?.id ?? null,
        property_id: action?.property_id ?? null,
        property_name: action?.property_name ?? null,
        rebate_amount: lead.invoice_rebate_amount ?? null,
      },
    })
    let merged = localNextActionsRef.current.map((a: any) =>
      action?.id != null && String(a.id) === String(action.id) ? { ...a, completed: true, completed_at: now, status: "completed" } : a,
    )
    // Rebate Sent is the LAST closing obligation for a Cash Rebate lead → now create
    // the Future Lease Follow-Up (deduped, property-scoped, ~90d before lease end).
    const current = localLeadsRef.current.find((l: any) => String(l.id) === String(lead.id)) ?? lead
    merged = await addLeaseFollowUp(current, action, merged, demo)
    setLocalNextActions(merged)
    // No leads.* write — the completed send_rebate row is the durable Rebate Sent
    // state. Re-post so Companion/Workspace reflect the new Last Action + Next Action.
    postCompanionActiveClient(current, merged)
  }

  // ── Canonical contact appliers — the ONE implementation used by BOTH the
  // Companion verb path and the Kanban-drag centered CRM modal. No duplication:
  // both presentations call these. ──────────────────────────────────────────
  //
  // "Yes, Contacted": canonical first contact. Advances only a NEW lead (New →
  // Contacted), pins the card to the top of Contacted, and re-posts so Companion/
  // Kanban/Agenda/Lead Panel refresh — identical to the existing verb behavior.
  function applyFirstContact(lead: any, method: "call" | "text") {
    if (lead.crm_status !== "new") return
    recordFirstContact({
      lead,
      method,
      onOptimistic: (updated) => {
        setLocalLeads((prev) =>
          prev.map((l) =>
            String(l.id) === String(updated.id)
              ? { ...l, ...updated, _justDropped: true }
              : { ...l, _justDropped: false }
          )
        )
        postCompanionActiveClient({ ...lead, ...updated }, localNextActionsRef.current)
      },
      onWorkflowAction: (a) => {
        setLocalNextActions((prev) => [...prev, a])
        const merged = [...localNextActionsRef.current, a]
        const updatedLead = localLeadsRef.current.find((l: any) => String(l.id) === String(lead.id)) ?? lead
        postCompanionActiveClient(updatedLead, merged)
      },
    })
  }

  // Pending outreach — a New lead was called (no answer) or texted (sent) but NOT
  // reached. The ONE implementation behind BOTH the No Answer and Text Sent
  // outcomes, for BOTH presentations (Companion verb + Kanban-drag modal). Routes
  // through the canonical recordPendingOutreach (timeline event + the +2-day
  // contacted_follow_up "Follow Up" row) — NEVER advances the stage, never runs
  // recordFirstContact, never writes first_text_sent_at. The lead stays New.
  function applyPendingOutreach(lead: any, method: "call" | "text", outcome: "no-answer" | "text-sent") {
    // This outreach is happening on the lead the user is looking at in the
    // Companion / drag modal right now — so it IS the lead the Companion is
    // showing. Record that so the refreshes below reach it even when the CRM
    // workspace has been closed (selectedLeadId === null) and the panel is
    // running purely on its last-broadcast client.
    companionLeadIdRef.current = lead.id
    setCompanionLeadId(lead.id)

    // Optimistic outreach → Companion shows the Last Action ("Called — No Answer"
    // / "Sent Text") and Status ("No Answer" / "Waiting for Reply") immediately,
    // before the async Follow Up row lands.
    const occurredAt = new Date().toISOString()
    const type = outcome === "text-sent" ? "text_sent" : "contact_attempt"
    const nextMap = { ...latestOutreachRef.current, [String(lead.id)]: { type, method, occurredAt } }
    latestOutreachRef.current = nextMap
    setLatestOutreach(nextMap)
    postCompanionActiveClient(lead, localNextActionsRef.current)

    void recordPendingOutreach({
      lead,
      method,
      outcome,
      timeZone,
      onFollowUpAction: (row) => {
        setLocalNextActions((prev) => [...prev, row])
        const merged = [...localNextActionsRef.current, row]
        postCompanionActiveClient(lead, merged)
      },
    })
  }
  // "No Answer" / "Text Sent" — thin canonical entry points onto the shared
  // applier above (kept as named handlers so the drag modal and verb bridge read
  // clearly and to preserve the "No Answer = call attempt" pairing).
  function applyContactAttempt(lead: any, method: "call" | "text") {
    applyPendingOutreach(lead, method, "no-answer")
  }
  function applyTextSent(lead: any, method: "call" | "text") {
    applyPendingOutreach(lead, method, "text-sent")
  }

  // ── Kanban-drag centered CRM modal handlers ────────────────────────────────
  // Step 1 (choose-method) → Step 2 (confirm-result), both bound to the captured
  // dragContact identity. Call/Text use the SAME communication mechanism (an
  // anchor click on the CRM page, within this gesture); Yes/No Answer feed the
  // SAME canonical appliers above.
  function dragChooseMethod(method: "call" | "text") {
    const dc = dragContact
    if (!dc) return
    // Prefill the ONE canonical intro SMS when texting a still-New lead (built from
    // the lead's existing fields + locator first name). NOT contact — Text → Yes,
    // Sent semantics are unchanged. Blank sms for call / non-New, exactly as before.
    const lead = localLeadsRef.current.find((l: any) => String(l.id) === String(dc.leadId))
    const body =
      method === "text" && lead && lead.crm_status === "new"
        ? buildIntroSmsBody({
            firstName: formatPersonName(lead.first_name) || "",
            locatorFirstName: (agent?.name ?? "").trim().split(/\s+/)[0] ?? "",
            propertyType: lead.property_type,
            beds: lead.beds,
            baths: lead.baths,
            moveDate: lead.move_date,
          }, localFollowUpTemplates)
        : undefined
    launchExternalProtocol(dialUrl(method, dc.phone, body)) // tel:/sms: from the CRM page
    setDragContact({ ...dc, method, phase: "confirm-result" })
  }
  function dragResolve(outcome: "yes" | "no-answer") {
    const dc = dragContact
    setDragContact(null)
    if (!dc || !dc.method) return
    const lead = localLeadsRef.current.find((l: any) => String(l.id) === String(dc.leadId))
    if (!lead) return
    if (outcome === "yes") applyFirstContact(lead, dc.method)
    else applyContactAttempt(lead, dc.method)
  }
  // Text path — "Did you send the text?" → "Yes, Sent". Feeds the SAME canonical
  // pending-outreach applier (Follow Up + text_sent timeline event → Status
  // "Waiting for Reply"). A sent text is NOT "Yes, Contacted": no recordFirstContact,
  // no New → Contacted, no Build List — the lead stays New.
  function dragResolveTextSent() {
    const dc = dragContact
    setDragContact(null)
    if (!dc || !dc.method) return
    const lead = localLeadsRef.current.find((l: any) => String(l.id) === String(dc.leadId))
    if (!lead) return
    applyTextSent(lead, dc.method)
  }

  // The panel posts a verb request (panel → chrome.storage → content script →
  // window.postMessage). We run the SAME canonical cascade the Lead Panel uses
  // (lib/leads/contactWorkflow), update local CRM state (Kanban + Agenda re-render
  // from localLeads/localNextActions), and re-post the active client so Companion
  // reflects the result — no extra taps, no manual refresh. SECURITY: same-origin
  // + source-tag checked, and this only performs what the authenticated user can
  // already do from this page; it never grants new capability to page scripts.
  useEffect(() => {
    function onVerb(e: MessageEvent) {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d: any = e.data
      if (!d || d.source !== COMPANION_MSG_SOURCE || d.type !== "workflow-verb") return
      const payload = d.payload || {}
      if (
        payload.verb !== "contact" &&
        payload.verb !== "contact-attempt" &&
        payload.verb !== "text-sent" &&
        payload.verb !== "start-build-list" &&
        payload.verb !== "open-locator-beast" &&
        payload.verb !== "complete-build-list" &&
        payload.verb !== "complete-send-list" &&
        payload.verb !== "complete-follow-up" &&
        payload.verb !== "complete-setup-tour" &&
        payload.verb !== "add-task" &&
        payload.verb !== "open-guest-card" &&
        payload.verb !== "open-tour-follow-up" &&
        payload.verb !== "open-apply" &&
        payload.verb !== "open-check-application" &&
        payload.verb !== "open-confirm-lease" &&
        payload.verb !== "open-invoice-details" &&
        payload.verb !== "open-send-invoice" &&
        payload.verb !== "open-commission-paid" &&
        payload.verb !== "open-send-rebate" &&
        payload.verb !== "add-recommendation" &&
        payload.verb !== "add-favorite" &&
        payload.verb !== "move-to-recommendation" &&
        payload.verb !== "move-to-favorite" &&
        payload.verb !== "remove-recommendation" &&
        payload.verb !== "edit-client" &&
        payload.verb !== "edit-templates"
      )
        return

      // Edit Follow-up Templates (Companion launcher) — workspace-level, no lead.
      // Handle BEFORE the lead lookup and return; opens the CRM template editor.
      // Purely content: touches no workflow, Next Action, stage, or timing.
      if (payload.verb === "edit-templates") {
        setEditTemplatesOpen(true)
        return
      }

      const lead = localLeadsRef.current.find((l: any) => String(l.id) === String(payload.leadId))
      if (!lead) return

      // A verb ARRIVING for this lead proves Companion is showing it — the panel
      // only ever sends verbs for its own displayed client. Adopt that as the
      // shown-lead identity before any handler runs.
      //
      // Without this, the post-write re-broadcast below could not fire from the
      // Smart Apartment Data path. companionLeadIdRef is otherwise set only when
      // the CRM ITSELF selects a lead, but Companion restores its last client
      // from chrome.storage and survives a CRM reload — so an agent working on a
      // SAD tab could hold a client the CRM page had never selected. The ref was
      // then null, postCompanionActiveClient's identity guard rejected the
      // refresh, and "+ Recommendation" wrote the row yet never became
      // "✓ Recommended" because Companion was never told.
      //
      // The Google/Property Explorer path is unaffected by construction: there
      // the agent is in the CRM with the lead selected, so the ref already equals
      // payload.leadId and this assignment writes the value it already holds.
      companionLeadIdRef.current = lead.id
      setCompanionLeadId(lead.id)

      // Edit Client (Companion hamburger). Open the shared LeadFormModal in edit
      // mode, pre-populated from THIS lead. The modal saves via a direct UPDATE by
      // lead.id — no insert, no duplicate — and its onLeadSaved (below) writes the
      // updated row back into localLeads and re-broadcasts the active-client DTO so
      // Companion and the next Unleash list pick up the new criteria. Companion
      // itself stays read-only; the CRM performs the write.
      if (payload.verb === "edit-client") {
        setEditLead(lead)
        return
      }

      // "Build List" START — the agent chose a tool in the panel's Build List
      // chooser; here we advance the workflow Contacted → Searching WITHOUT
      // creating Send List and WITHOUT completing build_list (it stays the open
      // action). Pin the card to the top of Searching and re-post so
      // Companion/Kanban/Agenda/Lead Panel refresh.
      //
      // Both tools share this exact stage advancement: "start-build-list" is the
      // Smart Apartment Data choice, and "open-locator-beast" is the Locator Beast
      // choice — identical Build List action, only the surface differs. For the
      // Locator Beast choice we ALSO switch this CRM into the Map/property
      // workspace (property-name search / Map / Unleash Beast / recommendations)
      // and tell the Companion to move to Properties, reusing the existing
      // workspace-mode → lb-map-entered bridge. Nothing about SAD, matching, map,
      // Unleash Beast or recommendation/favorite logic changes.
      if (payload.verb === "start-build-list" || payload.verb === "open-locator-beast") {
        // Demo/virtual leads have no persisted build_list row, so once the stage
        // moves to Searching the Companion's Next Action would synthesize to
        // "Send List" and hide Mark List Built / Back to CRM. Synthesize a local
        // OPEN build_list row (the exact state a real lead already has) so the Next
        // Action stays "Build List" until Mark List Built completes it. Never
        // persisted; the complete-build-list handler finds and completes this row.
        const hasBuildRow = localNextActionsRef.current.some(
          (a: any) =>
            String(a.lead_id) === String(lead.id) &&
            !a.completed &&
            (String(a.action_key ?? "") === "build_list" ||
              String(a.title ?? "").trim().toLowerCase() === "build list")
        )
        const localBuildRow: any = !hasBuildRow
          ? {
              id: `local-build-${lead.id}-${Date.now()}`,
              lead_id: lead.id,
              title: "Build List",
              action_key: "build_list",
              // Backstop due — 9:00 AM next calendar day (mirrors the real Build
              // List row created by getStageWorkflowAction), so it reads Pending,
              // not instantly Overdue.
              due_at: autoDueInDays(1, timeZone),
              priority: "medium",
              completed: false,
              status: "open",
            }
          : null

        startBuildList({
          lead,
          onOptimistic: (updated) => {
            setLocalLeads((prev) =>
              prev.map((l) =>
                String(l.id) === String(updated.id)
                  ? { ...l, ...updated, _justDropped: true }
                  : { ...l, _justDropped: false }
              )
            )
            const merged = localBuildRow
              ? [...localNextActionsRef.current, localBuildRow]
              : localNextActionsRef.current
            if (localBuildRow) setLocalNextActions(merged)
            postCompanionActiveClient({ ...lead, ...updated }, merged)
          },
        })

        // Locator Beast choice: open the CRM's Map/property workspace so the agent
        // lands on property-name search / Map / Unleash Beast / recommendations,
        // and move the Companion to Properties. selectWorkspace("map") drives the
        // board→map transition (which the prevWorkspaceRef effect already
        // broadcasts as workspace-mode:map). We ALSO post it here unconditionally
        // so the Companion still reaches Properties when the CRM was ALREADY on
        // Map (no transition → the effect would not fire). Both resolve to
        // Properties, so the possible double-signal is harmless.
        if (payload.verb === "open-locator-beast") {
          selectWorkspace("map")
          window.postMessage(
            { source: COMPANION_MSG_SOURCE, type: "workspace-mode", mode: "map" },
            window.location.origin,
          )
        }
        return
      }

      // "✓ Mark List Built" — the explicit Build List completion. The lead is
      // already in Searching (moved by the Build List START), so this does NOT
      // change the stage: it completes the build_list row (kept in place + marked
      // done so Last Action derives "Built List"), creates Send List exactly once,
      // re-pins the card, and re-posts so Companion/Kanban/Agenda/Lead Panel refresh.
      if (payload.verb === "complete-build-list") {
        const now = new Date().toISOString()
        const buildRow = localNextActionsRef.current.find(
          (a: any) =>
            String(a.lead_id) === String(lead.id) &&
            !a.completed &&
            (String(a.action_key ?? "") === "build_list" ||
              String(a.title ?? "").trim().toLowerCase() === "build list")
        )

        // No persisted build_list row to mark (demo leads, or a virtual/
        // synthesized Build List): record the COMPLETED build_list activity
        // locally with the real completion timestamp so Last Action derives
        // "Built List" from genuine completed history — NOT from the stage.
        const completedBuildLocal = !buildRow
          ? {
              id: `local-build-${lead.id}-${Date.now()}`,
              lead_id: lead.id,
              title: "Build List",
              action_key: "build_list",
              completed: true,
              completed_at: now,
              status: "completed",
            }
          : null

        // Demo leads never hit the DB, so completeBuildList returns before it can
        // create the Send List successor — synthesize it locally so Next Action
        // becomes Send List. Real leads get their successor from completeBuildList.
        // Typed `any` (string "demo-" id) to match the existing demo-synthesis
        // pattern in LeadPanel — WorkflowActionToast skips the DB delete for these.
        const demoSendList: any = isDemoLeadId(lead.id)
          ? {
              id: `demo-act-send-${lead.id}-${Date.now()}`,
              lead_id: lead.id,
              title: "Send List",
              action_key: "send_list",
              // Backstop due — 9:00 AM next calendar day (mirrors the real Send List
              // row from getStageWorkflowAction), so it reads Pending, not Overdue.
              due_at: autoDueInDays(1, timeZone),
              priority: "medium",
              completed: false,
            }
          : null

        completeBuildList({
          lead,
          buildRow: buildRow ? { id: buildRow.id } : null,
          onOptimistic: (updated) => {
            setLocalLeads((prev) =>
              prev.map((l) =>
                String(l.id) === String(updated.id)
                  ? { ...l, ...updated, _justDropped: true }
                  : { ...l, _justDropped: false }
              )
            )
            const marked = localNextActionsRef.current.map((a: any) =>
              buildRow && String(a.id) === String(buildRow.id)
                ? { ...a, completed: true, completed_at: now }
                : a
            )
            const merged = [
              ...marked,
              ...(completedBuildLocal ? [completedBuildLocal] : []),
              ...(demoSendList ? [demoSendList] : []),
            ]
            setLocalNextActions(merged)
            postCompanionActiveClient({ ...lead, ...updated }, merged)
            if (demoSendList) emitWorkflowActionCreated(demoSendList)
          },
          onWorkflowAction: (a) => {
            setLocalNextActions((prev) => [...prev, a])
            postCompanionActiveClient(
              { ...lead, crm_status: "searching" },
              [...localNextActionsRef.current, a]
            )
          },
        })
        return
      }

      // "Yes, Sent" (Send List confirmation) — the explicit Send List completion.
      // Completes the open send_list row (Last Action derives "Sent List"), moves
      // Searching → List Sent with follow_up_count reset to 0, and lets the
      // update-stage route create the single FU1 successor (real leads). Mirrors
      // the Mark List Built path; re-posts so Companion updates without a re-click.
      if (payload.verb === "complete-send-list") {
        const now = new Date().toISOString()
        const sendRow = localNextActionsRef.current.find(
          (a: any) =>
            String(a.lead_id) === String(lead.id) &&
            !a.completed &&
            (String(a.action_key ?? "") === "send_list" ||
              String(a.title ?? "").trim().toLowerCase() === "send list")
        )

        // No persisted send_list row to mark (demo leads, or a virtual/synthesized
        // Send List): record the COMPLETED send_list activity locally with the real
        // completion timestamp so Last Action derives "Sent List" — NOT the stage.
        const completedSendLocal = !sendRow
          ? {
              id: `local-send-${lead.id}-${Date.now()}`,
              lead_id: lead.id,
              title: "Send List",
              action_key: "send_list",
              completed: true,
              completed_at: now,
              status: "completed",
            }
          : null

        // Demo leads never hit the DB, so completeSendList returns before the
        // update-stage route can create FU1 — synthesize the ONE FU1 locally with
        // the existing due-date helper (next calendar day at 9:00 AM local). Real
        // leads get FU1 from the route (deduped on follow_up_1), never here.
        // Typed `any` (string "demo-" id) to match the existing demo-synthesis
        // pattern — WorkflowActionToast skips the DB delete for these.
        const demoFu1: any = isDemoLeadId(lead.id)
          ? {
              id: `demo-act-fu1-${lead.id}-${Date.now()}`,
              lead_id: lead.id,
              title: "FU1",
              action_key: "follow_up_1",
              due_at: autoDueInDays(1, timeZone),
              priority: "medium",
              completed: false,
              sequence: 1,
            }
          : null

        // Merged Build List → List Sent: the intermediate "Mark List Built" step
        // no longer runs, so a lead reaching this from the Build List confirmation
        // may still have its build_list row OPEN. Complete it here so it does not
        // linger as an open Next Action once the lead is in List Sent. This is a
        // NO-OP for the legacy Send List path (there build_list was already
        // completed before Send List existed), so existing behavior is unchanged.
        const openBuildRow = localNextActionsRef.current.find(
          (a: any) =>
            String(a.lead_id) === String(lead.id) &&
            !a.completed &&
            (String(a.action_key ?? "") === "build_list" ||
              String(a.title ?? "").trim().toLowerCase() === "build list")
        )
        if (
          openBuildRow &&
          !isDemoLeadId(lead.id) &&
          !String(openBuildRow.id).startsWith("local-")
        ) {
          supabase
            .from("lead_next_actions")
            .update({ completed: true, completed_at: now, status: "completed" })
            .eq("id", openBuildRow.id)
            .then(({ error }: any) => {
              if (error) console.error("[list-sent] close build_list row failed:", error)
            })
        }

        completeSendList({
          lead,
          sendRow: sendRow ? { id: sendRow.id } : null,
          timeZone,
          onOptimistic: (updated) => {
            setLocalLeads((prev) =>
              prev.map((l) =>
                String(l.id) === String(updated.id)
                  ? { ...l, ...updated, _justDropped: true }
                  : { ...l, _justDropped: false }
              )
            )
            const marked = localNextActionsRef.current.map((a: any) =>
              (sendRow && String(a.id) === String(sendRow.id)) ||
              (openBuildRow && String(a.id) === String(openBuildRow.id))
                ? { ...a, completed: true, completed_at: now }
                : a
            )
            const merged = [
              ...marked,
              ...(completedSendLocal ? [completedSendLocal] : []),
              ...(demoFu1 ? [demoFu1] : []),
            ]
            setLocalNextActions(merged)
            postCompanionActiveClient({ ...lead, ...updated }, merged)
            if (demoFu1) emitWorkflowActionCreated(demoFu1)
          },
          onWorkflowAction: (a) => {
            setLocalNextActions((prev) => [...prev, a])
            postCompanionActiveClient(
              { ...lead, crm_status: "list_sent", follow_up_count: 0 },
              [...localNextActionsRef.current, a]
            )
          },
        })
        return
      }

      // "Yes, Sent" (Follow-Up confirmation) — completes the exact captured
      // follow-up, keeps the lead in List Sent, creates ONE successor via the
      // existing sequence engine with the move-date cadence due date, and records
      // the text_sent signal so the successor shows "Waiting for Reply". Mirrors
      // the Send List path; re-posts so Companion updates without a re-click.
      if (payload.verb === "complete-follow-up") {
        const now = new Date().toISOString()
        // Resolve the EXACT captured row (by id first — survives an active-client
        // switch — then by action_key as a fallback for synthesized rows).
        const followRow = localNextActionsRef.current.find(
          (a: any) =>
            String(a.lead_id) === String(lead.id) &&
            !a.completed &&
            (String(a.id) === String(payload.actionId) ||
              (payload.actionKey && String(a.action_key ?? "") === String(payload.actionKey)))
        )
        const completedTitle = String(followRow?.title ?? payload.title ?? "").trim()
        if (!completedTitle) return

        // No persisted row to mark (a purely DTO-synthesized follow-up): record the
        // COMPLETED follow-up locally with the real timestamp so Last Action derives
        // the follow-up label. Real/demo persisted rows are marked in place below.
        const completedFollowLocal = !followRow
          ? {
              id: `local-fu-${lead.id}-${Date.now()}`,
              lead_id: lead.id,
              title: completedTitle,
              action_key:
                completedTitle === "FU1"
                  ? "follow_up_1"
                  : completedTitle === "FU2"
                  ? "follow_up_2"
                  : completedTitle === "FU3"
                  ? "follow_up_3"
                  : "final_follow_up",
              completed: true,
              completed_at: now,
              status: "completed",
            }
          : null

        // Demo successor (real leads get theirs from completeFollowUp) — identity
        // from the engine, due date from the approved move-date cadence.
        const succSpec = getNextFollowUpAction(completedTitle, timeZone)
        const demoSuccessor: any =
          isDemoLeadId(lead.id) && succSpec
            ? {
                id: `demo-act-${succSpec.actionKey}-${lead.id}-${Date.now()}`,
                lead_id: lead.id,
                title: succSpec.title,
                action_key: succSpec.actionKey,
                due_at: followUpSuccessorDueAt(completedTitle, lead, succSpec.dueAt, timeZone),
                priority: "medium",
                completed: false,
                sequence: succSpec.sequence ?? null,
              }
            : null

        completeFollowUp({
          lead,
          followRow: followRow ? { id: followRow.id } : null,
          completedTitle,
          now,
          timeZone,
          onOptimistic: (updated) => {
            setLocalLeads((prev) =>
              prev.map((l) =>
                String(l.id) === String(updated.id)
                  ? { ...l, ...updated, _justDropped: true }
                  : { ...l, _justDropped: false }
              )
            )
            // Retain the completed follow-up (mark in place — do NOT drop it, so
            // Last Action can derive it) and add any synthesized rows.
            const marked = localNextActionsRef.current.map((a: any) =>
              followRow && String(a.id) === String(followRow.id)
                ? { ...a, completed: true, completed_at: now }
                : a
            )
            const merged = [
              ...marked,
              ...(completedFollowLocal ? [completedFollowLocal] : []),
              ...(demoSuccessor ? [demoSuccessor] : []),
            ]
            setLocalNextActions(merged)
            // Waiting-for-Reply signal (same text_sent → latestOutreach mechanism
            // the New-lead flow uses). Same `now` as the completion so the derived
            // status resolves. Persisted for real leads via completeFollowUp.
            const nextMap = {
              ...latestOutreachRef.current,
              [String(lead.id)]: { type: "text_sent" as const, method: "text" as const, occurredAt: now },
            }
            latestOutreachRef.current = nextMap
            setLatestOutreach(nextMap)
            postCompanionActiveClient({ ...lead, ...updated }, merged)
            if (demoSuccessor) emitWorkflowActionCreated(demoSuccessor)
          },
          onWorkflowAction: (a) => {
            setLocalNextActions((prev) => [...prev, a])
            postCompanionActiveClient({ ...lead }, [...localNextActionsRef.current, a])
          },
        })
        return
      }

      // "Yes, Scheduled" (Schedule Tour confirmation) — inserts the canonical
      // lead_tours appointment, completes the captured setup_tour row, KEEPS the
      // lead in Ready to Tour (scheduling ≠ touring), and creates exactly ONE Tour
      // Follow-Up due = last active scheduled tour + 2h (never Done Touring, never
      // a second Schedule Tour). Canonical path is completeSetupTour; re-posts so
      // Companion updates without a re-click.
      if (payload.verb === "complete-setup-tour") {
        const now = new Date().toISOString()
        // The tour's local wall-clock (from the Companion) → the canonical UTC
        // instant, using the locator's resolved zone. Bail if it's missing.
        const tourDate = String(payload.tourDate ?? "").trim()
        const tourTime = String(payload.tourTime ?? "").trim()
        // A property CHOICE is required (a Favorite, "Other Property", or "Schedule
        // Without Property"), but only a numeric Favorite id links the tour —
        // the "__other__"/"__none__" sentinels leave property_id null (nullable).
        const rawProperty = String(payload.propertyId ?? "").trim()
        if (!tourDate || !tourTime || !rawProperty) return
        const propertyId: string | null = /^\d+$/.test(rawProperty) ? rawProperty : null
        const scheduledAt = localTourToUtc(tourDate, tourTime, timeZone ?? undefined)
        // The scheduled Favorite's name → snapshot on the guest card so the
        // Workspace/Companion can label "Send Guest Card — {property}".
        const favName: string | null =
          propertyId == null
            ? null
            : (localFavoritesRef.current.find((f: any) => String(f.id) === String(propertyId))?.property_name ?? null)

        const tourRow = localNextActionsRef.current.find(
          (a: any) =>
            String(a.lead_id) === String(lead.id) &&
            !a.completed &&
            (String(a.action_key ?? "") === "setup_tour" ||
              String(a.title ?? "").trim().toLowerCase() === "setup tour")
        )

        // No persisted setup_tour row to mark (demo leads, or a synthesized Setup
        // Tour): record the COMPLETED setup_tour locally so Last Action derives
        // "Tour Scheduled" — NOT the stage.
        const completedTourLocal = !tourRow
          ? {
              id: `local-tour-${lead.id}-${Date.now()}`,
              lead_id: lead.id,
              title: "Setup Tour",
              action_key: "setup_tour",
              // Snapshot the scheduled property so Last Action reads
              // "Tour Scheduled · {property}" (matches the persisted row).
              property_name: favName,
              completed: true,
              completed_at: now,
              status: "completed",
            }
          : null

        completeSetupTour({
          lead,
          actionRow: tourRow ? { id: tourRow.id } : null,
          scheduledAt,
          propertyId,
          propertyName: favName,
          now,
          onOptimistic: (updated, tourFollowUpDue) => {
            setLocalLeads((prev) =>
              prev.map((l) =>
                String(l.id) === String(updated.id)
                  ? { ...l, ...updated, _justDropped: true }
                  : { ...l, _justDropped: false }
              )
            )
            const marked = localNextActionsRef.current.map((a: any) =>
              tourRow && String(a.id) === String(tourRow.id)
                ? { ...a, completed: true, completed_at: now, property_name: favName }
                : a
            )
            // Demo leads never hit the DB, so completeSetupTour returns before it
            // creates the tour_follow_up — synthesize this property's Tour Follow-Up
            // locally (real leads get it from onWorkflowAction below). PER-PROPERTY:
            // carries property_id, due = THIS tour + 2h (tourFollowUpDue is this
            // single scheduled tour's follow-up), only for a linked Favorite.
            const demoTourFollowUp: any = isDemoLeadId(lead.id) && propertyId != null
              ? {
                  id: `demo-act-tourfu-${lead.id}-${Date.now()}`,
                  lead_id: lead.id,
                  title: "Tour Follow-Up",
                  action_key: "tour_follow_up",
                  property_id: Number(propertyId),
                  property_name: favName,
                  due_at: tourFollowUpDue,
                  priority: "medium",
                  completed: false,
                  status: "open",
                }
              : null
            // Demo: synthesize the per-property Send Guest Card locally too (real
            // leads get it from onGuestCardCreated). Only for a linked Favorite.
            const demoGuestCard: any = isDemoLeadId(lead.id) && propertyId != null
              ? {
                  id: `demo-act-gc-${lead.id}-${Date.now()}`,
                  lead_id: lead.id,
                  title: "Email Guest Card",
                  action_key: "email_guest_card",
                  property_id: Number(propertyId),
                  property_name: favName,
                  due_at: now,
                  priority: "high",
                  completed: false,
                  status: "open",
                }
              : null
            const merged = [
              ...marked,
              ...(completedTourLocal ? [completedTourLocal] : []),
              ...(demoTourFollowUp ? [demoTourFollowUp] : []),
              ...(demoGuestCard ? [demoGuestCard] : []),
            ]
            setLocalNextActions(merged)
            postCompanionActiveClient({ ...lead, ...updated }, merged)
            if (demoTourFollowUp) emitWorkflowActionCreated(demoTourFollowUp)
          },
          onWorkflowAction: (a) => {
            setLocalNextActions((prev) => [...prev, a])
            postCompanionActiveClient({ ...lead }, [...localNextActionsRef.current, a])
          },
          onTourScheduled: (t) => {
            // Surface the appointment under its Favorite in the Workspace right
            // away (read-only). Use the REAL inserted lead_tours id so a later
            // Reschedule targets the correct DB row; demo has no DB id, so fall
            // back to a synthetic id (its reschedules only reconcile locally).
            setLocalTours((prev) => [...prev, { ...t, id: t.id ?? `local-tour-row-${lead.id}-${Date.now()}` }])
          },
          onGuestCardCreated: (gc) => {
            // Real leads: the per-property Send Guest Card just created becomes the
            // primary Next Action (due now); surface it + re-post to Companion.
            setLocalNextActions((prev) => [...prev, gc])
            postCompanionActiveClient({ ...lead }, [...localNextActionsRef.current, gc])
          },
        })
        return
      }

      // Beast Companion "Add Task" — a custom manual task for the active client.
      // Same canonical create as the CRM Add Task (createManualTask →
      // lead_next_actions, action_type manual / origin custom / status open), with
      // the tour-style local wall-clock → UTC conversion (locator zone). The new
      // row is appended to localNextActions so the existing ranking reconciles it
      // as the Next Action, and re-posted so the Companion reflects it.
      if (payload.verb === "add-task") {
        const title = String(payload.title ?? "").trim()
        const taskDate = String(payload.taskDate ?? "").trim()
        const taskTime = String(payload.taskTime ?? "").trim()
        if (!title || !taskDate || !taskTime) return
        const now = new Date().toISOString()
        const dueAt = localTourToUtc(taskDate, taskTime, timeZone ?? undefined)
        createManualTask({ lead, title, dueAt, now }).then((created) => {
          if (!created) return
          setLocalNextActions((prev) => [...prev, created])
          postCompanionActiveClient({ ...lead }, [...localNextActionsRef.current, created])
        })
        return
      }

      // Remove the row a moved property came FROM. Only ever called after the
      // destination row is confirmed (see applyLocal), so a failed insert leaves the
      // source intact. `isFav` describes the DESTINATION, so the source is the opposite
      // collection. Demo rows are local-only and skip the server delete.
      const removeSourceRow = (row: any, destIsFav: boolean, forLead: any) => {
        if (destIsFav) {
          const next = localRecommendationsRef.current.filter((r: any) => String(r.id) !== String(row.id))
          localRecommendationsRef.current = next
          setLocalRecommendations(next)
        } else {
          const next = localFavoritesRef.current.filter((f: any) => String(f.id) !== String(row.id))
          localFavoritesRef.current = next
          setLocalFavorites(next)
        }
        postCompanionActiveClient({ ...forLead }, localNextActionsRef.current)
        if (isDemoLeadId(forLead.id)) return
        supabase
          .from(destIsFav ? "lead_recommendations" : "lead_favorites")
          .delete()
          .eq("id", row.id)
          .then(({ error }: { error: any }) => {
            if (error) console.error(`[${destIsFav ? "recommendation" : "favorite"}] source delete failed:`, error.message)
          })
      }

      // Beast Companion "+ Recommendation" / "♡ Favorite" — add the Companion's
      // detected Current Property to the ACTIVE client's canonical collection
      // (lead_recommendations / lead_favorites). Same write the Workspace uses; the
      // property comes from the payload (already detected — never re-scraped here).
      // Deduped on (lead_id, property_url) — the SAD ViewProperty URL embeds the
      // stable propertyID, so a repeat click is a no-op. Re-posts the active client
      // so both the Companion and the Workspace reflect it with no refresh.
      if (
        payload.verb === "add-recommendation" ||
        payload.verb === "add-favorite" ||
        payload.verb === "move-to-recommendation" ||
        payload.verb === "move-to-favorite"
      ) {
        const p = payload.property as
          | { propertyName?: string; propertyAddress?: string | null; propertyUrl?: string; propertyImageUrl?: string | null; placeId?: string | null }
          | undefined
        // A resolved SAD property (or any Map property) carries a Google placeId → use
        // the canonical ?q=place_id:<id> identity carrier so read-side enrichment works
        // immediately and no background resolve is needed. Otherwise keep the raw URL
        // (SAD ViewProperty link); backfillSadIdentity upgrades it later if it resolves.
        const propertyUrl = p?.placeId
          ? placeUrl(String(p.placeId))
          : String(p?.propertyUrl ?? "").trim()
        if (!propertyUrl) return // primary identity required
        const isFav = payload.verb === "add-favorite" || payload.verb === "move-to-favorite"
        const currentList = isFav ? localFavoritesRef.current : localRecommendationsRef.current
        const sourceList = isFav ? localRecommendationsRef.current : localFavoritesRef.current
        // The SAME property in the opposite collection — Recommendation and Favorite are
        // two states of one progression, so this row is MOVED, never duplicated.
        const sourceRow = sourceList.find(
          (r: any) => String(r.lead_id) === String(lead.id) && String(r.property_url ?? "") === propertyUrl
        )
        // A MOVE from a saved row (the ♡/＋ on a Recommendation/Favorite) posts only the
        // property URL — its name/address live on the SOURCE row. An ADD from Current
        // Property carries them in the payload. Take the name from whichever exists; a
        // move with no resolvable name (should not happen) is ignored rather than saved
        // nameless.
        const propertyName = String(p?.propertyName ?? sourceRow?.property_name ?? "").trim()
        if (!propertyName) return

        // Favorite → Recommendation is blocked while the Favorite still carries a
        // downstream dependency (Top Pick / scheduled tour / open property-scoped
        // action). Re-checked HERE even though the Companion also disables the control,
        // so a stale panel can never null out a real relationship.
        if (!isFav && sourceRow) {
          const block = favoriteMoveBlock({
            favorite: sourceRow,
            lead,
            tours: localToursRef.current,
            nextActions: localNextActionsRef.current,
          })
          if (block.reason) {
            postCompanionActiveClient({ ...lead }, localNextActionsRef.current) // re-sync control state
            return
          }
        }

        // Duplicate guard: same client + same property URL already in the destination.
        if (currentList.some((r: any) => String(r.lead_id) === String(lead.id) && String(r.property_url ?? "") === propertyUrl)) {
          // Already at the destination. If a legacy duplicate still sits in the source
          // collection, this deliberate action resolves it through the normal path.
          if (sourceRow) removeSourceRow(sourceRow, isFav, lead)
          else postCompanionActiveClient({ ...lead }, localNextActionsRef.current) // re-sync control state
          return
        }
        const rowBase = {
          lead_id: lead.id,
          property_name: propertyName || null,
          property_url: propertyUrl || null,
          // Address/image also fall back to the source row on a move.
          property_address: (p?.propertyAddress ?? sourceRow?.property_address ?? null) || null,
          property_image_url: (p?.propertyImageUrl ?? sourceRow?.property_image_url) ?? null,
        }
        const applyLocal = (row: any) => {
          if (isFav) {
            const next = [...localFavoritesRef.current, row]
            localFavoritesRef.current = next
            setLocalFavorites(next)
          } else {
            const next = [...localRecommendationsRef.current, row]
            localRecommendationsRef.current = next
            setLocalRecommendations(next)
          }
          // DESTINATION FIRST: the source is only removed once the destination row
          // exists. If the insert failed we never get here, so the source is untouched
          // and the property is never lost between the two collections.
          if (sourceRow) removeSourceRow(sourceRow, isFav, lead)
          else postCompanionActiveClient({ ...lead }, localNextActionsRef.current)
        }
        // SAD (or any non-place_id) row → resolve its Google place_id in the
        // BACKGROUND (the optimistic add already applied). If a confident match
        // resolves, rewrite the stored identity to the canonical ?q=place_id:<id>
        // carrier — exactly what Map recs use — so the EXISTING read-side
        // attachCatalogRatings populates rating / website / image everywhere with no
        // schema change. No place_id → the original SAD URL stays, unenriched. Never
        // invents data. A row already carrying a place_id (a Map property) is skipped.
        const backfillSadIdentity = (savedRow: any) => {
          const url = String(savedRow?.property_url ?? "")
          const name = String(savedRow?.property_name ?? "")
          if (!name || placeIdFromPropertyUrl(url)) return
          void (async () => {
            let placeId: string | null = null
            try {
              const r = await resolveSadCatalog(name, savedRow.property_address ?? null, supabase)
              placeId = r?.placeId ?? null
            } catch {
              /* resolution failed — keep the SAD URL, unenriched */
            }
            if (!placeId) return
            const newUrl = placeUrl(placeId)
            if (!isDemoLeadId(lead.id)) {
              const { error } = await supabase
                .from(isFav ? "lead_favorites" : "lead_recommendations")
                .update({ property_url: newUrl })
                .eq("id", savedRow.id)
              if (error) {
                console.error(`[sad-enrich] ${isFav ? "favorite" : "recommendation"} identity rewrite failed:`, error.message)
                return
              }
            }
            const [reEnriched] = await attachCatalogRatings([{ ...savedRow, property_url: newUrl }], supabase)
            const listRef = isFav ? localFavoritesRef : localRecommendationsRef
            const setList = isFav ? setLocalFavorites : setLocalRecommendations
            const next = listRef.current.map((row: any) => (String(row.id) === String(savedRow.id) ? reEnriched : row))
            listRef.current = next
            setList(next)
            postCompanionActiveClient({ ...lead }, localNextActionsRef.current)
          })()
        }
        if (isDemoLeadId(lead.id)) {
          // Demo rows are local-only (never persisted), but the catalog rating is
          // still resolved the SAME read-side way as a real add — property_catalog is
          // reference data the signed-in agent reads even in the Demo Workspace (the
          // map/Current Property already show it there). The demo row carries the real
          // map placeUrl, so its rating/stars match Current Property on all four
          // surfaces. A demo property with no catalogued place_id stays unrated, as before.
          const demoRow = { id: `demo-${isFav ? "fav" : "rec"}-${Date.now()}`, ...rowBase }
          void attachCatalogRatings([demoRow], supabase).then(([enriched]) => {
            applyLocal(enriched)
            backfillSadIdentity(enriched)
          })
          return
        }
        supabase
          .from(isFav ? "lead_favorites" : "lead_recommendations")
          .insert([rowBase])
          .select("*")
          .single()
          .then(async ({ data, error }: { data: any; error: any }) => {
            if (error) {
              console.error(`[${isFav ? "favorite" : "recommendation"}] add failed:`, error.message)
              return
            }
            if (!data) return
            // Resolve the catalog google_rating for the just-added row (one batched
            // query, same read-side path as the server load) so its rating/stars render
            // immediately without a page reload. property_catalog stays the single
            // source of truth — nothing rating-related is stored on the row.
            const [enriched] = await attachCatalogRatings([data], supabase)
            applyLocal(enriched)
            backfillSadIdentity(enriched)
          })
        return
      }

      // Remove a Recommendation entirely (the compact ✕ on a Recommendation row,
      // from either surface). This is the ONLY full-removal path: a Favorite is
      // never deleted outright — its ✕ moves it BACK to Recommendations (see
      // move-to-recommendation), so the workflow is Recommendation → Favorite →
      // Recommendation, and only a Recommendation ✕ drops the property. Deletes the
      // lead_recommendations row, then re-broadcasts so both surfaces update.
      if (payload.verb === "remove-recommendation") {
        const propertyUrl = String((payload.property as { propertyUrl?: string } | undefined)?.propertyUrl ?? "").trim()
        if (!propertyUrl) return
        const row = localRecommendationsRef.current.find(
          (r: any) => String(r.lead_id) === String(lead.id) && String(r.property_url ?? "") === propertyUrl
        )
        // removeSourceRow(row, destIsFav=true) removes from recommendations. Already
        // gone → just re-sync control state.
        if (row) removeSourceRow(row, true, lead)
        else postCompanionActiveClient({ ...lead }, localNextActionsRef.current)
        return
      }

      // Beast Companion "Send Guest Card" → open the reused composer in the CRM
      // tab for the property's open guest card (the Companion has focused this tab).
      if (payload.verb === "open-guest-card") {
        const gc =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "email_guest_card" || isGuestCardTitle(a.title))
          )
        if (!gc) return
        const fav =
          localFavoritesRef.current.find((f: any) => String(f.id) === String((gc as any).property_id)) ??
          { property_name: (gc as any).property_name }
        const tour = localToursRef.current.find(
          (t: any) => String(t.lead_id) === String(lead.id) && String(t.property_id ?? "") === String((gc as any).property_id) && t.status === "scheduled"
        )
        openGuestCardComposer(lead, fav, tour, (gc as any).id)
        return
      }

      // Beast Companion "Tour Follow-Up" → open the outcome modal in the CRM tab
      // for the SURFACED property's open tour_follow_up (same canonical workflow).
      if (payload.verb === "open-tour-follow-up") {
        const tf =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "tour_follow_up" || String(a.title ?? "").trim().toLowerCase() === "tour follow-up")
          )
        if (!tf) return
        const propId = (tf as any).property_id
        const fav =
          localFavoritesRef.current.find((f: any) => String(f.id) === String(propId)) ??
          { id: propId, property_name: (tf as any).property_name }
        // The tour this follow-up is about (this property's active/completed tour).
        const tour = localToursRef.current.find(
          (t: any) => String(t.lead_id) === String(lead.id) && String(t.property_id ?? "") === String(propId) && t.status !== "canceled"
        )
        if (!tour) return
        openTourFollowUp(lead, tour, fav, (tf as any).id)
        return
      }

      // Beast Companion "Apply" → open the application-submitted confirmation.
      if (payload.verb === "open-apply") {
        const action =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "start_application" || String(a.title ?? "").trim().toLowerCase() === "apply")
          )
        if (!action) return
        handleStartApplication(lead, action)
        return
      }

      // Beast Companion "Check Application" → open the outcome modal in the CRM tab
      // for the Top Pick's open check_application (same canonical workflow).
      if (payload.verb === "open-check-application") {
        const action =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "check_application" || String(a.title ?? "").trim().toLowerCase() === "check app" || String(a.title ?? "").trim().toLowerCase() === "check application")
          )
        if (!action) return
        handleCheckApplication(lead, { action })
        return
      }

      // Beast Companion "Confirm Lease" → open the "did the client sign?" confirm
      // in the CRM tab for the Top Pick's open confirm_lease (same canonical path).
      if (payload.verb === "open-confirm-lease") {
        const action =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "confirm_lease" || String(a.title ?? "").trim().toLowerCase() === "confirm lease")
          )
        if (!action) return
        handleConfirmLease(lead, { action })
        return
      }

      // Beast Companion "Get Invoice Details" → open the compact intake modal in the
      // CRM tab for the Closed lead's Top Pick (same canonical fields + completion).
      if (payload.verb === "open-invoice-details") {
        const action =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "get_invoice_details" || String(a.title ?? "").trim().toLowerCase() === "get invoice details")
          )
        if (!action) return
        handleGetInvoiceDetails(lead, { action })
        return
      }

      // Beast Companion "Send Invoice" → open the invoice email composer in the CRM
      // tab for the Closed lead's Top Pick (same canonical composer + confirmation).
      if (payload.verb === "open-send-invoice") {
        const action =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "send_invoice" || String(a.title ?? "").trim().toLowerCase() === "send invoice")
          )
        if (!action) return
        handleSendInvoice(lead, { action })
        return
      }

      // Beast Companion "Confirm Payment" → open the "did you receive the payment?"
      // confirmation in the CRM tab for the Top Pick's open commission_paid.
      if (payload.verb === "open-commission-paid") {
        const action =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "commission_paid" || String(a.title ?? "").trim().toLowerCase() === "confirm payment")
          )
        if (!action) return
        handleConfirmPayment(lead, { action })
        return
      }

      // Beast Companion "Send Rebate" → open the "Send Rebate · {Property}" confirm
      // in the CRM tab for the Top Pick's open send_rebate (Cash Rebate only).
      if (payload.verb === "open-send-rebate") {
        const action =
          localNextActionsRef.current.find((a: any) => payload.actionId != null && String(a.id) === String(payload.actionId)) ??
          localNextActionsRef.current.find(
            (a: any) =>
              String(a.lead_id) === String(lead.id) &&
              !a.completed &&
              (String(a.action_key ?? "") === "send_rebate" || String(a.title ?? "").trim().toLowerCase() === "send rebate")
          )
        if (!action) return
        handleSendRebate(lead, { action })
        return
      }

      const method: "call" | "text" = payload.method === "call" ? "call" : "text"

      if (payload.verb === "contact-attempt") {
        // "No Answer" — pending call outreach (Follow Up + Status "No Answer").
        applyContactAttempt(lead, method)
        return
      }

      if (payload.verb === "text-sent") {
        // "Yes, Sent" — pending text outreach (Follow Up + Status "Waiting for
        // Reply"). NOT successful contact — the lead stays New.
        applyTextSent(lead, method)
        return
      }

      // "Yes, Contacted" — canonical first contact (only advances a NEW lead).
      applyFirstContact(lead, method)
    }
    window.addEventListener("message", onVerb)
    return () => window.removeEventListener("message", onVerb)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Workspace navigation ONLY. Closes the selected-client workspace and returns
  // the center to the Kanban. Makes NO change to the lead: no stage change, no
  // Next/Last Action change, no follow-up, no workflow automation, no client
  // data write — identical to the Lead Panel's existing onClose.
  //
  // Phase-2 note (state-lifecycle separation): `selectedLeadId` here is the
  // WORKSPACE selection (Kanban vs. client workspace). It is intentionally the
  // ONLY thing cleared. Beast Companion's persistent active-client state will be
  // a SEPARATE variable (e.g. companionActiveLeadId), set on selection and NOT
  // cleared by this control — so returning to the Kanban never blanks Companion.
  function closeWorkspace() {
    setSelectedLeadId(null)
    router.push("/admin/leads")
  }

  // ── Focus ─────────────────────────────────────────────────────────────────
  // An APP-LEVEL layout mode, not browser fullscreen. It hides the top nav and
  // lifts this same shell to `fixed inset-0`, escaping the admin layout's
  // px-4/pb-4 inset so the Kanban fills the Locator Beast tab. The browser's
  // own chrome — tabs, address bar, the OS window — is never involved, so
  // there is no native fullscreen state to get stuck in.
  //
  // Independent of the board's density view: `view` lives in LeadBoard, this
  // flag lives here. Switching Detailed/Compact/Overview keeps Focus on, and
  // leaving Focus keeps whichever view was selected.
  //
  // Nothing unmounts when it flips: LeadBoard, the Agenda and the workspace all
  // keep their existing state (search text, density, scroll, selected lead), so
  // entering or leaving costs the locator nothing. Removing the feature means
  // deleting this block, the two props passed to LeadBoard, and `.kb-focus`.
  const [focusMode, setFocusMode] = useState(false)

  // Esc leaves Focus. Convenience only — deliberately not advertised in the UI,
  // and unrelated to the browser's own fullscreen Esc behavior.
  useEffect(() => {
    if (!focusMode) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocusMode(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focusMode])

  // ── Agenda orientation (pure mirror) ──────────────────────────────────────
  // Same components, same widths/margins/insets — only the SIDE flips. The BODY
  // flex reverses; the Agenda's OUTER margin moves to the opposite edge; and the
  // absolute veil/overlay insets swap left↔right (identical pixel values).
  const agendaOnRight = agendaSide === "right"
  const bodyFlexCls = agendaOnRight ? "flex-row-reverse" : "flex-row"
  const agendaMarginCls = agendaOnRight ? "mr-2" : "ml-2"
  const veilInsetCls = agendaOnRight
    ? followUpsOpen ? "left-0 right-[228px]" : "left-0 right-[48px]"
    : followUpsOpen ? "left-[228px] right-0" : "left-[48px] right-0"
  const overlayInsetCls = agendaOnRight
    ? followUpsOpen ? "left-0 right-[242px]" : "left-0 right-[62px]"
    : followUpsOpen ? "left-[242px] right-0" : "left-[62px] right-0"

  return (
    <div
      className={`relative w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)] ${
        focusMode ? "fixed inset-0 z-[60] h-full" : "h-screen"
      }`}
    >

      {/* ─── TOP NAVIGATION BAR ───
          z-50 (not z-30) so the header's own stacking context sits above
          the z-40 Lead Detail Overlay below — otherwise the profile
          dropdown, despite its own z-50, is bounded by the header's lower
          context and renders behind AI Insights/Property Matches/Lead
          Panel whenever a lead is selected (see UI Polish Pass point 2). */}
      {/* zClass z-50 (not z-30) so the header's stacking context sits above
          the z-40 Lead Detail Overlay — otherwise the profile dropdown renders
          behind the Lead Panel whenever a lead is selected. */}
      {/* Full-bleed the top header to the CRM shell edges — counteracts the admin
          layout's px-4 inset so the bar spans from the far-left of the app area to
          the web-viewport right edge (where the Chrome Companion begins). The
          body/Agenda below stay inset; only the header is full width. */}
      {!focusMode && (
      <AppHeader variant="dark" zClass="z-50" fullBleed>
        <Link href="/admin/analytics" className={CRM_SECONDARY_BUTTON}>
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
      )}

      {/* ─── SAMPLE WORKSPACE WELCOME BANNER (demo mode, first entry) ─── */}
      {bannerVisible && (
        <div className="crm-fade-in relative z-20 flex-none mx-2 mt-2">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-5 py-3 shadow-[0_1px_3px_rgba(var(--crm-shadow-color),0.08)]">
            <div className="text-2xl leading-none">🎉</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--crm-text-primary)]">
                {firstName.trim()
                  ? `Welcome to Locator Beast, ${greetingName(firstName)}!`
                  : "Welcome to Locator Beast!"}
              </p>
              <p className="text-[12.5px] text-[var(--crm-text-secondary)]">
                We added sample leads so you can explore the CRM.
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

      {/* ─── BODY ─── (Agenda side mirrors via bodyFlexCls)
          mt-2 (8px) gives the whole workspace row breathing room below the top
          nav. Applied to the row as a unit (not to Agenda/center/cards) so it
          holds for Agenda left/right, expanded/collapsed, Kanban, and the client
          workspace — and shifts the absolute veil down with it (no misalignment). */}
      <div className={`relative flex-1 flex ${bodyFlexCls} overflow-hidden mt-2`}>

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
          <div className={`absolute top-2 bottom-2 ${veilInsetCls} bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]`} />
        )}

        {/* LEFT SIDEBAR — Agenda (Follow-ups). Recessed column-like panel so
            its task cards (Kanban card surfaces) read as the focus. */}
        {followUpsOpen ? (
          <div className={`relative z-10 flex-none w-[220px] my-2 ${agendaMarginCls} rounded-xl overflow-hidden bg-[var(--kb-col)] border border-[var(--kb-bg)] shadow-[var(--kb-col-shadow)]`}>
            <FollowUpRow
              leads={localLeads}
              nextActions={localNextActions}
              selectedLeadId={selectedLeadId}
              onSelectLead={(id) => {
                setSelectedLeadId(id)
                router.push(`/admin/leads?id=${id}`)
              }}
              onCollapse={toggleFollowUps}
              collapseToward={agendaSide}
              timeZone={timeZone}
            />
          </div>
        ) : (
          <div className={`relative z-10 flex-none w-10 my-2 ${agendaMarginCls} rounded-xl bg-[var(--kb-col)] border border-[var(--kb-bg)] shadow-[var(--kb-col-shadow)] flex items-start justify-center pt-3`}>
            <button
              onClick={toggleFollowUps}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--kb-ink-muted)] hover:text-[var(--kb-ink)] transition-colors"
              aria-label="Expand Agenda"
              title="Expand Agenda"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* Expand points INWARD (toward center): › when Agenda is on the
                    left, ‹ when on the right. */}
                <polyline points={agendaOnRight ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
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
            workspace={workspace}
            onWorkspaceChange={selectWorkspace}
            mapSlot={(query, hosts, onMatchCount, submittedName, onResolveName) => (
              <BeastPropertyExplorer
                query={query}
                searchName={submittedName}
                onResolveName={onResolveName}
                actionsHost={hosts.actions}
                marketHost={hosts.market}
                dropdownHost={hosts.search}
                onMatchCount={onMatchCount}
                primaryMarket={primaryMarket}
                licenseState={licenseState}
                recommendedUrls={
                  // Same session client the map resolves its market from, NOT the
                  // CRM selection: the board (and therefore the map) is hidden
                  // whenever a lead is selected, so reading selectedLead here
                  // always produced [] and the pin could never show ✓ Recommended.
                  sessionClientLead
                    ? localRecommendations
                        .filter((r: any) => String(r.lead_id) === String(sessionClientLead.id))
                        .map((r: any) => String(r.property_url ?? ""))
                        .filter(Boolean)
                    : []
                }
                onSelectProperty={(property) => {
                  // Clicking a marker publishes the property as CURRENT PROPERTY
                  // context, on the same channel Companion already receives
                  // active-client on. It is page/selection context, not a saved
                  // record: nothing is written, and it is not tied to the lead.
                  //
                  // The full normalized property goes across — lat, lng, placeId,
                  // source and marketSlug included — so a consumer never has to
                  // ask Places for coordinates the map already loaded. Values are
                  // forwarded exactly as held: a null coordinate stays null.
                  //
                  // `null` is an explicit CLEAR (e.g. the map switched markets): it
                  // posts a null payload so the Companion drops its Current Property.
                  const cpPayload = property ? toCompanionProperty(property) : null
                  // Remember the last payload so the replay handshake can re-post the
                  // SAME Current Property (or nothing, after a clear) — never fabricated.
                  lastCurrentPropertyRef.current = cpPayload
                  window.postMessage(
                    {
                      source: COMPANION_MSG_SOURCE,
                      type: "current-property",
                      payload: cpPayload,
                    },
                    window.location.origin,
                  )
                }}
                onRecommend={(property) => {
                  // Resolve against the SESSION client, not the CRM selection.
                  // The board wrapper is `hidden` while a lead is selected, so the
                  // map is only ever visible when selectedLead is null — meaning
                  // this guard rejected every click the agent could actually make
                  // and the verb was never dispatched. Same root cause as the SAD
                  // recommendation bug: the map asked "who is selected?" when the
                  // question is "who is this session on?".
                  if (!sessionClientLead) return
                  // Dispatch the EXISTING add-recommendation verb — the same entry
                  // point Beast Companion uses. No Google-specific storage and no
                  // second recommendation path: dedupe, demo handling, the insert
                  // and the active-client re-broadcast all run unchanged.
                  window.postMessage(
                    {
                      source: COMPANION_MSG_SOURCE,
                      type: "workflow-verb",
                      payload: {
                        verb: "add-recommendation",
                        leadId: sessionClientLead.id,
                        property: {
                          propertyName: property.propertyName,
                          propertyUrl: property.propertyUrl,
                          propertyAddress: property.propertyAddress,
                          propertyImageUrl: null,
                        },
                      },
                    },
                    window.location.origin,
                  )
                }}
                serviceAreaSlugs={serviceAreaSlugs}
                activeClient={
                  sessionClientLead
                    ? {
                        id: sessionClientLead.id ?? null,
                        city: sessionClientLead.city ?? null,
                        desiredAreas:
                          sessionClientLead.neighborhoods ?? sessionClientLead.submarkets ?? null,
                      }
                    : null
                }
              />
            )}
            leads={localLeads}
            setLeads={setLocalLeads}
            nextActions={localNextActions}
            selectedLeadId={selectedLeadId}
            // The lead the Beast Companion is currently showing — the board
            // highlights its card as the active client context. companionLeadId
            // tracks the Companion's active client independently of CRM
            // selection (the board is hidden whenever a lead is selected), so
            // this is the signal that stays valid on the visible Kanban.
            activeCompanionLeadId={companionLeadId}
            onSelectLead={(id) => {
              setSelectedLeadId(id)
              router.push(`/admin/leads?id=${id}`)
            }}
            onWorkflowAction={handleWorkflowAction}
            onInitiateContact={(lead) => {
              // Drag New→Contacted: select the lead (so Companion loads it via the
              // Phase 2 active-client bridge) and open the CENTERED CRM MODAL where
              // the drag originated. No Companion chooser handoff. No stage change —
              // applyFirstContact only runs on "Yes, Contacted". One pending at a
              // time: ignore a new drag while a contact modal is unresolved.
              if (dragContact) return
              setSelectedLeadId(lead.id)
              router.push(`/admin/leads?id=${lead.id}`)
              setDragContact({
                leadId: lead.id,
                name: formatPersonName(lead.first_name) || "this client",
                phone: lead.phone ?? null,
                method: null,
                phase: "choose-method",
              })
            }}
            timeZone={timeZone}
            focus={focusMode}
            onToggleFocus={() => setFocusMode((v) => !v)}
            voiceEnabled={voiceEnabled}
          />
        </div>

        {/* LEAD DETAIL OVERLAY */}
        {selectedLead && (
          <div className={`absolute top-2 bottom-2 ${overlayInsetCls} z-40 flex pointer-events-none`}>
            <div className="flex gap-2 w-full h-full pointer-events-auto">

              {/* LEAD PANEL — hidden in the dev Phase-1 preview (see
                  SHOW_LEGACY_LEAD_PANEL); intact + rendered in production. */}
              {SHOW_LEGACY_LEAD_PANEL && (
              <div className="w-[420px] flex-none rounded-2xl bg-[var(--crm-panel)] overflow-hidden shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.06),0_4px_10px_rgba(var(--crm-shadow-color),0.14),0_10px_28px_rgba(var(--crm-shadow-color),0.28)]">
                <LeadPanel
                  lead={selectedLead}
                  topMatches={topMatches}
                  nextActions={localNextActions}
                  setNextActions={setLocalNextActions}
                  favorites={localFavorites}
                  agent={agent}
                  signature={signature}
                  onClose={() => {
                    setSelectedLeadId(null)
                    router.push("/admin/leads")
                  }}
                  onUpdateLead={(updatedLead) => {
                    setLocalLeads((prev) => {
                      const prevLead = prev.find((l) => l.id === updatedLead.id)
                      // A workflow-driven stage change (New→Contacted, etc.)
                      // pins the lead to the TOP of its destination column via
                      // _justDropped — the same flag drag uses — so it's
                      // immediately visible where the user looks to confirm the
                      // move, never buried at the bottom. Non-stage updates
                      // (notes, follow-up count, dates) never reorder anything.
                      const stageChanged =
                        !!prevLead && prevLead.crm_status !== updatedLead.crm_status
                      return prev.map((l) => {
                        if (l.id === updatedLead.id) {
                          return stageChanged
                            ? { ...updatedLead, _justDropped: true }
                            : updatedLead
                        }
                        // Clear any prior pin so only the just-moved lead stays
                        // on top of its column.
                        return stageChanged && l._justDropped
                          ? { ...l, _justDropped: false }
                          : l
                      })
                    })
                  }}
                  pendingEditActionId={pendingEditActionId}
                  onPendingEditHandled={() => setPendingEditActionId(null)}
                  timeZone={timeZone}
                />
              </div>
              )}

              {/* INSIGHTS PANEL (Phase 1 center working canvas) */}
              <div className="beast-ai-clearance flex-1 bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)] p-6 overflow-y-auto">
                {/* Desktop 50/50 workspace. LEFT column = Recommended Properties,
                    Favorite Properties, Client Tools (+ Invoice Details on Closed).
                    RIGHT column = AI Insights (rendered by LeadInsights, includes
                    Last Conversation) + Locator Notes. Layout only — every section
                    card, header, and collapsible behavior is unchanged. The
                    workspace-close X still lives inside the AI Insights header;
                    shown only when the legacy Lead Panel isn't rendered. */}
                <LeadInsights
                  lead={selectedLead}
                  onMatchesChange={setTopMatches}
                  onCloseWorkspace={SHOW_LEGACY_LEAD_PANEL ? undefined : closeWorkspace}
                  leftColumn={<>
                  <BestMatches
                    lead={selectedLead}
                    // Favorites wins for a legacy duplicate — the same rule the
                    // Companion payload applies, so both surfaces agree. Presentation
                    // only; the stray row is removed by the next deliberate move.
                    recommendations={visibleRecommendations(localRecommendations, localFavorites, selectedLead?.id)}
                    // ✕ / ♡ dispatch the SAME workflow-verbs the Companion uses, so the
                    // shared handler updates state and re-broadcasts — both surfaces sync.
                    onRemoveRecommendation={(propertyUrl?: string | null) => {
                      if (!selectedLead) return
                      window.postMessage(
                        { source: COMPANION_MSG_SOURCE, type: "workflow-verb", payload: { leadId: selectedLead.id, verb: "remove-recommendation", property: { propertyUrl } } },
                        window.location.origin,
                      )
                    }}
                    onMoveToFavorite={(propertyUrl?: string | null) => {
                      if (!selectedLead) return
                      window.postMessage(
                        { source: COMPANION_MSG_SOURCE, type: "workflow-verb", payload: { leadId: selectedLead.id, verb: "move-to-favorite", property: { propertyUrl } } },
                        window.location.origin,
                      )
                    }}
                  />
                  <LeadFavorites
                    lead={selectedLead}
                    favorites={localFavorites}
                    setFavorites={setLocalFavorites}
                    nextActions={localNextActions}
                    setNextActions={setLocalNextActions}
                    tours={localTours}
                    timeZone={timeZone}
                    onRescheduleTour={handleRescheduleTour}
                    onScheduleTour={handleScheduleTour}
                    onEnterTourMode={(args) => {
                      // Tell an open Beast Companion to enter Tour Mode for this
                      // favorite. Mirrors the workspace-mode signal; the nonce
                      // guarantees re-fire even for the same favorite twice.
                      if (!selectedLead) return
                      window.postMessage(
                        {
                          source: COMPANION_MSG_SOURCE,
                          type: "tour-mode",
                          leadId: selectedLead.id,
                          favoriteId: args.favoriteId,
                          propertyName: args.propertyName,
                          nonce: `${Date.now()}-${Math.random()}`,
                        },
                        window.location.origin,
                      )
                    }}
                    onCancelTour={handleCancelTour}
                    onSendGuestCard={handleSendGuestCard}
                    onTourFollowUp={handleTourFollowUp}
                    onStartApplication={handleStartApplication}
                    onCheckApplication={handleCheckApplication}
                    onConfirmLease={handleConfirmLease}
                    onGetInvoiceDetails={handleGetInvoiceDetails}
                    onSendInvoice={handleSendInvoice}
                    onConfirmPayment={handleConfirmPayment}
                    onSendRebate={handleSendRebate}
                    // Compact ✕ — move the Favorite BACK to Recommendations (never a
                    // full delete), via the synced move-to-recommendation verb. The
                    // handler re-checks favoriteMoveBlock and refuses if a tour/Top
                    // Pick still depends on it.
                    onMoveToRecommendation={(propertyUrl?: string | null) => {
                      if (!selectedLead) return
                      window.postMessage(
                        { source: COMPANION_MSG_SOURCE, type: "workflow-verb", payload: { leadId: selectedLead.id, verb: "move-to-recommendation", property: { propertyUrl } } },
                        window.location.origin,
                      )
                    }}
                  />
                  <ClientWorkspaceTools
                    lead={selectedLead}
                    topMatches={topMatches}
                    locatorName={((agent?.name || "").trim().split(/\s+/)[0]) || ""}
                    followUpTemplates={localFollowUpTemplates}
                  />
                  {/* Invoice Details — the Closed-lead commission/invoice record
                      (leads.invoice_*). Surfaced in the workspace (the legacy Lead
                      Panel that used to host it is off) so the Closed workflow can
                      actually collect it; marking Invoice Submitted completes the
                      canonical Get Invoice Details action. Shown for Closed leads only. */}
                  {String(selectedLead.crm_status) === "closed" && (
                    <InvoiceDetailsSection
                      lead={selectedLead}
                      onUpdateLead={(updatedLead) =>
                        setLocalLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)))
                      }
                    />
                  )}
                  </>}
                  rightColumn={<>
                  <LeadNotes
                    lead={selectedLead}
                    showClientNotes={false}
                    onUpdateLead={(updatedLead) =>
                      setLocalLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)))
                    }
                  />
                  </>}
                />
              </div>

            </div>
          </div>
        )}

      </div>

      <LeadFormModal
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        timeZone={timeZone}
        onLeadCreated={(newLead) => {
          setLocalLeads((prev) => [{ ...newLead, _isNew: true }, ...prev])
        }}
      />

      {/* Edit Client — the SAME LeadFormModal in edit mode, opened by the Companion
          "edit-client" verb. Pre-populated from `editLead`; saves via UPDATE by
          lead.id. onLeadSaved merges the returned row into localLeads BY ID (the ID
          is never changed) and re-broadcasts the active-client DTO for that lead, so
          Beast Companion and the next Unleash list reflect the new criteria at once. */}
      <LeadFormModal
        open={editLead !== null}
        mode="edit"
        lead={editLead}
        onClose={() => setEditLead(null)}
        timeZone={timeZone}
        onLeadCreated={() => {}}
        onLeadSaved={(updated) => {
          if (!updated?.id) return
          setLocalLeads((prev) =>
            prev.map((l) => (String(l.id) === String(updated.id) ? { ...l, ...updated } : l))
          )
          // Re-publish the active-client DTO for this lead so Companion updates in
          // place (guarded internally to the lead the panel is showing). The next
          // Unleash list recomputes from the same updated localLeads row.
          postCompanionActiveClient({ ...editLead, ...updated }, localNextActionsRef.current)
        }}
      />

      {/* Edit Follow-up Templates — opened by the Companion "edit-templates"
          launcher. Same slideover shell as Add Lead / Edit Client. Content only:
          on save, the workspace overrides update locally so sends use the new
          wording at once, and the active-client re-broadcast (deps) pushes them
          to Companion. No workflow/Next Action/timing/stage is touched. */}
      <FollowUpTemplatesModal
        open={editTemplatesOpen}
        onClose={() => setEditTemplatesOpen(false)}
        initialOverrides={localFollowUpTemplates}
        onSaved={(overrides) => setLocalFollowUpTemplates(overrides)}
      />

      {/* B3: per-agent Follow-Up Calendar sync on FU create/advance (best-effort). */}
      <FollowUpCalendarSync />

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

      <BeastMilestoneToast />

      {/* Send Guest Card composer (Schedule Tour → Send Guest Card → Tour
          Follow-Up). Reuses GuestCardModal (PDF + mailto + privacy + signature +
          IABS); completing it marks the property's guest card sent. */}
      <GuestCardModal
        open={guestCard !== null}
        onClose={() => setGuestCard(null)}
        lead={guestCard?.lead ?? null}
        property={guestCard?.property ?? null}
        agent={agent ?? {}}
        signature={signature}
        onSent={handleGuestCardSent}
      />

      {/* Tour Follow-Up outcome modal ("How did the tour go?") — property/tour
          scoped; the ONE canonical completion drives the next action per outcome. */}
      <TourFollowUpModal
        open={tourFollowUp !== null}
        onClose={() => setTourFollowUp(null)}
        propertyName={tourFollowUp?.favorite?.property_name ?? tourFollowUp?.tour?.property_name ?? null}
        scheduledAt={tourFollowUp?.tour?.scheduled_at ?? null}
        timeZone={timeZone}
        onSubmit={handleTourFollowUpOutcome}
      />

      {/* Check Application outcome modal ("What's the application status?") —
          property-scoped to the Top Pick; the ONE canonical completion drives the
          next action per outcome (Confirm Lease / Schedule Tour / re-check / note). */}
      <CheckApplicationModal
        open={checkApplication !== null}
        onClose={() => setCheckApplication(null)}
        propertyName={checkApplication?.property?.property_name ?? checkApplication?.action?.property_name ?? null}
        timeZone={timeZone}
        onSubmit={handleCheckApplicationOutcome}
      />

      {/* Apply → Applied confirmation. 'applied' is reached ONLY here, on explicit
          confirmation the client submitted (Ready to Apply never sets it). */}
      <ConfirmDialog
        open={confirmApply !== null}
        title={`Did the client submit their application${confirmApply?.action?.property_name ? ` for ${confirmApply.action.property_name}` : ""}?`}
        message="Only confirm once the application has been submitted."
        confirmLabel="Yes, Submitted"
        cancelLabel="Not Yet"
        onConfirm={confirmApplicationSubmitted}
        onCancel={() => setConfirmApply(null)}
      />

      {/* Get Invoice Details — compact batch intake for the Closed lead's Top Pick.
          Writes the canonical invoice_* fields, updates the persistent Invoice
          Details section, and completes get_invoice_details. Blank lease fields are
          allowed (agent can save contact + notes when a property refused to share). */}
      <GetInvoiceDetailsModal
        open={getInvoice !== null}
        onClose={() => setGetInvoice(null)}
        lead={getInvoice?.lead ?? null}
        propertyName={getInvoice?.property?.property_name ?? getInvoice?.action?.property_name ?? null}
        clientName={getInvoice?.lead ? (((getInvoice.lead.preferred_name || getInvoice.lead.first_name || "") + " " + (getInvoice.lead.last_name || "")).trim() || null) : null}
        autoPropertyName={getInvoice?.lead ? autoInvoicePropertyName(getInvoice.lead, localFavoritesRef.current) : null}
        onSave={saveInvoiceDetails}
      />

      {/* Send Invoice — the invoice email composer (same pattern as Email Guest
          Card). Prefilled from the canonical invoice_* fields (property-facing
          only); Open Email launches the agent's mail client and then asks for
          explicit confirmation before marking Invoice Sent. */}
      <SendInvoiceModal
        open={sendInvoice !== null}
        onClose={() => setSendInvoice(null)}
        lead={sendInvoice?.lead ?? null}
        propertyName={sendInvoice?.property?.property_name ?? sendInvoice?.action?.property_name ?? null}
        clientName={sendInvoice?.lead ? (((sendInvoice.lead.preferred_name || sendInvoice.lead.first_name || "") + " " + (sendInvoice.lead.last_name || "")).trim() || null) : null}
        signature={signature}
        onOpened={handleInvoiceEmailOpened}
      />

      {/* "Did you send the invoice?" — opening the email never proves it was sent.
          Yes completes send_invoice + sets the durable Invoice Sent state; Not Yet
          keeps Send Invoice open. Lead stays Closed either way. */}
      <ConfirmDialog
        open={confirmInvoiceSent !== null}
        title={`Did you send the invoice${confirmInvoiceSent?.action?.property_name ? ` for ${confirmInvoiceSent.action.property_name}` : ""}?`}
        message="Only confirm once you've actually sent the invoice email to the property."
        confirmLabel="Yes, Invoice Sent"
        cancelLabel="Not Yet"
        onConfirm={confirmInvoiceSentYes}
        onCancel={() => setConfirmInvoiceSent(null)}
      />

      {/* "Did you receive the commission payment?" — the terminal closing
          confirmation. Yes completes commission_paid + sets the durable
          invoice_commission_paid; Not Yet keeps Confirm Payment open. Closed either way. */}
      <ConfirmDialog
        open={confirmPayment !== null}
        title={`Did you receive the commission payment${confirmPayment?.action?.property_name ? ` for ${confirmPayment.action.property_name}` : ""}?`}
        message="Only confirm once the commission payment has actually been received."
        confirmLabel="Yes, Commission Paid"
        cancelLabel="Not Yet"
        onConfirm={confirmPaymentYes}
        onCancel={() => setConfirmPayment(null)}
      />

      {/* "Send Rebate · {Property}" — Cash Rebate only. Locator Beast sends NO money;
          this just confirms the agent sent the rebate via their own method and
          completes the send_rebate action (durable Rebate Sent state). Missing amount
          is shown honestly, and Cancel changes nothing (agent can fix Invoice Details). */}
      <ConfirmDialog
        open={confirmRebate !== null}
        title={`Send Rebate${confirmRebate?.action?.property_name ? ` · ${confirmRebate.action.property_name}` : ""}`}
        message={
          <span className="block space-y-2.5">
            <span className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">Client</span>
              <span className="block text-[var(--crm-text-primary)]">
                {((confirmRebate?.lead?.preferred_name || confirmRebate?.lead?.first_name || "") + " " + (confirmRebate?.lead?.last_name || "")).trim() || "this client"}
              </span>
            </span>
            <span className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">Property</span>
              <span className="block text-[var(--crm-text-primary)]">{confirmRebate?.action?.property_name || "—"}</span>
            </span>
            <span className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">Client Rebate</span>
              <span className="block text-[var(--crm-text-primary)]">
                {(() => {
                  const raw = confirmRebate?.lead?.invoice_rebate_amount
                  const n = Number(raw)
                  const has = raw !== null && raw !== undefined && String(raw).trim() !== "" && !Number.isNaN(n)
                  return has ? formatInvoiceCurrency(n) : "Rebate amount not entered"
                })()}
              </span>
            </span>
            <span className="block pt-1 text-[var(--crm-text-secondary)]">
              Locator Beast isn’t sending money — confirm only once you’ve sent the rebate to the client yourself.
            </span>
          </span>
        }
        confirmLabel="Mark Rebate Sent"
        cancelLabel="Cancel"
        onConfirm={confirmRebateSent}
        onCancel={() => setConfirmRebate(null)}
      />

      {/* Confirm Lease → Closed confirmation. 'closed' is reached ONLY here, on the
          explicit "Yes, Lease Signed" (approval alone never closes). Not Yet keeps
          Confirm Lease open and preserves Approved + Top Pick. */}
      <ConfirmDialog
        open={confirmLease !== null}
        title={`Did the client sign their lease${confirmLease?.action?.property_name ? ` for ${confirmLease.action.property_name}` : ""}?`}
        message="Only confirm once the lease has been signed. This closes the lead."
        confirmLabel="Yes, Lease Signed"
        cancelLabel="Not Yet"
        onConfirm={confirmLeaseSigned}
        onCancel={() => setConfirmLease(null)}
      />

      {demoMode && <FirstRunChecklist googleConnected={googleConnected} userId={userId} />}

      {/* Agenda-side switch — available in every environment. Lets the agent flip
          the Agenda between left and right to complement whichever side their
          Chrome Beast Companion sits on. Side selection persists via localStorage
          (see toggleAgendaSide); default is the approved "left". No DB/schema.
          The label is just the arrow and the word, and the arrow sits on the side
          it will move TOWARD — "Agenda ›" to send it right, "‹ Agenda" to bring it
          back left. Position carries the meaning, so no explanatory text is needed.
          Sized to read clearly while staying visibly secondary to Ask Beast AI. */}
      <button
        type="button"
        onClick={toggleAgendaSide}
        aria-label="Switch which side the Agenda is on"
        className="fixed bottom-3 left-3 z-[60] inline-flex items-center gap-1.5 rounded-full border border-[var(--crm-border)] bg-[var(--crm-panel)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--crm-text-secondary)] shadow-[0_4px_10px_rgba(15,23,42,0.18)] hover:text-[var(--crm-text-primary)] transition-colors"
      >
        {agendaOnRight && <span aria-hidden>‹</span>}
        Agenda
        {!agendaOnRight && <span aria-hidden>›</span>}
      </button>

      {/* Centered CRM contact modal — the Kanban-drag presentation of the SAME
          canonical contact flow (Companion uses its bottom sheet). Compact, no
          explanatory paragraph; same wording as Companion. */}
      {dragContact && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-xs bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-5">
            {dragContact.phase === "choose-method" ? (
              <>
                <h3 className="text-base font-bold text-[var(--crm-text-primary)] mb-4 text-center">
                  Would you like to call or text {dragContact.name}?
                </h3>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => dragChooseMethod("call")}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold crm-cta transition-colors"
                  >
                    Call
                  </button>
                  <button
                    onClick={() => dragChooseMethod("text")}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--crm-border)] text-sm font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setDragContact(null)}
                    className="w-full px-4 py-2 rounded-xl text-sm font-medium text-[var(--crm-text-muted)] hover:bg-[var(--crm-card)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : dragContact.method === "text" ? (
              <>
                <h3 className="text-base font-bold text-[var(--crm-text-primary)] mb-4 text-center">
                  Did you send the text to {dragContact.name}?
                </h3>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => dragResolveTextSent()}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold crm-cta transition-colors"
                  >
                    Yes, Sent
                  </button>
                  <button
                    onClick={() => setDragContact(null)}
                    className="w-full px-4 py-2 rounded-xl text-sm font-medium text-[var(--crm-text-muted)] hover:bg-[var(--crm-card)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-[var(--crm-text-primary)] mb-4 text-center">
                  Were you able to contact {dragContact.name}?
                </h3>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => dragResolve("yes")}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold crm-cta transition-colors"
                  >
                    Yes, Contacted
                  </button>
                  <button
                    onClick={() => dragResolve("no-answer")}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--crm-border)] text-sm font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
                  >
                    No Answer
                  </button>
                  <button
                    onClick={() => setDragContact(null)}
                    className="w-full px-4 py-2 rounded-xl text-sm font-medium text-[var(--crm-text-muted)] hover:bg-[var(--crm-card)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
