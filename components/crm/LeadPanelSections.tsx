"use client"

import { useState } from "react"
import { readSectionExpanded, writeSectionExpanded } from "@/lib/preferences"

// Shared collapsible section shells for the Lead detail view. Extracted from
// LeadPanel so the same look + per-section persistence works whether a
// section renders in the left record panel (Search Criteria, Credit
// Screening, Quick Actions) or the right workspace panel (Favorite
// Properties, Client/Locator Notes).

export function CollapsibleNotes({
  title,
  defaultOpen,
  storageKey,
  children,
}: {
  title: string
  defaultOpen: boolean
  storageKey?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(() =>
    storageKey ? readSectionExpanded(storageKey, defaultOpen) : defaultOpen
  )
  function toggle() {
    setOpen((o) => {
      const next = !o
      if (storageKey) writeSectionExpanded(storageKey, next)
      return next
    })
  }
  return (
    <div className="bg-[var(--crm-panel)] border border-[var(--crm-border-soft)] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.04),0_4px_10px_rgba(var(--crm-shadow-color),0.06)]">
      <div
        className="px-4 py-2 border-b border-[var(--crm-border-soft)] bg-[var(--crm-card)] flex items-center gap-2 cursor-pointer select-none"
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
      {open && (
        <div className="px-4 py-3 space-y-2.5 bg-[var(--crm-panel)]">
          {children}
        </div>
      )}
    </div>
  )
}

export function SectionCard({
  title,
  children,
  shaded = false,
  collapsible = false,
  defaultOpen = true,
  storageKey,
}: {
  title: string
  children: React.ReactNode
  shaded?: boolean
  collapsible?: boolean
  defaultOpen?: boolean
  storageKey?: string
}) {
  const [open, setOpen] = useState(() =>
    collapsible && storageKey ? readSectionExpanded(storageKey, defaultOpen) : defaultOpen
  )
  function toggle() {
    setOpen((o) => {
      const next = !o
      if (storageKey) writeSectionExpanded(storageKey, next)
      return next
    })
  }
  return (
    <div className="bg-[var(--crm-panel)] border border-[var(--crm-border-soft)] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.04),0_4px_10px_rgba(var(--crm-shadow-color),0.06)]">
      <div
        className={`px-4 py-2 border-b border-[var(--crm-border-soft)] bg-[var(--crm-card)] flex items-center gap-2 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? toggle : undefined}
      >
        {collapsible && (
          <svg
            className={`w-3 h-3 text-[var(--crm-text-muted)] transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
        <p className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] uppercase tracking-widest">
          {title}
        </p>
      </div>
      {(!collapsible || open) && <div className={`px-4 py-3 space-y-2.5 ${shaded ? "bg-[var(--crm-card)]/60" : "bg-[var(--crm-panel)]"}`}>
        {children}
      </div>}
    </div>
  )
}
