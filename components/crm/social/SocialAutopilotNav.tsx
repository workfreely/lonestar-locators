"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Social Autopilot internal header + tab bar. Rendered by the shared Social Autopilot
// layout so it persists across the sections. These tabs are INTERNAL to Social
// Autopilot — they do not replace the global Locator Beast navigation (the app header
// with the profile menu sits above this).
const BASE = "/admin/social-autopilot"
const TABS: { label: string; href: string }[] = [
  { label: "Library", href: BASE },
  { label: "Queue", href: `${BASE}/queue` },
  { label: "Calendar", href: `${BASE}/calendar` },
  { label: "Accounts", href: `${BASE}/accounts` },
  { label: "History", href: `${BASE}/history` },
]

export default function SocialAutopilotNav() {
  const pathname = usePathname() || BASE

  return (
    // At `lg`+ the container is a 3-column grid [1fr | auto | 1fr]: the title/badge sit
    // in the left column and the tab bar in the centre column, so the tabs are visually
    // CENTERED within the whole content container (the empty right 1fr balances the left
    // title column) rather than merely appended after the badge. The shared bottom border
    // becomes a single full-width divider that the active tab's -mb-px underline sits on.
    // Below `lg` the grid/border toggles OFF and it falls back UNCHANGED to the original
    // two-row treatment (title row, then a full-width tab row with its own divider) — no
    // shrunken labels, no overlap, no horizontal overflow at MacBook Air widths.
    <div className="lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-end lg:border-b lg:border-[var(--crm-border)]">
      {/* Title + badge on ONE vertically-centered row. `m-0` NEUTRALIZES the global
          `h1 { margin-bottom: 1rem; line-height: 1.15; text-align: center }` in
          globals.css (a marketing rule that leaks onto admin surfaces) — that inherited
          bottom margin was enlarging the title's flex box and dropping the badge below
          the baseline. Left-aligned to match the other native pages (License
          Verification / Network), which also override the global h1. No manual
          translate/margin hacks — just resetting the inherited margin + line-height. */}
      <div className="flex items-center gap-2.5 lg:self-center lg:pb-2">
        <h1 className="m-0 text-left text-[20px] font-bold leading-none text-[var(--crm-text-primary)]">Social Autopilot</h1>
        <span className="inline-flex items-center leading-none text-[10.5px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border border-[var(--crm-border)] text-[var(--crm-text-muted)] bg-[var(--crm-panel)]">
          Admin Beta
        </span>
      </div>

      <nav className="mt-4 flex items-center gap-1 border-b border-[var(--crm-border)] lg:mt-0 lg:border-b-0 lg:justify-self-center">
        {TABS.map((t) => {
          const active = t.href === BASE ? pathname === BASE : pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                "relative px-3.5 py-2 text-[13px] font-semibold transition-colors -mb-px border-b-2 " +
                (active
                  ? "text-[var(--crm-text-primary)] border-[var(--crm-text-primary)]"
                  : "text-[var(--crm-text-secondary)] border-transparent hover:text-[var(--crm-text-primary)]")
              }
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
