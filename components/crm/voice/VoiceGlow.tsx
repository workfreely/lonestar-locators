"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

// The "Beast is listening" indicator.
//
// A viewport-fixed overlay portalled onto document.body. That single choice is
// what makes it work identically in the normal dashboard, in Focus mode, and
// over the existing contact modal — it is anchored to the viewport, not to any
// container, so no layout structure had to change to accommodate it and no CRM
// surface knows it exists.
//
// pointer-events:none and no geometry of its own: it cannot shift layout or
// intercept a click on the workflow beneath it.
//
// Purely presentational. It reads one boolean and renders; it triggers nothing,
// observes no workflow, and has no path to any CRM action.
//
// Fading in is a CSS animation on mount rather than a state flip on the next
// animation frame: requestAnimationFrame is throttled while a tab is in the
// background, which would leave the aura stuck invisible.
const FADE_MS = 520

export default function VoiceGlow({ active }: { active: boolean }) {
  const [mounted, setMounted] = useState(false)
  // Kept mounted through the fade-out so the aura dissolves instead of
  // disappearing between frames — the difference between "premium" and "blink".
  const [present, setPresent] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)

    if (active) {
      setLeaving(false)
      setPresent(true)
      return
    }

    if (!present) return
    setLeaving(true)
    timer.current = setTimeout(() => {
      setPresent(false)
      setLeaving(false)
    }, FADE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [active, present])

  if (!mounted || !present) return null

  return createPortal(
    <div className="bv-glow" data-leaving={leaving ? "true" : "false"} aria-hidden>
      {/* Two layers, breathing on different periods so the composite never lands
          on an obvious sine wave: a crisp illuminated line at the very edge, and
          a tight bloom just inside it. Deliberately NO wide ambient layer — the
          effect is a lit perimeter, not a wash over the dashboard. */}
      <span className="bv-glow-line" />
      <span className="bv-glow-bloom" />
    </div>,
    document.body
  )
}
