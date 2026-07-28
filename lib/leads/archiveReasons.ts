// Shared archive-reason list for archived leads (LeadPanel dropdown + LeadCard badge).
// Each entry is a real reason a lead is leaving the ACTIVE pipeline — not a
// workflow stage (Closed stays a stage) or an internal process (monthly cleanup).

export const ARCHIVE_REASONS: { value: string; label: string }[] = [
  { value: "ghosted", label: "👻 Ghosted / No Response" },
  { value: "unqualified", label: "🚫 Unqualified" },
  { value: "rented_elsewhere", label: "🏠 Rented Elsewhere" },
  { value: "moving_later", label: "📅 Moving Later" },
  { value: "spam", label: "🤖 Spam / Fake Lead" },
  { value: "other", label: "✏️ Other" },
]

// Reasons retired from the dropdown (2026-07) but still present on leads that
// were archived earlier — kept here only so their badges/labels keep rendering.
// Not offered as new selections.
const LEGACY_REASON_LABELS: Record<string, string> = {
  closed: "🏁 Closed",
  archived_by_user: "🗄️ Archived",
  deleted_by_user: "🗄️ Archived",
}

export function getArchiveReasonLabel(value?: string | null): string | null {
  if (!value) return null
  return (
    ARCHIVE_REASONS.find((r) => r.value === value)?.label ??
    LEGACY_REASON_LABELS[value] ??
    null
  )
}

// Compact form for the Kanban card badge — drops the "/ ..." qualifier.
export function getArchiveReasonBadgeLabel(value?: string | null): string | null {
  const full = getArchiveReasonLabel(value)
  if (!full) return null
  return full.split(" / ")[0]
}
