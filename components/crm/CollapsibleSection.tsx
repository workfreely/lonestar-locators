"use client"

import { useEffect, useState } from "react"

// Same accordion pattern as the Lead Panel's SectionCard (chevron, header
// styling, click-anywhere-on-header, chevron rotation) — kept as its own
// small shared component rather than extracting SectionCard itself, so
// this can be reused outside the Lead Panel without touching that file at
// all. Optionally persists open/closed to localStorage via `storageKey`.
export default function CollapsibleSection({
  title,
  children,
  storageKey,
  defaultOpen = true,
  className = "",
}: {
  title: string
  children: React.ReactNode
  storageKey?: string
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (!storageKey) return
    const stored = localStorage.getItem(storageKey)
    if (stored === "true" || stored === "false") {
      setOpen(stored === "true")
    }
  }, [storageKey])

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      if (storageKey) localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  return (
    <div className={`bg-[var(--crm-panel)] border border-[var(--crm-border)] rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(var(--crm-shadow-color),0.07)] ${className}`}>
      <div
        className="px-4 py-2 border-b border-[var(--crm-border)] bg-[var(--crm-card)] flex items-center gap-2 cursor-pointer select-none"
        onClick={toggle}
      >
        <svg
          className={`w-3 h-3 text-[var(--crm-text-muted)] transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <p className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] uppercase tracking-widest">
          {title}
        </p>
      </div>
      {open && children}
    </div>
  )
}
