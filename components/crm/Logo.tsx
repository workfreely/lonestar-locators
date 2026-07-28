// Shared CRM brand mark — was previously duplicated byte-for-byte in
// DashboardClient's and PerformanceClient's headers (one said "Locator
// Beast AI", the other said "Performance"). Centralized here so the
// product name only needs to be right in one place, and so the wordmark
// automatically follows the active theme via the CSS var instead of a
// hardcoded gray — the mark itself (blue square + arrow) is an accent,
// not a neutral surface, so it stays identical in both themes.
// `tone` only changes the wordmark's text color so the SAME mark can sit on
// the dark CRM header (theme token → light text) and the white Business
// Settings header (dark ink). Icon + sizes + spacing are identical everywhere.
export default function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <div className="flex items-center gap-2.5 mr-4">
      <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-none">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 10L7 4L12 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
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
