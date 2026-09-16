"use client"

// Property-specific Guest Card guard modal. Shown by DashboardClient before a
// lead advances to Applied or Closed when the Guest Card has NOT been handled for
// the applied/leased property. It never mutates anything itself — it only reports
// the agent's choice back to the parent, which owns the truthful recording, the
// existing Guest Card composer, and continuing the move.
//
// Two modes:
//   • "confirm"  — the property is known; ask whether the guest card was sent.
//   • "identify" — no applied property yet; let the agent pick it from the
//                  client's existing Favorites (reusing the Top Pick mechanism),
//                  or, when there are none, point them to the existing add-a-
//                  favorite flow. No new property search is introduced here.

type FavoriteOption = { id: number | string; property_name?: string | null; property_address?: string | null }

export type GuestCardGuardView =
  | {
      mode: "confirm"
      clientName: string
      propertyName: string
      context: "applied" | "closed"
    }
  | {
      mode: "identify"
      clientName: string
      favorites: FavoriteOption[]
    }

export default function GuestCardGuardModal({
  view,
  onConfirmSent,
  onSendGuestCard,
  onSelectProperty,
  onCancel,
}: {
  view: GuestCardGuardView | null
  onConfirmSent: () => void
  onSendGuestCard: () => void
  onSelectProperty: (favorite: FavoriteOption) => void
  onCancel: () => void
}) {
  if (!view) return null

  const primaryBtn =
    "w-full text-[13px] font-semibold px-3 py-2 rounded-lg bg-[var(--kb-accent)] text-white transition-opacity hover:opacity-90"
  const softBtn =
    "w-full text-[13px] font-semibold px-3 py-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] transition-colors hover:bg-[var(--crm-card)]"
  const cancelBtn =
    "w-full text-[13px] font-medium px-3 py-2 rounded-lg text-[var(--crm-text-secondary)] transition-colors hover:text-[var(--crm-text-primary)]"

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Guest Card check"
    >
      <div
        className="w-full max-w-sm bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {view.mode === "confirm" ? (
          <>
            {/* The button labels are the contract activePrompt uses to let Beast
                Voice answer this exact prompt — keep them stable. */}
            <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">Guest Card</h3>
            <p className="text-sm text-[var(--crm-text-secondary)] mt-1">
              Did you send the guest card for{" "}
              <span className="font-semibold text-[var(--crm-text-primary)]">{view.propertyName}</span> for{" "}
              <span className="font-semibold text-[var(--crm-text-primary)]">{view.clientName}</span>?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={onConfirmSent} className={primaryBtn}>
                Yes, I Sent It
              </button>
              <button type="button" onClick={onSendGuestCard} className={softBtn}>
                Send Guest Card
              </button>
              <button type="button" onClick={onCancel} className={cancelBtn}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">Which property?</h3>
            <p className="text-sm text-[var(--crm-text-secondary)] mt-1">
              Which property is{" "}
              <span className="font-semibold text-[var(--crm-text-primary)]">{view.clientName}</span> applying to? The
              guest card is checked for that property.
            </p>
            {view.favorites.length > 0 ? (
              <div className="mt-4 flex flex-col gap-1.5">
                {view.favorites.map((f) => (
                  <button
                    key={String(f.id)}
                    type="button"
                    onClick={() => onSelectProperty(f)}
                    className={softBtn + " text-left"}
                  >
                    {(f.property_name || f.property_address || "Property").toString()}
                  </button>
                ))}
                <button type="button" onClick={onCancel} className={cancelBtn}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-[12.5px] text-[var(--crm-text-secondary)]">
                  No favorites yet. Add the property to {view.clientName}&rsquo;s favorites from the Map first, then try
                  again.
                </p>
                <button type="button" onClick={onCancel} className={cancelBtn}>
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
