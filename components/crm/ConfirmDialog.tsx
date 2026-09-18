"use client"

import type { ReactNode } from "react"

// Small reusable confirmation modal — styled to match the app's card
// language (rounded-2xl, shadow-2xl) rather than a native window.confirm().
// Used for confirmations like Archive Lead (LeadPanel), Delete Demo Workspace
// (Settings), and Delete Favorite.

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
  compact = false,
}: {
  open: boolean
  title: string
  // Plain string for the common case; a ReactNode when a caller needs a small
  // structured body (e.g. Send Rebate's Client / Property / Rebate rows). Optional —
  // omit for a title-only confirmation (the body line is then not rendered at all).
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
  // Opt-in tight preset for a short, title-only confirmation (the Send-list "Did you
  // send {name}'s list?"): a narrower panel with the action row centered under the
  // question. Default false keeps every existing caller (Archive/Apply/Send Rebate)
  // byte-for-byte unchanged. Buttons stay auto-width and keep their treatments/order.
  compact?: boolean
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className={`w-full ${compact ? "max-w-xs" : "max-w-sm"} bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6`}>
        <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">{title}</h3>
        {message != null && message !== "" && (
          <p className="text-sm text-[var(--crm-text-secondary)] mt-2 leading-relaxed">{message}</p>
        )}

        <div className={`flex gap-3 mt-6 ${compact ? "justify-center" : "justify-end"}`}>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={[
              "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              danger ? "bg-red-600 hover:bg-red-700 text-white" : "crm-cta",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
