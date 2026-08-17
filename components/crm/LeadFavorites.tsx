"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import FavoriteModal, { type FavoriteInput } from "./FavoriteModal"
import ConfirmDialog from "./ConfirmDialog"
import DateTimePicker from "./DateTimePicker"
import PropertyThumb from "./PropertyThumb"
import { SectionCard } from "./LeadPanelSections"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { upcomingTourForFavorite } from "@/lib/leads/upcomingTour"
import { utcToLocalTourValue, favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { formatDueDateTime } from "@/lib/actionDisplay"

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
  favorites = [],
  setFavorites,
  nextActions = [],
  setNextActions,
  tours = [],
  timeZone,
  onRescheduleTour,
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
}: {
  lead: any
  favorites?: any[]
  setFavorites?: React.Dispatch<React.SetStateAction<any[]>>
  nextActions?: any[]
  setNextActions?: React.Dispatch<React.SetStateAction<any[]>>
  // Canonical lead_tours appointments (read-only display). Each Favorite shows its
  // own upcoming scheduled tour, if any — lead_tours stays the source of truth.
  tours?: any[]
  timeZone?: string
  // Canonical tour edit/cancel — routed to DashboardClient's rescheduleTour /
  // cancelTour handlers (the ONE workflow path). Absent → controls are hidden.
  onRescheduleTour?: (lead: any, args: { tourId: number | string; propertyId: string; tourDate: string; tourTime: string }) => void
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
}) {
  const [showFavoriteModal, setShowFavoriteModal] = useState(false)
  const [editingFavorite, setEditingFavorite] = useState<any | null>(null)
  const [deletingFavoriteId, setDeletingFavoriteId] = useState<number | null>(null)

  // Tour edit/cancel draft state (per-Favorite). editDateTime holds the draft
  // "YYYY-MM-DDTHH:mm"; the Add Task Tour Date & Time control (field → DateTimePicker,
  // toggled by editPickerOpen) writes into it, and Save Changes is the single commit.
  const [editingTourFavId, setEditingTourFavId] = useState<number | string | null>(null)
  const [editTourId, setEditTourId] = useState<number | string | null>(null)
  const [editPropertyId, setEditPropertyId] = useState<string>("")
  const [editDateTime, setEditDateTime] = useState<string>("") // "YYYY-MM-DDTHH:mm"
  const [editPickerOpen, setEditPickerOpen] = useState(false)
  const [cancelingTour, setCancelingTour] = useState<null | { tourId: number | string; propertyName: string; propertyId: number | string | null }>(null)

  // Switching the active client must never leak a tour draft (or a pending cancel)
  // from the previous lead — reset every tour-edit control when the lead changes.
  useEffect(() => {
    setEditingTourFavId(null)
    setEditTourId(null)
    setEditPropertyId("")
    setEditDateTime("")
    setEditPickerOpen(false)
    setCancelingTour(null)
  }, [lead.id])

  const leadFavorites = favorites.filter((f) => f.lead_id === lead.id)
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

      setFavorites?.((prev) => prev.map((f) => (f.id === data.id ? data : f)))
      setShowFavoriteModal(false)
      setEditingFavorite(null)
      return true
    }

    const { data, error } = await supabase
      .from("lead_favorites")
      .insert(entries.map((input) => ({
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

    setFavorites?.((prev) => [...prev, ...(data ?? [])])
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

  async function handleDeleteFavorite() {
    const id = deletingFavoriteId
    setDeletingFavoriteId(null)
    if (id == null) return

    setFavorites?.((prev) => prev.filter((f) => f.id !== id))

    // Demo favorites are local-only rows — nothing to delete server-side.
    if (isDemoLeadId(lead.id)) return

    const { error } = await supabase.from("lead_favorites").delete().eq("id", id)
    if (error) console.error("[favorite] delete failed:", error)
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
          <p className="text-[12.5px] text-[var(--crm-text-muted)]">No favorite properties added.</p>
        ) : (
          <div className="space-y-1.5">
            {leadFavorites.map((fav) => {
              // The upcoming scheduled tour for THIS property (source of truth =
              // lead_tours, linked by property_id). Null → render nothing extra.
              const tour = upcomingTourForFavorite(leadTours, fav.id)
              // This property's Guest Card state (created when its tour is
              // scheduled): open → "Send Guest Card"; completed → "Guest Card
              // Sent ✓". Null when no guest card for this property.
              const gcAction = nextActions.find(
                (a: any) =>
                  String(a.lead_id) === String(lead.id) &&
                  String(a.property_id ?? "") === String(fav.id) &&
                  (String(a.action_key ?? "") === "email_guest_card" || String(a.title ?? "").trim().toLowerCase() === "email guest card")
              )
              const gcSent = !!gcAction && (gcAction.completed === true || gcAction.status === "completed")
              const gcOpen = !!gcAction && !gcSent
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
              return (
                <div
                  key={fav.id}
                  className="bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-lg px-3 py-2 hover:border-[var(--crm-text-muted)] hover:bg-[var(--crm-card)] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {/* Shared property thumbnail (same treatment as Recommended
                        Properties). property_image_url carries the resolved image
                        once persisted; until then PropertyThumb shows the clean
                        placeholder — never a broken image. */}
                    <PropertyThumb src={fav.property_image_url} alt={fav.property_name || ""} />
                    {fav.property_url ? (
                      <a href={fav.property_url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-[var(--crm-accent)] hover:underline truncate">
                          {fav.property_name || fav.property_url}
                        </p>
                        {fav.property_address && (
                          <p className="text-[11px] text-[var(--crm-text-muted)] truncate">{fav.property_address}</p>
                        )}
                      </a>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] truncate">{fav.property_name}</p>
                        {fav.property_address && (
                          <p className="text-[11px] text-[var(--crm-text-muted)] truncate">{fav.property_address}</p>
                        )}
                      </div>
                    )}
                    <div className="flex-none flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => openEditFavorite(fav)}
                        className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"
                      >
                        Edit Property
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingFavoriteId(fav.id)}
                        className="text-[10.5px] font-semibold text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Scheduled-tour metadata — mirrors the Lead Panel "Next Action
                      → Due" treatment (muted uppercase label + muted value line,
                      same canonical formatDueDateTime). Edit / Cancel Tour sit to
                      the right on desktop. Only shown when a linked upcoming tour
                      exists; nothing rendered otherwise. */}
                  {tour && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--crm-text-secondary)]">
                            Tour Scheduled
                          </p>
                          <p className="mt-0.5 text-[12.5px] font-medium text-[var(--crm-text-secondary)]">
                            {formatDueDateTime(tour.scheduled_at, { verbose: true, timeZone: timeZone ?? undefined })}
                          </p>
                        </div>
                        {(onRescheduleTour || onCancelTour || onSendGuestCard) && editingTourFavId !== fav.id && (
                          <div className="flex-none flex items-center gap-2.5">
                            {/* Send Guest Card is the PRIMARY action for a scheduled
                                property until its card is sent, then a compact
                                "Guest Card Sent ✓". */}
                            {onSendGuestCard && gcOpen && (
                              <button
                                type="button"
                                onClick={() => onSendGuestCard(lead, { favorite: fav, tour, actionId: gcAction!.id })}
                                className="text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                              >
                                Send Guest Card
                              </button>
                            )}
                            {gcSent && (
                              // Existing CRM success green (same as "Completed:" in the
                              // Lead Panel) so a sent card reads as a completed action.
                              <span className="text-[10.5px] font-semibold text-emerald-600">Guest Card Sent</span>
                            )}
                            {onRescheduleTour && (
                              <button
                                type="button"
                                onClick={() => startEditTour(fav, tour)}
                                className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"
                              >
                                Reschedule
                              </button>
                            )}
                            {onCancelTour && (
                              <button
                                type="button"
                                onClick={() => setCancelingTour({ tourId: tour.id, propertyName: fav.property_name || fav.property_url || "this property", propertyId: tour.property_id ?? fav.id })}
                                className="text-[10.5px] font-semibold text-red-500 hover:text-red-700"
                              >
                                Cancel Tour
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {/* Tour has OCCURRED and is awaiting its outcome → the property's
                      Tour Follow-Up (property-scoped). Reschedule/Cancel no longer
                      apply (the tour happened). */}
                  {!tour && tourOccurred && tfAction && onTourFollowUp && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--crm-text-secondary)]">Toured</p>
                          <p className="mt-0.5 text-[12.5px] font-medium text-[var(--crm-text-secondary)]">
                            {formatDueDateTime(scheduledTour!.scheduled_at, { verbose: true, timeZone: timeZone ?? undefined })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onTourFollowUp(lead, { tour: scheduledTour, favorite: fav, actionId: tfAction.id })}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Tour Follow-Up
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Ready to Apply → this property is the Top Pick; the next step
                      is the canonical Apply (start_application) confirmation. */}
                  {applyAction && onStartApplication && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">★ Top Pick · {favState}</p>
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

                  {/* Application submitted → Check Application (property-scoped to the
                      Top Pick). Surfaced while an open check_application exists; the
                      state line advances Applied → Application Pending as outcomes
                      are recorded, and the button reopens the same decision. */}
                  {checkAppOpen && onCheckApplication && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">
                          {isTopPick && "★ Top Pick · "}{favState}
                        </p>
                        <button
                          type="button"
                          onClick={() => onCheckApplication(lead, { action: checkAppAction })}
                          className="flex-none text-[10.5px] font-semibold text-[var(--crm-accent)] hover:underline"
                        >
                          Check Application
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Application approved → Confirm Lease (property-scoped to the Top
                      Pick). "Did the client sign?" — Yes advances to Closed. */}
                  {confirmLeaseOpen && onConfirmLease && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-emerald-600">
                          {isTopPick && "★ Top Pick · "}{favState}
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
                          {isTopPick && "★ Top Pick · "}{favState}
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
                          {isTopPick && "★ Top Pick · "}{favState}
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
                          {isTopPick && "★ Top Pick · "}{favState}
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
                          {isTopPick && "★ Top Pick · "}{favState}
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
                        {isTopPick && <span className="font-semibold text-emerald-600">★ Top Pick · </span>}
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

      <FavoriteModal open={showFavoriteModal} editing={editingFavorite} onClose={closeFavoriteModal} onSave={handleSaveFavorite} />

      <ConfirmDialog
        open={deletingFavoriteId !== null}
        title="Delete this favorite?"
        message="This will remove the saved property from this lead's favorites. This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={handleDeleteFavorite}
        onCancel={() => setDeletingFavoriteId(null)}
      />

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
