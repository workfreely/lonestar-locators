"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  readChecklistDone,
  writeChecklistDone,
  readChecklistDismissed,
  writeChecklistDismissed,
} from "@/lib/preferences"

type ChecklistItem = {
  id: string
  label: string
  desc: string
  href?: string
  cta?: string
  danger?: boolean
  /** No destination exists yet — render an inert "Coming Soon" chip instead of a
   *  clickable action that would do nothing when pressed. */
  pending?: boolean
}

// Guided first-run checklist shown in the demo workspace. Items are checked
// off manually (or by taking their action); progress + dismissal persist in
// localStorage so it never nags. Hidden permanently once dismissed or when
// every item is complete. "Connect Google" only appears if it was skipped
// during onboarding.
export default function FirstRunChecklist({ googleConnected, userId = "" }: { googleConnected: boolean; userId?: string }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [done, setDone] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDismissed(readChecklistDismissed(userId))
    setDone(readChecklistDone(userId))
  }, [])

  // FOUR items, ordered so the lead-generating action sits near the top.
  //
  // "Explore the Kanban Board" and "Open a Demo Client" were removed — the Quick
  // Tour is meant to cover both, and listing them separately made first-run feel
  // like homework. "Delete Demo Workspace" was removed as a getting-started TASK;
  // the capability itself still lives in Settings and is untouched.
  const items: ChecklistItem[] = [
    // No training/Academy destination exists yet, so this item carries no href —
    // it stays checkable rather than linking somewhere invented. Add the real
    // destination here once it exists.
    {
      id: "tour",
      label: "Take the Quick Tour",
      desc: "Learn the CRM, the Kanban board, and how to work a client.",
      // No training/Academy destination exists yet. Marked pending so it shows a
      // non-clickable "Coming Soon" chip rather than a button that does nothing.
      // Replace `pending` with a real href + cta once the training exists.
      pending: true,
    },
    { id: "form", label: "Share Your Smart Lead Form", desc: "Share it to Instagram, TikTok, Facebook, or your website.", cta: "Copy" },
    { id: "analytics", label: "Explore Analytics", desc: "Projected pipeline, monthly goals, and commission forecasting.", href: "/admin/analytics", cta: "Open" },
    { id: "import", label: "Bring in Your Leads", desc: "Bring in your existing clients via CSV.", href: "/admin/import", cta: "Import" },
  ]

  function persistDone(next: string[]) {
    setDone(next)
    writeChecklistDone(next, userId)
  }

  function toggle(id: string) {
    persistDone(done.includes(id) ? done.filter((x) => x !== id) : [...done, id])
  }

  function markDone(id: string) {
    if (!done.includes(id)) persistDone([...done, id])
  }

  function dismiss() {
    writeChecklistDismissed(true, userId)
    setDismissed(true)
  }

  async function runAction(item: ChecklistItem) {
    if (item.id === "form") {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/smart-lead-form`)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch {
        /* clipboard unavailable — still mark the step done */
      }
      markDone("form")
      return
    }
    markDone(item.id)
    if (item.href) router.push(item.href)
  }

  if (!mounted || dismissed) return null

  const completed = items.filter((i) => done.includes(i.id)).length
  const total = items.length
  const allDone = completed === total

  // Collapsed → a small progress pill.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--crm-text-primary)] shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition-transform hover:scale-[1.02]"
      >
        <span>🚀 Getting started</span>
        <span className="text-[var(--crm-text-muted)]">{completed}/{total}</span>
      </button>
    )
  }

  return (
    <div className="crm-fade-in fixed bottom-4 right-4 z-40 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-[0_16px_40px_rgba(15,23,42,0.22)] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-3 border-b border-[var(--crm-border-soft)] bg-[var(--crm-card)]">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Get Started with Locator Beast</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--crm-inset)]">
            <div className="h-full rounded-full bg-[var(--crm-accent)] transition-all duration-500" style={{ width: `${(completed / total) * 100}%` }} />
          </div>
        </div>
        <button type="button" onClick={() => setCollapsed(true)} aria-label="Minimize" className="flex-none w-6 h-6 grid place-items-center rounded-lg text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-inset)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="flex-none w-6 h-6 grid place-items-center rounded-lg text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-inset)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>

      {/* Body */}
      {allDone ? (
        <div className="px-4 py-6 text-center">
          <div className="text-2xl">🎉</div>
          <p className="mt-2 text-[13.5px] font-semibold text-[var(--crm-text-primary)]">You&apos;re ready to start using Locator Beast.</p>
          <button type="button" onClick={dismiss} className="mt-4 w-full rounded-lg bg-[var(--crm-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-accent-contrast)]">
            Finish
          </button>
        </div>
      ) : (
        <ul className="max-h-[52vh] overflow-y-auto py-1.5">
          {items.map((item) => {
            const isDone = done.includes(item.id)
            return (
              <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                  className={`mt-0.5 flex-none w-5 h-5 grid place-items-center rounded-full border transition-colors ${
                    isDone ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-[var(--crm-border)] bg-[var(--crm-panel)] text-transparent hover:border-[var(--crm-text-muted)]"
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12.5px] font-semibold ${isDone ? "text-[var(--crm-text-muted)] line-through" : "text-[var(--crm-text-primary)]"}`}>{item.label}</p>
                  <p className="text-[11.5px] leading-snug text-[var(--crm-text-secondary)]">{item.desc}</p>
                </div>
                {item.pending && (
                  <span className="flex-none rounded-full border border-[var(--crm-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--crm-text-muted)]">
                    Coming Soon
                  </span>
                )}
                {item.cta && !item.pending && (
                  <button
                    type="button"
                    onClick={() => runAction(item)}
                    className={`flex-none rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      item.danger
                        ? "border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)]"
                    }`}
                  >
                    {item.id === "form" && copied ? "Copied!" : item.cta}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
