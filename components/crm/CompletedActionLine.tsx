import { AUTOMATED_CONTACT_VIA } from "@/lib/followup/firstContactRules"

/**
 * The completed-state presentation for a Last Action — ONE component, so the CRM panel and any
 * other surface that shows a finished action cannot drift apart.
 *
 * Three lines, in the order an agent reads them:
 *   ✓ <the task that was completed — always its own name>
 *   Completed: <when>
 *   <who> <Manually completed | Automated>
 *
 * The provenance row renders ONLY when the row actually records a method. Legacy rows completed
 * before lead_next_actions.completed_via existed have none, and the honest output for them is
 * the first two lines alone — a guessed "Manually completed" would be worse than silence.
 *
 * Icons are Lucide's own geometry drawn inline (check-circle, user, bot), matching the glyph
 * style the rest of the CRM already uses. The package itself is not a dependency of this app.
 */
export type CompletedVia = "manual" | "followup_agent" | null | undefined

function CheckCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="flex-none text-emerald-600" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function PersonGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function BotGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
    </svg>
  )
}

export default function CompletedActionLine({
  label,
  completedAtDisplay,
  completedVia,
}: {
  /** The completed TASK's own canonical name — "Contacted Lead", "Build List". Never the method. */
  label: string
  /** Already formatted in the locator's timezone — "Today · 9:04 AM". */
  completedAtDisplay: string
  completedVia: CompletedVia
}) {
  const automated = completedVia === AUTOMATED_CONTACT_VIA
  const known = completedVia === "manual" || automated

  return (
    <div>
      {/* The check sits INLINE with the title, on the card's own left edge — the same left
          padding as Next Action below, with no extra indentation. */}
      <div className="flex items-center gap-2">
        <CheckCircle />
        <span title={label} className="truncate text-sm font-semibold text-[var(--crm-text-primary)]">
          {label}
        </span>
      </div>
      <div className="mt-1.5 truncate text-[12.5px] text-[var(--crm-text-muted)]">
        Completed:{" "}
        <span className="font-medium text-emerald-600">{completedAtDisplay}</span>
      </div>
      {known && (
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[var(--crm-text-muted)]">
          {automated ? <BotGlyph /> : <PersonGlyph />}
          <span>{automated ? "Automated" : "Manually completed"}</span>
        </div>
      )}
    </div>
  )
}
