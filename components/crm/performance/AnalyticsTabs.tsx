"use client"

// Top-level tab bar for the Analytics page. PRESENTATION ONLY — it owns no state, reads no data,
// and knows nothing about which components live behind each tab; PerformanceClient holds the
// selected tab and decides what to render.
//
// ── IT MIRRORS SOCIAL BEAST'S NAV, DELIBERATELY ─────────────────────────────────────────────
// The visual contract is copied from components/crm/social/SocialAutopilotNav: same px-3.5 py-2
// hit area, same text-[13px] font-semibold, same gap-1, the same `-mb-px border-b-2` active
// underline sitting ON the nav's own bottom border, the same --crm-* tokens, and the same
// ⛶ Focus / Exit Focus control pushed to the right. Reproduced rather than imported: that file is
// a ROUTE nav (<Link> + usePathname, six Social Beast pages) and bending it into a stateful
// in-page switcher would risk regressions on a working surface for no gain here.
//
// NOT STICKY. Social Beast's nav sits in normal flow and scrolls away with the page, so this does
// too. An earlier revision pinned it with `sticky top-0` and negative margins, which made it float
// over the cards as they scrolled underneath — the overlap this version exists to remove.
//
// Buttons, not <Link>s. Each tab is a different VIEW of one already-fetched lead set, not a
// different route — see the refetch note in PerformanceClient.

export const ANALYTICS_TABS = [
  { id: "overview", label: "Sales Overview" },
  { id: "marketing", label: "Marketing Analytics" },
  { id: "campaigns", label: "Campaigns" },
  { id: "monthly", label: "Monthly Performance" },
] as const

export type AnalyticsTabId = (typeof ANALYTICS_TABS)[number]["id"]

/** The landing tab, and the fallback for an absent or unrecognised ?tab= value. */
export const DEFAULT_ANALYTICS_TAB: AnalyticsTabId = "overview"

/** Narrow an arbitrary ?tab= string to a real tab. Anything unknown falls back rather than
 *  rendering an empty page. */
export function parseAnalyticsTab(raw: string | null | undefined): AnalyticsTabId {
  const v = (raw ?? "").trim().toLowerCase()
  return (ANALYTICS_TABS as readonly { id: string }[]).some((t) => t.id === v)
    ? (v as AnalyticsTabId)
    : DEFAULT_ANALYTICS_TAB
}

export default function AnalyticsTabs({
  tab,
  onChange,
  focus = false,
  onToggleFocus,
}: {
  tab: AnalyticsTabId
  onChange: (next: AnalyticsTabId) => void
  // Focus is the page's state, not the bar's — the control only renders when a handler is supplied,
  // exactly as SocialAutopilotNav does it.
  focus?: boolean
  onToggleFocus?: () => void
}) {
  return (
    <div className="flex items-end justify-between gap-2.5 border-b border-[var(--crm-border)]">
      <nav
        role="tablist"
        aria-label="Analytics sections"
        // Four labels do not fit a phone, so the bar scrolls horizontally rather than wrapping or
        // clipping. The divider lives on the parent so it still spans the full width.
        className="flex items-center gap-1 overflow-x-auto"
      >
        {ANALYTICS_TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={
                "relative whitespace-nowrap px-3.5 py-2 text-[13px] font-semibold transition-colors -mb-px border-b-2 " +
                (active
                  ? "text-[var(--crm-text-primary)] border-[var(--crm-text-primary)]"
                  : "text-[var(--crm-text-secondary)] border-transparent hover:text-[var(--crm-text-primary)]")
              }
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Same control, same glyph, same classes as SocialAutopilotNav's. */}
      {onToggleFocus && (
        <button
          type="button"
          onClick={onToggleFocus}
          aria-pressed={focus}
          className="mb-2 flex-none inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-xl border border-[var(--crm-border)] text-[var(--crm-text-secondary)] bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-border)] transition-colors"
        >
          <span aria-hidden>⛶</span>
          {focus ? "Exit Focus" : "Focus"}
        </button>
      )}
    </div>
  )
}
