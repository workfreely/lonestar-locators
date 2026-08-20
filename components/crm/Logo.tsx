import BeastMark from "./BeastMark"

// Shared CRM brand mark — was previously duplicated byte-for-byte in
// DashboardClient's and PerformanceClient's headers (one said "Locator
// Beast AI", the other said "Performance"). Centralized here so the
// product name only needs to be right in one place, and so the wordmark
// automatically follows the active theme via the CSS var instead of a
// hardcoded gray.
//
// `tone` describes the SURFACE, not the ink: it drives the wordmark color so
// the same lockup can sit on the dark CRM header (theme token → light text)
// and on the white Business Settings header (dark ink), and it picks which
// Beast head reads against that background.
//
// `mark` exists because this component is shared with the public marketing
// nav, whose logo treatment is being decided separately — it keeps the old
// blue square + chevron by default, and the authenticated app opts in to the
// Beast head. Temporary: once the real logo system lands, both collapse back
// to one mark and this prop goes away.
export default function Logo({
  tone = "dark",
  mark = "chevron",
}: {
  tone?: "dark" | "light"
  mark?: "chevron" | "beast"
}) {
  return (
    <div className="flex items-center gap-2.5 mr-4">
      {mark === "beast" ? (
        <BeastMark tone={tone} size={48} />
      ) : (
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-none">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 10L7 4L12 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      <span
        className={`font-bold text-[18px] tracking-tight whitespace-nowrap ${
          tone === "light" ? "text-[#111318]" : "text-[var(--crm-text-primary)]"
        }`}
      >
        Locator Beast
      </span>
    </div>
  )
}
