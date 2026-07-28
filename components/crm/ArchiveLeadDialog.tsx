"use client"

import { useEffect, useState } from "react"
import { ARCHIVE_REASONS } from "@/lib/leads/archiveReasons"

// Confirmation dialog for archiving a lead. A reason MUST be chosen before the
// "Archive Lead" button enables — the selected reason is persisted with the
// lead so archived leads can be reported on and filtered later.
export default function ArchiveLeadDialog({
  open,
  leadName,
  onCancel,
  onConfirm,
}: {
  open: boolean
  leadName?: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState("")

  // Start each open with no reason selected, so the archive stays gated.
  useEffect(() => {
    if (open) setReason("")
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">Archive Lead</h3>
        <p className="text-sm text-[var(--crm-text-secondary)] mt-1">
          Why are you archiving{" "}
          {leadName ? (
            <span className="font-semibold text-[var(--crm-text-primary)]">{leadName}</span>
          ) : (
            "this lead"
          )}
          ?
        </p>

        <div className="mt-4 space-y-1.5">
          {ARCHIVE_REASONS.map((r) => {
            const active = reason === r.value
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={
                  "w-full flex items-center gap-2.5 text-left text-[13px] font-medium px-3 py-2 rounded-lg border transition-colors " +
                  (active
                    ? "border-[var(--kb-accent)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
                    : "border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]")
                }
              >
                <span
                  className={
                    "grid place-items-center w-4 h-4 rounded-full border-2 flex-none " +
                    (active ? "border-[var(--kb-accent)]" : "border-[var(--crm-border)]")
                  }
                >
                  {active && <span className="w-2 h-2 rounded-full bg-[var(--kb-accent)]" />}
                </span>
                <span>{r.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => reason && onConfirm(reason)}
            disabled={!reason}
            className="crm-cta px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            Archive Lead
          </button>
        </div>
      </div>
    </div>
  )
}
