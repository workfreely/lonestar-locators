"use client"

// Top-level tab bar for the Analytics page. PRESENTATION ONLY — it owns no state, reads no data,
// and knows nothing about which components live behind each tab; PerformanceClient holds the
// selected tab and decides what to render.
//
// Styling is the CRM-dark tab treatment already used by Social Beast's SocialAutopilotNav (same
// --crm-* tokens, same `-mb-px border-b-2` active underline sitting on the shared divider), so the
// two tabbed surfaces in the app look like one product rather than two.
//
// Buttons, not <Link>s. Each tab is a different VIEW of one already-fetched lead set, not a
// different route — see the refetch note in PerformanceClient.

export const ANALYTICS_TABS = [
  { id: "overview", label: "Sales Overview" },
  { id: "marketing", label: "Marketing Analytics" },
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
}: {
  tab: AnalyticsTabId
  onChange: (next: AnalyticsTabId) => void
}) {
  return (
    // STICKY against the page's own scroll container (the overflow-y-auto body in
    // PerformanceClient), not the window — the same technique BulkReview's <thead> and
    // FollowUpTemplatesModal's header already use. The negative insets + padding let the bar's
    // background span the container's p-5 gutter so content scrolls UNDER it rather than beside it.
    <div className="sticky top-0 z-20 -mx-5 -mt-5 mb-1 px-5 pt-5 pb-0 bg-[var(--crm-workspace)]">
      <nav
        role="tablist"
        aria-label="Analytics sections"
        // Horizontally scrollable below the fold on narrow screens so three labels never wrap or
        // overflow on a phone; the divider still spans the full width.
        className="flex items-center gap-1 overflow-x-auto border-b border-[var(--crm-border)]"
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
    </div>
  )
}
