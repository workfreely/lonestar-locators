"use client"

import type { ReactNode } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

/**
 * A DRAGGABLE ROW, and its six-dot handle.
 *
 * Lifted verbatim out of BestMatches so Recommended Properties and Favorite Properties share one
 * implementation rather than two that look alike today and drift tomorrow. Nothing about the
 * behaviour changed in the move: same sensors, same transform, same handle.
 *
 * ── THE HANDLE IS THE ONLY DRAG SURFACE ─────────────────────────────────────────────────────
 * The listeners are bound to the grip button, never to the row. A card is full of controls — ✕,
 * ♡, Guest Card Sent, Tour Follow-Up — and binding the drag to the whole row would make every
 * one of them a potential accidental drag. `touch-none` on the handle stops the browser scrolling
 * the page when a finger starts there, which is what makes this work on a phone; the rest of the
 * card still scrolls normally because it is not a drag surface.
 *
 * The 5px activation distance is what keeps a click a click: a press that never travels is passed
 * through to the button under it.
 */

/** Six dots. Deliberately low-contrast until hovered — it is an affordance, not a feature. */
export function Grip() {
  return (
    <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden fill="currentColor">
      <circle cx="3" cy="3" r="1.35" /><circle cx="7" cy="3" r="1.35" />
      <circle cx="3" cy="8" r="1.35" /><circle cx="7" cy="8" r="1.35" />
      <circle cx="3" cy="13" r="1.35" /><circle cx="7" cy="13" r="1.35" />
    </svg>
  )
}

export default function SortableRow({
  id,
  enabled,
  label = "Reorder this property",
  children,
}: {
  id: string
  /** False ⇒ the row renders exactly as it would with no drag-and-drop at all, handle included:
   *  no wrapper, no indent, no layout change. That is what makes this safe to add to a list that
   *  cannot always be reordered. */
  enabled: boolean
  label?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled })
  if (!enabled) return <>{children}</>
  return (
    <div
      ref={setNodeRef}
      style={{
        // x/scale pinned: a vertical list should move vertically, and a scaling row looks broken.
        transform: CSS.Transform.toString(transform ? { ...transform, x: 0, scaleX: 1, scaleY: 1 } : null),
        transition,
        // The dragged row rides above its neighbours and dims slightly, so it reads as lifted.
        zIndex: isDragging ? 20 : undefined,
        position: isDragging ? "relative" : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
      className="flex items-stretch gap-1"
    >
      <button
        type="button"
        aria-label={label}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        className="flex w-4 flex-none cursor-grab touch-none items-center justify-center rounded text-[var(--crm-text-muted)] opacity-60 transition-opacity duration-[120ms] hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
      >
        <Grip />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
