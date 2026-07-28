"use client"

import { useEffect, useRef } from "react"

// Lightweight, dependency-free confetti burst on a full-screen canvas. Fires
// once, cleans itself up, and never blocks the UI (pointer-events:none). Honors
// prefers-reduced-motion by skipping the animation entirely.
//
// "small" = a brief ~1s pop (First Lease); "big" = a fuller ~1.8s burst
// (commission milestones) — still tasteful, never a screen-filling storm.

type Intensity = "small" | "big"

const CONFIG: Record<Intensity, { count: number; durationMs: number }> = {
  small: { count: 90, durationMs: 1000 },
  big: { count: 180, durationMs: 1800 },
}

// Locator Beast palette — accent blue, golds, greens, a couple of festive pops.
const COLORS = ["#2f6bff", "#f5b100", "#f97316", "#10b981", "#8b5cf6", "#ffffff"]

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vrot: number
  size: number
  color: string
}

export default function Confetti({
  intensity,
  onDone,
}: {
  intensity: Intensity
  onDone: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches

    if (!canvas || reduceMotion) {
      onDone()
      return
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      onDone()
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const { count, durationMs } = CONFIG[intensity]

    // Burst upward-and-outward from just below center, then gravity pulls it
    // down — reads like a popper, not falling rain.
    const originX = W / 2
    const originY = H * 0.62
    const particles: Particle[] = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.9)
      const speed = 6 + Math.random() * 8
      return {
        x: originX + (Math.random() - 0.5) * 60,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        size: 5 + Math.random() * 6,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      }
    })

    const gravity = 0.22
    const drag = 0.992
    const start = performance.now()
    let raf = 0

    const frame = (now: number) => {
      const elapsed = now - start
      const t = Math.min(elapsed / durationMs, 1)
      // Fade out over the last third so it dissolves rather than vanishing.
      const alpha = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34

      ctx.clearRect(0, 0, W, H)
      ctx.globalAlpha = Math.max(alpha, 0)

      for (const p of particles) {
        p.vx *= drag
        p.vy = p.vy * drag + gravity
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vrot

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }

      if (elapsed < durationMs) {
        raf = requestAnimationFrame(frame)
      } else {
        ctx.clearRect(0, 0, W, H)
        onDone()
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // Fire once for this burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 z-[10050] pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  )
}
