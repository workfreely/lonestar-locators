"use client"

import { useEffect, useState, type ReactElement } from "react"
import { supabase } from "@/lib/supabase/client"
import FavoriteModal, { type FavoriteInput } from "./FavoriteModal"
import ConfirmDialog from "./ConfirmDialog"
import DateTimePicker from "./DateTimePicker"
import PropertyThumb from "./PropertyThumb"
import ReasonsControl from "./ReasonsControl"
import { SectionCard } from "./LeadPanelSections"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { upcomingTourForFavorite } from "@/lib/leads/upcomingTour"
import { favoriteMoveBlock } from "@/lib/leads/propertyCollections"
import { isClientFavorite } from "@/lib/leads/favoriteOrigin"
import { HiOutlineEnvelope, HiOutlineCalendarDays, HiCheck, HiOutlineDocumentText, HiOutlineClipboardDocumentCheck } from "react-icons/hi2"
import { favoriteSecondaryAction } from "@/lib/leads/favoriteActions"
import { propertyWebsiteHref } from "@/lib/propertyExplorer/types"
import { displayAddress, formatRating, normalizeShortSpecial, isSpecialCurrent, evaluateLocatorCommission } from "@bc/companion-shared"
import { StarRating } from "./StarRating"
import { attachCatalogRatings } from "@/lib/propertyExplorer/catalog"
import { utcToLocalTourValue, favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { formatDueDateTime } from "@/lib/actionDisplay"
import { placeIdFromPropertyUrl } from "@/lib/propertyExplorer/types"

// Human label for a picked "YYYY-MM-DDTHH:mm" wall-clock value (mirrors Add
// Task's field label). The naive local string renders as-is — the same numbers
// the user picked — and is converted to a UTC instant only on Save.
function formatPickedLabel(local: string): string {
  if (!local) return ""
  const d = new Date(local)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

// Favorite Properties — the primary property workspace for V1 (Property
// Matches is hidden; the engine stays intact behind the scenes). Lives in the
// right panel directly under the AI Assistant. Locators save/paste the
// communities they're recommending (Smart Apartment Data / RentCafe links) and
// manage them by hand. Extracted from LeadPanel with its CRUD intact.
export default function LeadFavorites({
  lead,
  reasonsByKey,
  onSaveReasons,
  favorites = [],
  setFavorites,
  nextActions = [],
  setNextActions,
  sentGuestCards = [],
  tours = [],
  timeZone,
  onRescheduleTour,
  onScheduleTour,
  onCancelTour,
  onSendGuestCard,
  onTourFollowUp,
  onStartApplication,
  onCheckApplication,
  onConfirmLease,
  onGetInvoiceDetails,
  onSendInvoice,
  onConfirmPayment,
  onSendRebate,
  onMoveToRecommendation,
  onEnterTourMode,
}: {
  /** Canonical reasons for this client, keyed by canonical_property_key — the SAME
   *  map Recommendations reads, so neither section can diverge. */
  reasonsByKey?: Map<string, string[]>
  /** Persist reasons for ONE client-property PAIR (never a favorite row id: the row
   *  is deleted when the property moves, and the reasons must outlive it). */
  onSaveReasons?: (canonicalPropertyKey: string, reasons: string[]) => Promise<boolean>
  lead: any
  favorites?: any[]
  setFavorites?: React.Dispatch<React.SetStateAction<any[]>>
  nextActions?: any[]
  setNextActions?: React.Dispatch<React.SetStateAction<any[]>>
  // Durable per-property "Guest Card Sent" signal (completed email_guest_card rows,
  // {lead_id, property_id}). Kept separate from the open-only nextActions so the
  // "Guest Card Sent" state survives a refresh (individual or bulk completion).
  sentGuestCards?: any[]
  // Canonical lead_tours appointments (read-only display). Each Favorite shows its
  // own upcoming scheduled tour, if any — lead_tours stays the source of truth.
  tours?: any[]
  timeZone?: string
  // Canonical tour edit/cancel — routed to DashboardClient's rescheduleTour /
  // cancelTour handlers (the ONE workflow path). Absent → controls are hidden.
  onRescheduleTour?: (lead: any, args: { tourId: number | string; propertyId: string; tourDate: string; tourTime: string }) => void
  // Schedule Tour (Slice A): the agent opened the property's real tour/contact page,
  // came back and confirmed a date/time. Creates the tour via the existing workflow.
  // Absent → the Schedule Tour control is hidden.
  onScheduleTour?: (lead: any, args: { favoriteId: number | string; propertyName?: string | null; tourDate: string; tourTime: string }) => void
  // Fired the moment Schedule Tour opens the external scheduler — tells an open
  // Beast Companion to enter Tour Mode for this favorite. Absent → no signal.
  onEnterTourMode?: (args: { favoriteId: number | string; propertyName: string | null; url: string | null }) => void
  onCancelTour?: (lead: any, args: { tourId: number | string; propertyId?: number | string | null }) => void
  // Open the reused Guest Card composer for a scheduled property (Schedule Tour →
  // Send Guest Card → Tour Follow-Up). Absent → the control is hidden.
  onSendGuestCard?: (lead: any, args: { favorite: any; tour: any; actionId: number | string | null }) => void
  // Open the Tour Follow-Up outcome modal for THIS property's tour. Absent → hidden.
  onTourFollowUp?: (lead: any, args: { tour: any; favorite: any; actionId: number | string | null }) => void
  // Open the "Apply" confirmation for the Top Pick's start_application. Absent → hidden.
  onStartApplication?: (lead: any, action: any) => void
  // Open the "What's the application status?" modal for the Top Pick's open
  // check_application. Absent → the control is hidden.
  onCheckApplication?: (lead: any, args: { action: any }) => void
  // Open the "Did the client sign their lease?" confirm for the Top Pick's open
  // confirm_lease. Absent → the control is hidden.
  onConfirmLease?: (lead: any, args: { action: any }) => void
  // Open the Get Invoice Details intake for the Closed Top Pick's open
  // get_invoice_details. Absent → the control is hidden.
  onGetInvoiceDetails?: (lead: any, args: { action: any }) => void
  // Open the Send Invoice composer for the Closed Top Pick's open send_invoice.
  // Absent → the control is hidden.
  onSendInvoice?: (lead: any, args: { action: any }) => void
  // Open the "did you receive payment?" confirm for the Closed Top Pick's open
  // commission_paid. Absent → the control is hidden.
  onConfirmPayment?: (lead: any, args: { action: any }) => void
  // Open the "Send Rebate" confirmation for the Closed Top Pick's open send_rebate
  // (Cash Rebate only). Absent → the control is hidden.
  onSendRebate?: (lead: any, args: { action: any }) => void
  // Compact ✕ — move the Favorite BACK to Recommendations (never a full delete),
  // via the synced move-to-recommendation verb. Absent → the control is hidden.
  onMoveToRecommendation?: (propertyUrl?: string | null) => void
}) {
  const [showFavoriteModal, setShowFavoriteModal] = useState(false)
  const [editingFavorite, setEditingFavorite] = useState<any | null>(null)

  // Tour edit/cancel draft state (per-Favorite). editDateTime holds the draft
  // "YYYY-MM-DDTHH:mm"; the Add Task Tour Date & Time control (field → DateTimePicker,
  // toggled by editPickerOpen) writes into it, and Save Changes is the single commit.
  const [editingTourFavId, setEditingTourFavId] = useState<number | string | null>(null)
  const [editTourId, setEditTourId] = useState<number | string | null>(null)
  const [editPropertyId, setEditPropertyId] = useState<string>("")
  const [editDateTime, setEditDateTime] = useState<string>("") // "YYYY-MM-DDTHH:mm"
  const [editPickerOpen, setEditPickerOpen] = useState(false)
  const [cancelingTour, setCancelingTour] = useState<null | { tourId: number | string; propertyName: string; propertyId: number | string | null }>(null)

  // Schedule Tour (Slice A) draft state (per-Favorite). step 'confirm' = the
  // "Did you schedule the tour? Yes / Not yet" prompt after the tour page opened;
  // 'datetime' = the date/time entry shown after Yes. schedDateTime = "YYYY-MM-DDTHH:mm".
  const [schedFavId, setSchedFavId] = useState<number | string | null>(null)
  const [schedStep, setSchedStep] = useState<"confirm" | "datetime">("confirm")
  const [schedDateTime, setSchedDateTime] = useState<string>("")

  // Switching the active client must never leak a tour draft (or a pending cancel)
  // from the previous lead — reset every tour-edit control when the lead changes.
  useEffect(() => {
    setEditingTourFavId(null)
    setEditTourId(null)
    setEditPropertyId("")
    setEditDateTime("")
    setEditPickerOpen(false)
    setCancelingTour(null)
    setSchedFavId(null)
    setSchedStep("confirm")
    setSchedDateTime("")
  }, [lead.id])

  // Only GENUINE Client Favorites appear here — application-only identity rows
  // (origin='application', created to anchor an Applied/guest-card workflow) are
  // hidden. They remain in the favorites data (identity/FK target), just not shown.
  const leadFavorites = favorites.filter((f) => f.lead_id === lead.id && isClientFavorite(f))
  // This lead's scheduled tours (read-only). Each Favorite resolves its own
  // upcoming appointment by lead_tours.property_id.
  const leadTours = tours.filter((t) => String(t.lead_id) === String(lead.id))

  async function handleSaveFavorite(entries: FavoriteInput[]): Promise<boolean> {
    // Demo leads are client-side only. Mirror the same UX with local rows —
    // no DB write, no guest-card workflow (all lead-id keyed / bigint).
    if (isDemoLeadId(lead.id)) {
      if (editingFavorite) {
        const input = entries[0]
        const updated = {
          ...editingFavorite,
          property_name: input.propertyName || null,
          property_url: input.propertyUrl || null,
          property_address: input.propertyAddress || null,
          property_image_url: input.propertyImageUrl ?? null,
        }
        setFavorites?.((prev) => prev.map((f) => (f.id === editingFavorite.id ? updated : f)))
      } else {
        const rows = entries.map((input, i) => ({
          id: `demo-fav-${Date.now()}-${i}`,
          lead_id: lead.id,
          property_name: input.propertyName || null,
          property_url: input.propertyUrl || null,
          property_address: input.propertyAddress || null,
          property_image_url: input.propertyImageUrl ?? null,
        }))
        setFavorites?.((prev) => [...prev, ...rows])
      }
      setShowFavoriteModal(false)
      setEditingFavorite(null)
      return true
    }

    if (editingFavorite) {
      const input = entries[0]
      const { data, error } = await supabase
        .from("lead_favorites")
        .update({
          property_name: input.propertyName || null,
          property_url: input.propertyUrl || null,
          property_address: input.propertyAddress || null,
          property_image_url: input.propertyImageUrl ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingFavorite.id)
        .select("*")
        .single()

      if (error) {
        console.error("[favorite] update failed:", error)
        return false
      }

      // Re-attach the catalog google_rating (single batched lookup) so an
      // in-place edit doesn't drop the star until a full reload. property_catalog
      // stays the source of truth — nothing is persisted on lead_favorites.
      const [enriched] = await attachCatalogRatings([data], supabase)
      setFavorites?.((prev) => prev.map((f) => (f.id === enriched.id ? enriched : f)))
      setShowFavoriteModal(false)
      setEditingFavorite(null)
      return true
    }

    // Dedupe/promotion by (lead_id, property_url): a property that already exists for
    // this lead is never duplicated. If the existing row is an application-only
    // identity row, PROMOTE it in place to a genuine favorite (same id, all FKs
    // preserved); if it is already a genuine favorite, it is left as-is. Only entries
    // with no existing row are inserted.
    // Matched on the CANONICAL KEY, not the raw URL string. lead_favorites has a
    // unique index on (lead_id, canonical_property_key), and that column is
    // GENERATED as 'pid:<place id>' when the URL carries one, else
    // 'url:<lower(btrim(url))>'. Comparing raw URLs missed the case this pass
    // creates: the same property added once from the property search (a
    // '?q=place_id:' URL) and once from a pasted listing link resolve to the SAME
    // place id, so a raw-string compare would have let both through and the insert
    // would then fail on the index with a 23505 instead of deduping gracefully.
    const canonicalKey = (url: string) => {
      const u = String(url ?? "").trim()
      if (!u) return ""
      const pid = placeIdFromPropertyUrl(u)
      return pid ? `pid:${pid}` : `url:${u.toLowerCase()}`
    }
    const existingByUrl = (url: string) => {
      const key = canonicalKey(url)
      if (!key) return null
      return favorites.find((f) => f.lead_id === lead.id && canonicalKey(String(f.property_url ?? "")) === key) ?? null
    }
    const toInsert = entries.filter((input) => !existingByUrl(input.propertyUrl || ""))
    const toPromote = entries
      .map((input) => existingByUrl(input.propertyUrl || ""))
      .filter((row): row is any => !!row && !isClientFavorite(row))

    if (toPromote.length > 0) {
      const ids = toPromote.map((r) => r.id)
      setFavorites?.((prev) => prev.map((f) => (ids.includes(f.id) ? { ...f, origin: "favorite" } : f)))
      const realIds = ids.filter((id) => !String(id).startsWith("demo-"))
      if (realIds.length > 0) {
        const { error: promoteErr } = await supabase.from("lead_favorites").update({ origin: "favorite" }).in("id", realIds)
        if (promoteErr) console.error("[favorite] promote failed:", promoteErr)
      }
    }

    if (toInsert.length === 0) {
      // Everything the agent added already existed (and any application rows were just
      // promoted) — nothing new to insert.
      setShowFavoriteModal(false)
      return true
    }

    const { data, error } = await supabase
      .from("lead_favorites")
      .insert(toInsert.map((input) => ({
        lead_id: lead.id,
        property_name: input.propertyName || null,
        property_url: input.propertyUrl || null,
        property_address: input.propertyAddress || null,
        property_image_url: input.propertyImageUrl ?? null,
      })))
      .select("*")

    if (error) {
      console.error("[favorite] create failed:", error)
      return false
    }

    // Same read-side rating resolution for newly created favorites (one batched
    // catalog lookup for the whole insert), so their stars show immediately.
    const enriched = await attachCatalogRatings(data ?? [], supabase)
    setFavorites?.((prev) => [...prev, ...enriched])
    setShowFavoriteModal(false)

    // Re-anchored workflow: a Favorite alone NO LONGER creates a Guest Card
    // action. The per-property "Send Guest Card" is created when a tour is
    // SCHEDULED for that property (completeSetupTour → createGuestCardForProperty),
    // since that's when we know the exact property + tour date/time.

    return true
  }

  function openEditFavorite(favorite: any) {
    setEditingFavorite(favorite)
    setShowFavoriteModal(true)
  }

  function closeFavoriteModal() {
    setShowFavoriteModal(false)
    setEditingFavorite(null)
  }

  // Edit/Reschedule: open the inline editor prefilled with the tour's CURRENT
  // Favorite + local date/time (never a fresh 9 AM — this is an existing tour).
  function startEditTour(fav: any, tour: any) {
    setEditingTourFavId(fav.id)
    setEditTourId(tour.id)
    setEditPropertyId(String(fav.id)) // the Favorite this tour is currently linked to
    setEditDateTime(utcToLocalTourValue(tour.scheduled_at, timeZone))
    setEditPickerOpen(false)
  }
  function closeEditTour() {
    setEditingTourFavId(null)
    setEditTourId(null)
    setEditPropertyId("")
    setEditDateTime("")
    setEditPickerOpen(false)
  }
  function saveEditTour() {
    if (editTourId == null || !editDateTime) return
    const [tourDate, tourTime] = editDateTime.split("T")
    if (!tourDate || !tourTime) return
    onRescheduleTour?.(lead, { tourId: editTourId, propertyId: editPropertyId, tourDate, tourTime })
    closeEditTour()
  }
  function confirmCancelTour() {
    const c = cancelingTour
    setCancelingTour(null)
    if (!c) return
    onCancelTour?.(lead, { tourId: c.tourId, propertyId: c.propertyId })
  }

  return (
    <>
      <SectionCard title="Favorite Properties" collapsible defaultOpen={true} storageKey="favorite-properties">
        {leadFavorites.length === 0 ? (
          <p className="text-[11px] text-[var(--crm-text-muted)]">No favorite properties added.</p>
        ) : (
          <div className="space-y-1.5">
            {leadFavorites.map((fav) => {
              // The upcoming scheduled tour for THIS property (source of truth =
              // lead_tours, linked by property_id). Null → render nothing extra.
              const tour = upcomingTourForFavorite(leadTours, fav.id)
              // Schedule Tour target: the real scheduling page (property_catalog.tour_url,
              // resolved read-side) or, as a fallback, the leasing/contact site — never a
              // Google Maps URL (propertyWebsiteHref guards that). Null → no button.
              const schedTarget = propertyWebsiteHref((fav as { tour_url?: string | null }).tour_url) || propertyWebsiteHref((fav as { website_url?: string | null }).website_url)
              // This property's Guest Card state (created when its tour is
              // scheduled): open → "Send Guest Card"; completed → "Guest Card
              // Sent ✓". Null when no guest card for this property.
              const gcAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  (String(a.action_key ?? "") === "email_guest_card" || String(a.title ?? "").trim().toLowerCase() === "email guest card")
              )
              // "Guest Card Sent" when the property-scoped email_guest_card action is
              // completed. Derives from EITHER the in-session action (open queue still
              // holds it right after completion) OR the durable sentGuestCards source
              // (survives refresh; individual or bulk) — both canonical + property-scoped.
              const gcSentDurable = (sentGuestCards ?? []).some(
                (s: any) => String(s.lead_id) === String(lead.id) && String(s.property_id ?? "") === String(fav.id),
              )
              const gcSent = gcSentDurable || (!!gcAction && (gcAction.completed === true || gcAction.status === "completed"))
              // This property's scheduled tour (past OR future) + whether it has
              // already occurred → drives the Tour Follow-Up affordance once the
              // guest card is sent. (`tour` above is the FUTURE tour for display.)
              const scheduledTour = leadTours.find(
                (t: any) => String(t.property_id ?? "") === String(fav.id) && (t.status ?? "scheduled") === "scheduled",
              )
              const tourOccurred = !!scheduledTour && new Date(scheduledTour.scheduled_at).getTime() <= Date.now()
              // Property-scoped open Tour Follow-Up / Apply actions.
              const tfAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  !a.completed &&
                  (String(a.action_key ?? "") === "tour_follow_up" || String(a.title ?? "").trim().toLowerCase() === "tour follow-up"),
              )
              const applyAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  !a.completed &&
                  (String(a.action_key ?? "") === "start_application" || String(a.title ?? "").trim().toLowerCase() === "apply"),
              )
              // The recorded outcome for this property (durable lead_tours.outcome).
              const outcomeTour = leadTours
                .filter((t: any) => String(t.property_id ?? "") === String(fav.id) && t.outcome)
                .sort((a: any, b: any) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0]
              const isTopPick = String(lead.top_pick_favorite_id ?? "") !== "" && String(lead.top_pick_favorite_id) === String(fav.id)
              // This property's Check Application row (stamped property_id = Top
              // Pick at creation, D5). Any status → this Favorite IS the application
              // property (survives Denied clearing the live Top Pick, since the
              // completed row keeps its property_id). MVP: one application per lead.
              const checkAppAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  (String(a.action_key ?? "") === "check_application" ||
                    String(a.title ?? "").trim().toLowerCase() === "check app" ||
                    String(a.title ?? "").trim().toLowerCase() === "check application"),
              )
              const isApplicationProperty = !!checkAppAction
              const checkAppOpen = !!checkAppAction && !(checkAppAction.completed === true || checkAppAction.status === "completed")
              // The ONE second action on the property row, resolved here so the markup cannot
              // drift into offering both. Check Application outranks Schedule Tour: it is the
              // later workflow state and the one awaiting an answer.
              // The tour HAPPENED and its outcome is still open. `!tour` keeps an UPCOMING tour out
              // of this entirely — that card keeps its scheduled date and time exactly as it is.
              const tourFollowUpOpen = !tour && tourOccurred && !!tfAction
              const secondaryAction = favoriteSecondaryAction({
                checkApplicationOpen: checkAppOpen,
                canCheckApplication: !!onCheckApplication,
                tourFollowUpOpen,
                canTourFollowUp: !!onTourFollowUp,
                hasScheduledTour: !!scheduledTour,
                canScheduleTour: !!onScheduleTour,
                hasScheduleTarget: !!schedTarget,
              })
              const showCheckApp = secondaryAction === "check_application"
              const showTourFollowUp = secondaryAction === "tour_follow_up"
              const showScheduleTour = secondaryAction === "schedule_tour"
              const applicationStatus = (lead.application_status ?? null) as any
              // This property's open Confirm Lease (created on Approved, property-
              // scoped to the Top Pick). Approved → Confirm Lease → Lease Signed.
              const confirmLeaseAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  !a.completed &&
                  (String(a.action_key ?? "") === "confirm_lease" || String(a.title ?? "").trim().toLowerCase() === "confirm lease"),
              )
              const confirmLeaseOpen = !!confirmLeaseAction
              const closedStage = String(lead.crm_status ?? "") === "closed"
              // This property's open Get Invoice Details (created on Lease Signed,
              // property-scoped to the Top Pick). Closed → Get Invoice Details.
              const getInvoiceAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  !a.completed &&
                  (String(a.action_key ?? "") === "get_invoice_details" || String(a.title ?? "").trim().toLowerCase() === "get invoice details"),
              )
              const getInvoiceOpen = !!getInvoiceAction
              // This property's open Send Invoice (created when Get Invoice Details
              // completes, property-scoped to the Top Pick). Closed → Send Invoice.
              const sendInvoiceAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  !a.completed &&
                  (String(a.action_key ?? "") === "send_invoice" || String(a.title ?? "").trim().toLowerCase() === "send invoice"),
              )
              const sendInvoiceOpen = !!sendInvoiceAction
              // Durable Invoice Sent state (leads.invoice_submitted) — the furthest
              // closing milestone surfaced on the Top Pick once confirmed sent.
              const invoiceSent = !!lead.invoice_submitted
              // This property's open Confirm Payment (created when Invoice Sent,
              // property-scoped to the Top Pick). Invoice Sent → Confirm Payment.
              const commissionPaidAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  !a.completed &&
                  (String(a.action_key ?? "") === "commission_paid" || String(a.title ?? "").trim().toLowerCase() === "confirm payment"),
              )
              const commissionPaidOpen = !!commissionPaidAction
              // Durable Commission Paid state (leads.invoice_commission_paid) — a
              // closing milestone surfaced on the Top Pick once confirmed.
              const commissionPaid = !!lead.invoice_commission_paid
              // This property's open Send Rebate (created at Commission Paid for a
              // Cash Rebate lead, property-scoped to the Top Pick). Cash Rebate only.
              const sendRebateAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  !a.completed &&
                  (String(a.action_key ?? "") === "send_rebate" || String(a.title ?? "").trim().toLowerCase() === "send rebate"),
              )
              const sendRebateOpen = !!sendRebateAction
              // Rebate Sent state — no durable leads.* flag exists; the completed
              // send_rebate action IS the state. The FURTHEST closing milestone.
              const rebateSent = nextActions.some(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  (a.completed === true || a.status === "completed") &&
                  (String(a.action_key ?? "") === "send_rebate" || String(a.title ?? "").trim().toLowerCase() === "send rebate"),
              )
              // Canonical surfaced state: always the FURTHEST canonical state —
              // "Ready to Apply" pre-submission → "Applied" once 'applied' → the
              // application-phase state (Approved / Application Pending / Application
              // Denied) once an outcome is recorded. Derived, not a separate UI flag.
              const favState = favoriteTourStateLabel({
                applyActionOpen: !!applyAction,
                isTopPick,
                appliedStage: String(lead.crm_status ?? "") === "applied",
                tourStatus: outcomeTour?.status,
                outcome: outcomeTour?.outcome ?? null,
                applicationStatus,
                isApplicationProperty,
                closedStage,
                invoiceSent,
                commissionPaid,
                rebateSent,
              })
              // Locator-facing status — Special (blue, compact, beside the name) +
              // Commission (green/red/neutral, on the far right of the actions row). fav
              // carries the canonical property_catalog fields via attachCatalogRatings.
              const favShortSpecial = isSpecialCurrent(fav.current_special_checked_at ?? fav.verified_at) ? normalizeShortSpecial(fav.current_special) : null
              const favCommission = evaluateLocatorCommission({
                sendCommission: fav.send_commission,
                escortCommission: fav.escort_commission,
                bonusFlat: fav.bonus_flat,
              })
              // Genuine Match % (same 0–100 scale as Map / Beast Companion) — rendered ONLY
              // when a real score is present (> 0). These rows carry no score yet, so it
              // renders nothing today — never a placeholder, default, or 0%.
              const favMatchScore = typeof (fav as { match_score?: unknown }).match_score === "number" ? (fav as { match_score: number }).match_score : null
              const favShowMatch = favMatchScore !== null && Number.isFinite(favMatchScore) && favMatchScore > 0
              // Commission pill (shared across the operational row + fallback).
              const favCommissionPill = favCommission.state === "paying" ? (
                <span className="rounded-lg border border-[#8ecaa6] bg-[#dff5e6] px-2.5 py-[3px] text-[11px] font-medium leading-none text-[#136c3a]">
                  <span className="font-semibold">Commission:</span> {favCommission.text}
                </span>
              ) : favCommission.state === "not_paying" ? (
                <span className="rounded-lg border border-[#eaa9a5] bg-[#fdeaea] px-2.5 py-[3px] text-[11px] font-semibold leading-none text-[#b42318]">Not Paying Locators</span>
              ) : (
                <span className="rounded-lg border border-[#cbd4e0] bg-[#eef1f5] px-2.5 py-[3px] text-[11px] font-medium leading-none text-[#5a6b86]">Commission Not Verified</span>
              )
              // Top-right controls (✕ back to Recommendations / Edit Property) — placed on
              // the property-name row, matching Recommended's controls placement.
              const favControls = (
                <div className="flex flex-none items-center gap-2.5">
                  {onMoveToRecommendation && (() => {
                    // ✕ moves the Favorite BACK to Recommendations (never a delete). Blocked
                    // while a scheduled tour / Top Pick / open property-scoped action still
                    // depends on it — disabled with the reason, matching the Companion.
                    const block = favoriteMoveBlock({ favorite: fav, lead, tours: leadTours, nextActions }).reason
                    return (
                      <button
                        type="button"
                        aria-label={block ? `Can't move back — ${block}` : "Move to recommendations"}
                        title={block ? `Can't move back — ${block}` : "Move to recommendations"}
                        disabled={!!block}
                        onClick={() => !block && onMoveToRecommendation(fav.property_url)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] leading-none text-[var(--crm-text-muted)] transition-colors hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        ✕
                      </button>
                    )
                  })()}
                  <button
                    type="button"
                    onClick={() => openEditFavorite(fav)}
                    className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"
                  >
                    Edit Property
                  </button>
                </div>
              )
              return (
                <div
                  key={fav.id}
                  className="bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-lg px-3 py-2"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Shared property thumbnail (same treatment as Recommended
                        Properties). property_image_url carries the resolved image
                        once persisted; until then PropertyThumb shows the clean
                        placeholder — never a broken image. */}
                    <PropertyThumb src={fav.property_image_url} alt={fav.property_name || ""} />
                    {(() => {
                    // The name links ONLY to the real property website (resolved read-side
                    // from property_catalog.website_url), never the placeUrl (Google Maps).
                    const favHref = propertyWebsiteHref((fav as { website_url?: string | null }).website_url)
                    const nameEl = favHref ? (
                      <a href={favHref} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--crm-accent)] hover:underline">{fav.property_name || "Property"}</a>
                    ) : (
                      <p className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--crm-text-primary)]">{fav.property_name}</p>
                    )
                    return (
                      <div className="min-w-0 flex-1">
                        {/* Name row — property name (typography unchanged) + top-right controls.
                            TOP PICK SITS WITH THE NAME, not on the status line. It answers "which
                            property is this lead moving on", which is a property of the property —
                            the same fact whether the card currently reads Guest Card Sent, Check
                            Application or Payment. It used to be a "★ Top Pick · " prefix repeated
                            on all seven status lines, so it changed position as the lead advanced
                            and disappeared entirely in states that render no status line.
                            It is DERIVED, never stored per favourite: isTopPick compares this
                            favourite's id against leads.top_pick_favorite_id, which the Tour
                            Follow-Up and application workflows own. Nothing here writes it. */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-1.5">
                            {nameEl}
                            {isTopPick && (
                              <span
                                className="flex-none inline-flex items-center gap-[3px] rounded
                                           border border-emerald-600/40 bg-emerald-600/12
                                           px-1.5 py-[1px] text-[10px] font-semibold text-emerald-600"
                                title="Top Pick — the property this lead is moving on. Set by the Tour Follow-Up outcome."
                              >
                                <span aria-hidden>★</span>Top Pick
                              </span>
                            )}
                          </div>
                          {favControls}
                        </div>
                        {/* Address row — address left, Special (compact, current/verified
                            only) on the far right. mt-[7px] gives clear separation below the
                            top-right controls so the Special never reads as attached to Edit. */}
                        {(fav.property_address || favShortSpecial) && (
                          <div className="mt-[7px] flex items-center justify-between gap-2">
                            <p className="min-w-0 truncate text-[11px] text-[var(--crm-text-muted)]">{fav.property_address ? displayAddress(fav.property_address) : ""}</p>
                            {favShortSpecial && (
                              <span className="flex-none rounded-md border border-[#8fb6ea] bg-[#e8f0fe] px-1 py-[1px] text-[9px] font-semibold leading-none text-[#1c3f75]">{favShortSpecial}</span>
                            )}
                          </div>
                        )}
                        {/* Rating row — Google rating left, genuine Match % on the far right
                            (only when a real score exists). */}
                        {(typeof fav.google_rating === "number" || favShowMatch) && (
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {typeof fav.google_rating === "number" && (
                                <>
                                  <span className="text-[11px] font-semibold tabular-nums text-[var(--crm-text-secondary)]">{formatRating(fav.google_rating)}</span>
                                  <StarRating value={fav.google_rating} />
                                  <span className="-ml-[3px] text-[11px] text-[var(--crm-text-muted)]">Google Rating</span>
                                </>
                              )}
                            </div>
                            {favShowMatch && (
                              <span className="flex-none rounded-md border border-[var(--crm-border)] px-1.5 py-[1px] text-[10px] font-semibold leading-none text-[var(--crm-text-secondary)]">{favMatchScore}% <span className="font-medium text-[var(--crm-text-muted)]">Match</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                    })()}
                  </div>

                  {/* "Why I chose this for you" — the SAME canonical client-property row
                      Recommendations edits, so a change here shows there and vice versa.
                      Compact and secondary; the Favorites layout is otherwise untouched. */}
                  {onSaveReasons && fav.canonical_property_key && (
                    <div className="mt-2">
                      <ReasonsControl
                        reasons={reasonsByKey?.get(String(fav.canonical_property_key)) ?? []}
                        onSave={(next) => onSaveReasons(String(fav.canonical_property_key), next)}
                      />
                    </div>
                  )}

                  {/* Scheduled-tour metadata — mirrors the Lead Panel "Next Action
                      → Due" treatment (muted uppercase label + muted value line,
                      same canonical formatDueDateTime). Edit / Cancel Tour sit to
                      the right on desktop. Only shown when a linked upcoming tour
                      exists; nothing rendered otherwise. */}
                  {/* Property actions — Send Guest Card (LEFT) | Schedule Tour (RIGHT),
                      ungated. Guest Card is the pre-tour prerequisite, so it leads and is
                      no longer gated behind having scheduled a tour. Both are scoped to
                      THIS exact Favorite (property_id). While the schedule confirm/date
                      sub-flow is open for this card, that flow takes the row. */}
                  {/* The row renders when ANY of its actions can — Check Application included,
                      so an applied property still gets the line even with no Guest Card control. */}
                  {(onSendGuestCard || (onScheduleTour && schedTarget) || (checkAppOpen && onCheckApplication)) && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      {schedFavId !== fav.id ? (
                        /* Operational block, stacked: the action row first, Commission on
                           its own row beneath it.
                           [✉ Send Guest Card] | [▣ Schedule Tour]
                           [                              Commission ]
                           Commission used to sit on the SAME row as `justify-between` with
                           `flex-none`, so it never shrank and the action group — which does
                           wrap — gave way first: on a narrow Favorites column the two
                           actions stacked vertically instead of sitting side by side. Giving
                           the actions the full width keeps them on one line, and `flex-wrap`
                           is kept so they still wrap when the column is genuinely too narrow
                           rather than overflowing. This also matches the no-actions fallback
                           below, which already renders Commission alone on a justify-end row. */
                        <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-semibold">
                          {/* Send Guest Card / ✓ Guest Card Sent (completed = not clickable). */}
                          {gcSent ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-600">
                              <HiCheck className="text-[13px]" aria-hidden /> Guest Card Sent
                            </span>
                          ) : onSendGuestCard ? (
                            <button
                              type="button"
                              onClick={() => onSendGuestCard(lead, { favorite: fav, tour: scheduledTour ?? null, actionId: gcAction?.id ?? null })}
                              className="inline-flex items-center gap-1.5 text-[var(--crm-accent)] hover:underline"
                            >
                              <HiOutlineEnvelope className="text-[13px]" aria-hidden /> Send Guest Card
                            </button>
                          ) : null}
                          {/* ONE SECOND ACTION, CHOSEN BY WORKFLOW STATE — never two.
                              Schedule Tour, Tour Follow-Up and Check Application are consecutive
                              moments in the same workflow: you schedule before a tour, you record
                              the outcome after it happened, you check the application once one was
                              submitted. The resolver returns the LATEST state that qualifies, so a
                              card can never offer two, whatever the data looks like. Tour Follow-Up
                              used to sit in its own row at the bottom of the card with a "TOURED"
                              label and the tour's date beside it; it says the same thing here in
                              one line. */}
                          {(gcSent || onSendGuestCard) && (showCheckApp || showTourFollowUp || showScheduleTour) && (
                            <span aria-hidden className="h-3 w-px bg-[var(--crm-border)]" />
                          )}
                          {showCheckApp && (
                            <button
                              type="button"
                              onClick={() => onCheckApplication!(lead, { action: checkAppAction })}
                              className="inline-flex items-center gap-1.5 text-[var(--crm-accent)] hover:underline"
                            >
                              <HiOutlineDocumentText className="text-[13px]" aria-hidden /> Check Application
                            </button>
                          )}
                          {/* Tour Follow-Up — the tour happened, its outcome is open. Same markup
                              as Check Application above: same accent colour, icon size, gap,
                              alignment, hover and type. Same handler and arguments as the row it
                              replaces, so only the presentation moved. */}
                          {showTourFollowUp && (
                            <button
                              type="button"
                              onClick={() => onTourFollowUp!(lead, { tour: scheduledTour, favorite: fav, actionId: tfAction.id })}
                              className="inline-flex items-center gap-1.5 text-[var(--crm-accent)] hover:underline"
                            >
                              <HiOutlineClipboardDocumentCheck className="text-[13px]" aria-hidden /> Tour Follow-Up
                            </button>
                          )}
                          {/* Schedule Tour (only when no tour is scheduled yet). */}
                          {showScheduleTour && (
                            <button
                              type="button"
                              onClick={() => {
                                // Non-null by construction: favoriteSecondaryAction returns
                                // "schedule_tour" only when hasScheduleTarget is true. The old
                                // inline guard narrowed this; the resolver does it less visibly.
                                window.open(schedTarget!, "_blank", "noopener,noreferrer")
                                // Pass the EXACT scheduler URL we just opened so the
                                // Companion can bind Autofill to THIS property tab/origin
                                // (never the active tab). schedTarget is the tour_url/
                                // website the new tab was opened to.
                                onEnterTourMode?.({ favoriteId: fav.id, propertyName: fav.property_name ?? null, url: schedTarget })
                                setSchedFavId(fav.id); setSchedStep("confirm"); setSchedDateTime("")
                              }}
                              className="inline-flex items-center gap-1.5 text-[var(--crm-accent)] hover:underline"
                            >
                              <HiOutlineCalendarDays className="text-[13px]" aria-hidden /> Schedule Tour
                            </button>
                          )}
                        </div>
                        {/* Guarded so a card with no commission control renders no empty
                            row (space-y-2 would otherwise leave dead space). */}
                        {favCommissionPill && (
                          <div className="flex items-center justify-end">{favCommissionPill}</div>
                        )}
                        </div>
                      ) : schedStep === "confirm" ? (
                        // Attention glow while awaiting the locator's answer — reuses
                        // the EXACT Lead Board active-card treatment (.kb-fresh → the
                        // kb-pulse ::after, theme-aware via --kb-accent, same timing +
                        // reduced-motion behavior). `relative` anchors that ::after. The
                        // glow is scoped to this confirmation area and unmounts the moment
                        // Yes / Not yet is chosen (this branch stops rendering).
                        <div className="relative kb-fresh flex flex-wrap items-center gap-2.5">
                          <span className="text-[12px] text-[var(--crm-text-secondary)]">Did you schedule the tour?</span>
                          <button type="button" onClick={() => setSchedStep("datetime")} className="text-[11px] font-semibold text-[var(--crm-accent)] hover:underline">Yes</button>
                          <button type="button" onClick={() => { setSchedFavId(null); setSchedStep("confirm") }} className="text-[11px] font-semibold text-[var(--crm-text-muted)] hover:text-[var(--crm-text-secondary)]">Not yet</button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-[var(--crm-text-secondary)]">When is the tour?</p>
                          <DateTimePicker value={schedDateTime} onChange={(v) => setSchedDateTime(v)} compact />
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              disabled={!schedDateTime.split("T")[0] || !schedDateTime.split("T")[1]}
                              onClick={() => {
                                const [d, t] = schedDateTime.split("T")
                                if (!d || !t) return
                                onScheduleTour?.(lead, { favoriteId: fav.id, propertyName: fav.property_name, tourDate: d, tourTime: t })
                                setSchedFavId(null); setSchedStep("confirm"); setSchedDateTime("")
                              }}
                              className="text-[11px] font-semibold text-[var(--crm-accent)] hover:underline disabled:opacity-40"
                            >
                              Save tour
                            </button>
                            <button type="button" onClick={() => { setSchedFavId(null); setSchedStep("confirm"); setSchedDateTime("") }} className="text-[11px] font-semibold text-[var(--crm-text-muted)] hover:text-[var(--crm-text-secondary)]">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Fallback — if the Guest Card / Schedule Tour actions row is not shown,
                      Commission still appears on its own bottom-right operational row so a
                      commission state is never hidden. */}
                  {!(onSendGuestCard || (onScheduleTour && schedTarget)) && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)] flex items-center justify-end">
                      {favCommissionPill}
                    </div>
                  )}
                  {tour && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      {/* Compact scheduled-tour state: ONE date line then ONE action
                          row (Send Guest Card · Reschedule · Cancel Tour), joined by
                          a subtle middle dot. Styling stays consistent with the
                          Favorite row; the action links wrap only when width forces. */}
                      <p className="text-[12px] leading-tight text-[var(--crm-text-secondary)]">
                        <span className="font-semibold text-[var(--crm-text-primary)]">Tour Scheduled</span>
                        <span className="mx-1.5 text-[var(--crm-text-muted)]">·</span>
                        <span className="font-medium">
                          {formatDueDateTime(tour.scheduled_at, { timeZone: timeZone ?? undefined })}
                        </span>
                      </p>
                      {(onRescheduleTour || onCancelTour) && editingTourFavId !== fav.id && (() => {
                        // Tour management only — the Guest Card control lives in the
                        // ungated top-level Send Guest Card | Schedule Tour row above, so
                        // it isn't duplicated here: Reschedule · Cancel Tour.
                        const actions: ReactElement[] = []
                        if (onRescheduleTour) {
                          actions.push(
                            <button key="re" type="button" onClick={() => startEditTour(fav, tour)} className="text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]">Reschedule</button>
                          )
                        }
                        if (onCancelTour) {
                          actions.push(
                            <button key="cx" type="button" onClick={() => setCancelingTour({ tourId: tour.id, propertyName: fav.property_name || fav.property_url || "this property", propertyId: tour.property_id ?? fav.id })} className="text-red-500 hover:text-red-700">Cancel Tour</button>
                          )
                        }
                        if (!actions.length) return null
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold">
                            {actions.flatMap((node, i) =>
                              i === 0
                                ? [node]
                                : [<span key={`sep-${i}`} className="text-[var(--crm-text-muted)]">·</span>, node]
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* The occurred-tour row that used to live here — "TOURED", the tour's date and
                      time, and a Tour Follow-Up button — is gone. The action moved up into the
                      property action row beside Guest Card Sent, where it reads as the card's next
                      step instead of a second status band. Nothing else about the tour changed:
                      the tour row above still shows an UPCOMING tour's date and time, and the
                      scheduled_at that row displayed is untouched in the data. */}

                  {/* Ready to Apply → this property is the Top Pick; the next step
                      is the canonical Apply (start_application) confirmation. */}
                  {applyAction && onStartApplication && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">{favState}</p>
                        <button
                          type="button"
                          onClick={() => onStartApplication(lead, applyAction)}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Mark as Applied
                        </button>
                      </div>
                    </div>
                  )}

                  {/* THE CHECK APPLICATION STATE LINE IS GONE, and the row with it.
                      The BUTTON had already moved up to the property action row beside Guest
                      Card Sent; what was left here was a bordered row carrying nothing but the
                      green favState label — "Toured · Application Pending" and its siblings.
                      That restated what the card already shows: Check Application is on the
                      action row, and Beast Companion carries Last Action, Next Action and the
                      application follow-up. Removing the row also reclaims its mt-2 pt-2 border-t,
                      which is the compactness this change is for.
                      REMOVED FROM THE CARD ONLY. favoriteTourStateLabel is a pure function that
                      DERIVES this string from canonical tour/application state — it stores
                      nothing — so tour history, application tracking, CRM stage, next actions,
                      reminders and follow-up automation are all untouched, and the data stays
                      available to AI Client Insights and reporting. Every OTHER favState branch
                      (Apply, Confirm Lease, Invoice, Commission, Rebate, and the no-action
                      fallback) is deliberately left alone: each pairs the label with its own
                      action button, so the label there is a caption, not a restatement. */}

                  {/* Application approved → Confirm Lease (property-scoped to the Top
                      Pick). "Did the client sign?" — Yes advances to Closed. */}
                  {confirmLeaseOpen && onConfirmLease && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">
                          {favState}
                        </p>
                        <button
                          type="button"
                          onClick={() => onConfirmLease(lead, { action: confirmLeaseAction })}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Confirm Lease
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Closed (lease signed) → Get Invoice Details (property-scoped to
                      the Top Pick). Opens the compact invoice intake. */}
                  {getInvoiceOpen && onGetInvoiceDetails && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">
                          {favState}
                        </p>
                        <button
                          type="button"
                          onClick={() => onGetInvoiceDetails(lead, { action: getInvoiceAction })}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Get Invoice Details
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Invoice collected → Send Invoice (property-scoped to the Top
                      Pick). Opens the invoice email composer. Disappears once the
                      agent confirms Invoice Sent (favState then reads Invoice Sent). */}
                  {sendInvoiceOpen && onSendInvoice && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">
                          {favState}
                        </p>
                        <button
                          type="button"
                          onClick={() => onSendInvoice(lead, { action: sendInvoiceAction })}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Send Invoice
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Invoice sent → Confirm Payment (property-scoped to the Top
                      Pick). The terminal closing step; disappears once the agent
                      confirms payment (favState then reads Commission Paid). */}
                  {commissionPaidOpen && onConfirmPayment && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">
                          {favState}
                        </p>
                        <button
                          type="button"
                          onClick={() => onConfirmPayment(lead, { action: commissionPaidAction })}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Confirm Invoice Paid
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Commission paid + Cash Rebate → Send Rebate (property-scoped to
                      the Top Pick). Terminal for this branch; disappears once the
                      agent marks it sent (favState then reads Rebate Sent). */}
                  {sendRebateOpen && onSendRebate && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">
                          {favState}
                        </p>
                        <button
                          type="button"
                          onClick={() => onSendRebate(lead, { action: sendRebateAction })}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Send Rebate
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Recorded outcome with no pending action — one compact muted line
                      (no badge stack). Top Pick shown inline when this property is it. */}
                  {!tour && !tfAction && !applyAction && !checkAppOpen && !confirmLeaseOpen && !getInvoiceOpen && !sendInvoiceOpen && !commissionPaidOpen && !sendRebateOpen && favState && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <p className="text-[11px] font-medium text-[var(--crm-text-muted)]">
                        {favState}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowFavoriteModal(true)}
          className="mt-2.5 w-full text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border border-dashed border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:border-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] transition-colors"
        >
          + Add Favorites
        </button>
      </SectionCard>

      <FavoriteModal open={showFavoriteModal} editing={editingFavorite} marketCity={lead?.city ?? null} onClose={closeFavoriteModal} onSave={handleSaveFavorite} />

      {/* Cancel Tour — confirm before changing anything. Marks the tour canceled
          (history preserved), removes the Tour Follow-Up, and restores Schedule
          Tour. The Favorite itself is never deleted. */}
      <ConfirmDialog
        open={cancelingTour !== null}
        title={`Cancel this tour at ${cancelingTour?.propertyName ?? "this property"}?`}
        message={`The tour will be canceled and removed from your upcoming tours. ${cancelingTour?.propertyName ?? "This property"} will remain in Favorites.`}
        confirmLabel="Cancel Tour"
        cancelLabel="Keep Tour"
        danger
        onConfirm={confirmCancelTour}
        onCancel={() => setCancelingTour(null)}
      />

      {/* Reschedule Tour — a modal that REUSES the Add Task presentation (same
          centered dialog shell + the same DateTimePicker), so the calendar has
          room and can never overflow the Favorite Properties section. The picker
          runs in live-commit mode (no internal Apply/Cancel): selecting a date or
          time only updates the draft; the single Save Changes below persists. The
          tour's current date+time are prefilled, so changing one keeps the other. */}
      {editingTourFavId !== null && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
          {/* Compact sizing pass: ~20% narrower + tighter padding/spacing than the
              Add Task modal so the Reschedule dialog clears the CRM nav bar with
              room above/below. Sizing only — structure/behavior unchanged. */}
          <div className="w-full max-w-[300px] bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-5">
            <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">Reschedule Tour</h3>
            <div className="mt-3 space-y-2">
              <div>
                <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">Property</label>
                <select
                  value={editPropertyId}
                  onChange={(e) => setEditPropertyId(e.target.value)}
                  className="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
                >
                  {leadFavorites.map((f) => (
                    <option key={f.id} value={String(f.id)}>{f.property_name || f.property_url}</option>
                  ))}
                  <option value="__other__">Other Property</option>
                  <option value="__none__">Schedule Without Property</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">Tour Date &amp; Time</label>
                <button
                  type="button"
                  onClick={() => setEditPickerOpen((v) => !v)}
                  className="w-full text-left text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] hover:bg-[var(--crm-card)] transition-colors"
                >
                  {editDateTime ? (
                    <span className="text-[var(--crm-text-primary)]">{formatPickedLabel(editDateTime)}</span>
                  ) : (
                    <span className="text-[var(--crm-text-muted)]">Select a date and time</span>
                  )}
                </button>
                {editPickerOpen && (
                  <DateTimePicker value={editDateTime} onChange={(v) => setEditDateTime(v)} compact />
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditTour}
                className="px-4 py-2 rounded-lg border border-[var(--crm-border)] text-[13px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditTour}
                disabled={!editDateTime}
                className="crm-cta px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
