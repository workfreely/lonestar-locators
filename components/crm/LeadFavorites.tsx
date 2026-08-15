"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import FavoriteModal, { type FavoriteInput } from "./FavoriteModal"
import ConfirmDialog from "./ConfirmDialog"
import DateTimePicker from "./DateTimePicker"
import { SectionCard } from "./LeadPanelSections"
import { triggerGuestCardForFavorite } from "@/lib/leads/guestCardWorkflow"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { upcomingTourForFavorite } from "@/lib/leads/upcomingTour"
import { utcToLocalTourValue } from "@/lib/leads/tourFollowUp"
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
  onCancelTour?: (lead: any, args: { tourId: number | string }) => void
}) {
  const [showFavoriteModal, setShowFavoriteModal] = useState(false)
  const [editingFavorite, setEditingFavorite] = useState<any | null>(null)
  const [deletingFavoriteId, setDeletingFavoriteId] = useState<number | null>(null)

  // Tour edit/cancel draft state (per-Favorite). Editing reuses the CRM's own
  // DateTimePicker (Done/Apply, 9 AM default) + a Favorite property select — the
  // same controls Add Task uses — rather than a new reschedule picker.
  const [editingTourFavId, setEditingTourFavId] = useState<number | string | null>(null)
  const [editTourId, setEditTourId] = useState<number | string | null>(null)
  const [editPropertyId, setEditPropertyId] = useState<string>("")
  const [editDateTime, setEditDateTime] = useState<string>("") // "YYYY-MM-DDTHH:mm"
  const [editPickerOpen, setEditPickerOpen] = useState(false)
  const [cancelingTour, setCancelingTour] = useState<null | { tourId: number | string; propertyName: string }>(null)

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
        }
        setFavorites?.((prev) => prev.map((f) => (f.id === editingFavorite.id ? updated : f)))
      } else {
        const rows = entries.map((input, i) => ({
          id: `demo-fav-${Date.now()}-${i}`,
          lead_id: lead.id,
          property_name: input.propertyName || null,
          property_url: input.propertyUrl || null,
          property_address: input.propertyAddress || null,
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
      })))
      .select("*")

    if (error) {
      console.error("[favorite] create failed:", error)
      return false
    }

    setFavorites?.((prev) => [...prev, ...(data ?? [])])
    setShowFavoriteModal(false)

    // Workflow: every favorite added to a List Sent lead spawns its own
    // property-specific "Email Guest Card" action (see guestCardWorkflow.ts).
    const removedIds: number[] = []
    const createdActions: any[] = []
    for (const fav of data ?? []) {
      const result = await triggerGuestCardForFavorite(supabase, lead, fav, nextActions)
      if (!result) continue
      removedIds.push(...result.removedIds)
      if (result.created) createdActions.push(result.created)
    }
    if (setNextActions && (removedIds.length || createdActions.length)) {
      setNextActions((prev) => {
        let next = removedIds.length ? prev.filter((a) => !removedIds.includes(a.id)) : prev
        if (createdActions.length) next = [...next, ...createdActions]
        return next
      })
    }

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
    onCancelTour?.(lead, { tourId: c.tourId })
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
              return (
                <div
                  key={fav.id}
                  className="bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-lg px-3 py-2 hover:border-[var(--crm-text-muted)] hover:bg-[var(--crm-card)] transition-colors"
                >
                  <div className="flex items-center gap-2">
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
                        Edit
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
                        {(onRescheduleTour || onCancelTour) && editingTourFavId !== fav.id && (
                          <div className="flex-none flex items-center gap-2.5">
                            {onRescheduleTour && (
                              <button
                                type="button"
                                onClick={() => startEditTour(fav, tour)}
                                className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"
                              >
                                Edit
                              </button>
                            )}
                            {onCancelTour && (
                              <button
                                type="button"
                                onClick={() => setCancelingTour({ tourId: tour.id, propertyName: fav.property_name || fav.property_url || "this property" })}
                                className="text-[10.5px] font-semibold text-red-500 hover:text-red-700"
                              >
                                Cancel Tour
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline reschedule editor — reuses the CRM DateTimePicker
                          (Done/Apply) + a Favorite property select, prefilled with
                          the existing tour; Save Changes updates the SAME tour. */}
                      {editingTourFavId === fav.id && (
                        <div className="mt-2.5 space-y-2">
                          <div>
                            <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">Property</label>
                            <select
                              value={editPropertyId}
                              onChange={(e) => setEditPropertyId(e.target.value)}
                              className="w-full text-[12.5px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
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
                              className="w-full text-left text-[12.5px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] hover:bg-[var(--crm-card)] transition-colors"
                            >
                              {editDateTime ? (
                                <span className="text-[var(--crm-text-primary)]">{formatPickedLabel(editDateTime)}</span>
                              ) : (
                                <span className="text-[var(--crm-text-muted)]">Select a date and time</span>
                              )}
                            </button>
                            {editPickerOpen && (
                              <DateTimePicker
                                value={editDateTime}
                                onApply={(v) => { setEditDateTime(v); setEditPickerOpen(false) }}
                                onCancel={() => setEditPickerOpen(false)}
                              />
                            )}
                          </div>
                          <div className="flex justify-end gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={closeEditTour}
                              className="px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[11.5px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={saveEditTour}
                              disabled={!editDateTime}
                              className="crm-cta px-3 py-1.5 rounded-lg text-[11.5px] font-semibold disabled:opacity-50"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      )}
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
        message="The tour will be marked canceled and its Tour Follow-Up removed. Schedule Tour becomes the lead's next action again. The saved Favorite is kept."
        confirmLabel="Cancel Tour"
        cancelLabel="Keep Tour"
        danger
        onConfirm={confirmCancelTour}
        onCancel={() => setCancelingTour(null)}
      />
    </>
  )
}
