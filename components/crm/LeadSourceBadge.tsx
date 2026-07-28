import { getSourceStyle } from "@/lib/leads/sourceStyles"

// The single, canonical lead-source badge for the whole app. Renders a
// color-coded pill using the per-source identity hue from
// lib/leads/sourceStyles.ts and the theme-aware `.crm-src-pill` styling the
// Analytics page established (tinted background + colored text + border, via
// the inline `--src-color` custom property, so it reads correctly on every
// workspace theme and in both the CRM chrome and the Kanban board).
//
// Use this EVERYWHERE a lead source is shown — Kanban cards, Lead Panel,
// Analytics, Lead Details. To add or recolor a source, edit sourceStyles.ts
// only; nothing else changes. `className` controls context-specific sizing.
export default function LeadSourceBadge({
  source,
  className = "text-[11px] px-2 py-0.5",
}: {
  source: string | null | undefined
  className?: string
}) {
  const { label, color } = getSourceStyle(source)
  return (
    <span
      className={`crm-src-pill inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${className}`}
      style={{ ["--src-color"]: color } as React.CSSProperties}
    >
      {label}
    </span>
  )
}
