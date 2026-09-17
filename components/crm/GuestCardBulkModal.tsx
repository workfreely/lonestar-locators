"use client"

import { useEffect, useMemo, useState } from "react"
import GuestCardModal from "./GuestCardModal"
import type { GuestCardAgent } from "@/lib/leads/guestCard"
import type { ResolvedAgentIdentity } from "@/lib/notifications/agentSignature"

// Bulk Guest Cards — SEQUENTIAL orchestration over independent property-scoped Guest
// Cards. It is NOT a combined email and never claims to "send N": Locator Beast opens
// each property's own canonical GuestCardModal (its own recipient/subject/body/mailto
// draft) one at a time. Each property is completed canonically by the parent
// (onSentItem → completeGuestCardSent) only when ITS composer's Continue is used, so
// exiting midway preserves the finished ones and leaves the rest open (the aggregate
// Next Action then recalculates from what actually remains).
//
// Phase 1 "review": the relevant genuine-Favorite properties as rows, selected by
//         default. CTA "Review Guest Cards" (never "Send N", which mailto can't honor).
// Phase 2 "run":   step through the selected properties: "Guest Card i of N".

export type BulkGuestCardItem = {
  propertyId: number | string
  propertyName: string
  actionId: number | string
  property: any // the lead_favorites row GuestCardModal reads (name/url/address)
}

export default function GuestCardBulkModal({
  open,
  lead,
  items,
  agent,
  signature = null,
  onSentItem,
  onClose,
}: {
  open: boolean
  lead: any
  items: BulkGuestCardItem[]
  agent: GuestCardAgent
  signature?: ResolvedAgentIdentity | null
  /** Complete THIS property's guest card canonically (idempotent). */
  onSentItem: (item: BulkGuestCardItem) => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<"review" | "run">("review")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)

  // Reset to the review step, everything selected, each time the modal opens.
  useEffect(() => {
    if (!open) return
    setPhase("review")
    setSelectedIds(new Set(items.map((i) => String(i.propertyId))))
    setIndex(0)
  }, [open, items])

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(String(i.propertyId))),
    [items, selectedIds],
  )

  if (!open) return null

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // ── Phase 2: sequential per-property composer ──────────────────────────────
  if (phase === "run") {
    const current = selectedItems[index]
    if (!current) {
      // Nothing left to process — done.
      onClose()
      return null
    }
    const advance = () => {
      onSentItem(current) // complete THIS property canonically
      if (index + 1 < selectedItems.length) setIndex(index + 1)
      else onClose() // all selected handled
    }
    return (
      <GuestCardModal
        open
        lead={lead}
        property={current.property}
        agent={agent}
        signature={signature}
        progressLabel={`Guest Card ${index + 1} of ${selectedItems.length} · ${current.propertyName}`}
        onSent={advance}
        onClose={onClose} // Cancel/X = exit midway (finished ones preserved, rest left open)
      />
    )
  }

  // ── Phase 1: review + select ───────────────────────────────────────────────
  const rowBtn =
    "flex w-full items-center gap-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--crm-card)]"
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--crm-panel)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">Review Guest Cards</h3>
        <p className="mt-1 text-[13px] text-[var(--crm-text-secondary)]">
          You&apos;ll review and send one Guest Card per property, one at a time — each opens in your email app.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {items.map((it) => {
            const id = String(it.propertyId)
            const checked = selectedIds.has(id)
            return (
              <button key={id} type="button" onClick={() => toggle(id)} className={rowBtn} aria-pressed={checked}>
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
                    checked ? "border-[var(--kb-accent)] bg-[var(--kb-accent)] text-white" : "border-[var(--crm-border)] bg-transparent"
                  }`}
                  aria-hidden
                >
                  {checked ? "✓" : ""}
                </span>
                <span className="text-[13px] font-medium text-[var(--crm-text-primary)]">{it.propertyName}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--crm-text-secondary)] transition-colors hover:text-[var(--crm-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedItems.length === 0}
            onClick={() => {
              setIndex(0)
              setPhase("run")
            }}
            className="rounded-lg bg-[var(--kb-accent)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Review Guest Cards
          </button>
        </div>
      </div>
    </div>
  )
}
