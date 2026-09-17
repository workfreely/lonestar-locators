"use client"

import { useEffect, useState } from "react"
import PropertySearchField, { type PropertyMatch } from "./social/PropertySearchField"

// Applied/Closed Guest Card guard — a single guided 2-step modal. It never mutates
// anything itself; it reports the agent's choices to the parent (DashboardClient),
// which owns property association (favorite/Top Pick), the truthful guest-card
// record, the existing Guest Card composer, and continuing the stage transition.
//
//   Step 1 "property"   — Which property is {name} applying to? Reuses the canonical
//                         PropertySearchField (Map/Explorer search) AND its failed-
//                         search behavior: pressing Enter on a query with no matches
//                         reveals the Map's "No results found → + Add New Property"
//                         state, which opens the existing Add Property form. Client
//                         Favorites appear as optional quick-picks.
//   Step 2 "guest-card" — Was a guest card sent? Yes (record sent) / No (open the
//                         existing Guest Card flow). Yes/No are click-driven. "Change
//                         property" returns to Step 1 without leaving the workflow.

type FavoriteOption = { id: number | string; property_name?: string | null; property_address?: string | null }

export type GuestCardGuardView =
  // seedQuery prefills the search box — used only when returning here via "Change
  // property", so the agent sees the property they're changing from. Blank on a fresh open.
  | { step: "property"; clientName: string; favorites: FavoriteOption[]; seedQuery?: string }
  | { step: "guest-card"; clientName: string; propertyName: string }

export default function GuestCardGuardModal({
  view,
  onSelectFavorite,
  onSelectSearched,
  onAddProperty,
  onGuestSent,
  onGuestSendNow,
  onChangeProperty,
  onCancel,
}: {
  view: GuestCardGuardView | null
  /** Agent picked an existing favorite as the applied property. */
  onSelectFavorite: (favorite: FavoriteOption) => void
  /** Agent picked a searched (canonical Places) property. */
  onSelectSearched: (match: PropertyMatch) => void
  /** Failed search (Enter, no matches) — open the existing Add Property form,
   *  seeded with the typed text. Reuses the Map search's + Add New Property action. */
  onAddProperty: (typed: string) => void
  /** Step 2 "Yes" — the guest card was already sent (record it, continue). */
  onGuestSent: () => void
  /** Step 2 "No" — open the existing Guest Card send flow for the property. */
  onGuestSendNow: () => void
  /** Step 2 "Change property" — return to Step 1 without closing the workflow. */
  onChangeProperty: () => void
  onCancel: () => void
}) {
  const [q, setQ] = useState("")
  // Seed the search box when the property step opens: blank on a fresh open, the
  // prior property name when returning via "Change property" (seedQuery). This runs
  // only when the view object changes (a new step), not on the agent's keystrokes
  // (those update q locally without changing the view), so live typing is preserved.
  useEffect(() => {
    if (!view) { setQ(""); return }
    if (view.step === "property") setQ(view.seedQuery ?? "")
  }, [view])

  if (!view) return null

  const softBtn =
    "w-full text-[13px] font-semibold px-3 py-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] transition-colors hover:bg-[var(--crm-card)]"
  const primaryBtn =
    "w-full text-[13px] font-semibold px-3 py-2 rounded-lg bg-[var(--kb-accent)] text-white transition-opacity hover:opacity-90"
  const cancelBtn =
    "w-full text-[13px] font-medium px-3 py-2 rounded-lg text-[var(--crm-text-secondary)] transition-colors hover:text-[var(--crm-text-primary)]"

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Applied — property and guest card"
    >
      <div className="w-full max-w-sm bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        {view.step === "property" ? (
          <>
            <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">
              Which property is {view.clientName} applying to?
            </h3>
            <p className="text-sm text-[var(--crm-text-secondary)] mt-1">Search for a property to continue.</p>

            <div className="mt-4">
              <PropertySearchField
                value={q}
                onChange={setQ}
                onMatch={(m) => onSelectSearched(m)}
                onAddProperty={onAddProperty}
                placeholder="Search property name…"
                inputClassName="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-3 py-2 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
              />
            </div>

            {view.favorites.length > 0 && (
              <div className="mt-5">
                <p className="text-[10.5px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-2.5">
                  Client Favorites
                </p>
                <div className="flex flex-col gap-2">
                  {view.favorites.map((f) => (
                    <button key={String(f.id)} type="button" onClick={() => onSelectFavorite(f)} className={softBtn + " text-left"}>
                      {(f.property_name || f.property_address || "Property").toString()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={onCancel} className={cancelBtn}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">Was a guest card sent?</h3>
            <p className="text-sm text-[var(--crm-text-secondary)] mt-1">
              For <span className="font-semibold text-[var(--crm-text-primary)]">{view.propertyName}</span> —{" "}
              {view.clientName}.
            </p>
            {/* Subtle correction affordance. Returns to the approved Step 1 search
                without canceling the workflow or moving the client; the prior pick is
                provisional, so nothing was recorded to undo. */}
            <button
              type="button"
              onClick={onChangeProperty}
              className="mt-1 text-[12px] font-medium text-[var(--crm-text-muted)] underline underline-offset-2 hover:text-[var(--crm-text-primary)] transition-colors"
            >
              Change property
            </button>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={onGuestSent} className={primaryBtn}>
                Yes
              </button>
              <button type="button" onClick={onGuestSendNow} className={softBtn}>
                No
              </button>
              <button type="button" onClick={onCancel} className={cancelBtn}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
