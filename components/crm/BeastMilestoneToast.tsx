"use client"

import { useEffect, useState } from "react"
import { onBeastMilestone } from "@/lib/beastMilestones/events"
import type { BeastMilestone } from "@/lib/beastMilestones/registry"
import Confetti from "./Confetti"

type ToastItem = { id: number; milestone: BeastMilestone }
type Burst = { id: number; intensity: BeastMilestone["intensity"] }

let counter = 0

// Mounted once (in DashboardClient). Listens for unlocked Beast Milestones and
// celebrates each with a tasteful toast + a short confetti burst. Non-blocking
// and stacks gracefully if two unlock at once.
export default function BeastMilestoneToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [bursts, setBursts] = useState<Burst[]>([])

  useEffect(() => {
    return onBeastMilestone((milestone) => {
      const id = ++counter
      setToasts((prev) => [...prev, { id, milestone }])
      setBursts((prev) => [...prev, { id, intensity: milestone.intensity }])
    })
  }, [])

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <>
      {bursts.map((b) => (
        <Confetti
          key={b.id}
          intensity={b.intensity}
          onDone={() => setBursts((prev) => prev.filter((x) => x.id !== b.id))}
        />
      ))}

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10060] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <MilestoneCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </>
  )
}

function MilestoneCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { milestone } = item

  // Stays visible until the user dismisses it with the ✕ — no auto-dismiss.
  return (
    <div className="beast-milestone-pop pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-[0_10px_40px_rgba(var(--crm-shadow-color),0.28)] overflow-hidden">
      {/* Accent top edge — a small, professional flourish, not a banner. */}
      <div className="h-1 w-full bg-gradient-to-r from-[#2f6bff] via-[#8b5cf6] to-[#f5b100]" />
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex-none text-[26px] leading-none mt-0.5" aria-hidden>
            {milestone.badgeEmoji}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--crm-text-muted)]">
              🐆 Beast Milestone Unlocked
            </p>
            <p className="text-[15px] font-bold text-[var(--crm-text-primary)] mt-0.5">
              {milestone.title}
            </p>
            <p className="text-[12.5px] text-[var(--crm-text-secondary)] mt-0.5 leading-snug">
              {milestone.message}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex-none -mr-1 -mt-0.5 w-6 h-6 flex items-center justify-center rounded-lg text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
