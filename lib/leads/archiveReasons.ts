// Shared archive-reason list for archived leads (LeadPanel dropdown + LeadCard badge).

export const ARCHIVE_REASONS: { value: string; label: string }[] = [
  { value: "ghosted", label: "👻 Ghosted / No Response" },
  { value: "unqualified", label: "🚫 Unqualified" },
  { value: "spam", label: "🤖 Spam / Fake Lead" },
  { value: "rented_elsewhere", label: "🏠 Rented Elsewhere" },
  { value: "moving_later", label: "📅 Moving Later" },
  { value: "closed", label: "🏁 Closed / Monthly Cleanup" },
  { value: "archived_by_user", label: "🗄️ Archived by User" },
  { value: "other", label: "✏️ Other" },
]

export function getArchiveReasonLabel(value?: string | null): string | null {
  if (!value) return null
  return ARCHIVE_REASONS.find((r) => r.value === value)?.label ?? null
}

// Compact form for the Kanban card badge — drops the "/ ..." qualifier.
export function getArchiveReasonBadgeLabel(value?: string | null): string | null {
  const full = getArchiveReasonLabel(value)
  if (!full) return null
  return full.split(" / ")[0]
}
