"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import FavoriteModal, { type FavoriteInput } from "./FavoriteModal"
import ConfirmDialog from "./ConfirmDialog"
import { SectionCard } from "./LeadPanelSections"
import { triggerGuestCardForFavorite } from "@/lib/leads/guestCardWorkflow"

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
}: {
  lead: any
  favorites?: any[]
  setFavorites?: React.Dispatch<React.SetStateAction<any[]>>
  nextActions?: any[]
  setNextActions?: React.Dispatch<React.SetStateAction<any[]>>
}) {
  const [showFavoriteModal, setShowFavoriteModal] = useState(false)
  const [editingFavorite, setEditingFavorite] = useState<any | null>(null)
  const [deletingFavoriteId, setDeletingFavoriteId] = useState<number | null>(null)

  const leadFavorites = favorites.filter((f) => f.lead_id === lead.id)

  async function handleSaveFavorite(entries: FavoriteInput[]): Promise<boolean> {
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

    const { error } = await supabase.from("lead_favorites").delete().eq("id", id)
    if (error) console.error("[favorite] delete failed:", error)
  }

  return (
    <>
      <SectionCard title="Favorite Properties" collapsible defaultOpen={true} storageKey="favorite-properties">
        {leadFavorites.length === 0 ? (
          <p className="text-[12.5px] text-[var(--crm-text-muted)]">No favorite properties added.</p>
        ) : (
          <div className="space-y-1.5">
            {leadFavorites.map((fav) => (
              <div
                key={fav.id}
                className="flex items-center gap-2 bg-white border border-[#e2e5ec] rounded-lg px-3 py-2 hover:border-[#c7ccd6] hover:bg-[#f7f8fa] transition-colors"
              >
                {fav.property_url ? (
                  <a href={fav.property_url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-[var(--crm-accent)] hover:underline truncate">
                      {fav.property_name || fav.property_url}
                    </p>
                    {fav.property_address && (
                      <p className="text-[11px] text-[#6b7280] truncate">{fav.property_address}</p>
                    )}
                  </a>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-[#1f232b] truncate">{fav.property_name}</p>
                    {fav.property_address && (
                      <p className="text-[11px] text-[#6b7280] truncate">{fav.property_address}</p>
                    )}
                  </div>
                )}
                <div className="flex-none flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => openEditFavorite(fav)}
                    className="text-[10.5px] font-semibold text-[#4b5563] hover:text-[#1f232b]"
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
            ))}
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
    </>
  )
}
