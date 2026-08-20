"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"

// Tasteful, dismissible in-CRM trial countdown. Display-only — the real access
// gate is server-side (middleware). Surfaces at 14 / 7 / 3 / 1 days remaining;
// dismissing hides it until the next (smaller) threshold is reached, so it
// reminds without nagging. Rendered by the admin layout, fixed bottom-center so
// it never disturbs the CRM's fixed full-screen shell.

const DISMISS_KEY = "lb_trial_reminder_dismissed_bucket"

// Map days-remaining to the reminder "bucket" (threshold). null = don't show.
function bucketFor(days: number): number | null {
  if (days <= 1) return 1
  if (days <= 3) return 3
  if (days <= 7) return 7
  if (days <= 14) return 14
  return null
}

function daysRemaining(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export default function TrialReminder() {
  const [days, setDays] = useState<number | null>(null)
  const [bucket, setBucket] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session || cancelled) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status, trial_ends_at")
        .eq("id", session.user.id)
        .single()

      if (cancelled || !profile) return
      if (profile.subscription_status !== "trialing" || !profile.trial_ends_at) return

      const d = daysRemaining(profile.trial_ends_at)
      const b = bucketFor(d)
      if (b === null) return

      // Show unless the user already dismissed this bucket (or a smaller one).
      let dismissedBucket: number | null = null
      try {
        const raw = window.localStorage.getItem(DISMISS_KEY)
        dismissedBucket = raw ? parseInt(raw, 10) : null
      } catch {
        dismissedBucket = null
      }
      const hidden = dismissedBucket !== null && b >= dismissedBucket

      setDays(d)
      setBucket(b)
      setDismissed(hidden)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (dismissed || bucket === null || days === null) return null

  const urgent = bucket <= 3

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(bucket))
    } catch {
      // ignore
    }
    setDismissed(true)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        className={[
          "pointer-events-auto flex max-w-2xl items-center gap-3 rounded-full border px-5 py-2.5 shadow-lg backdrop-blur",
          urgent
            ? "border-amber-300 bg-amber-50/95 text-amber-900"
            : "border-[#dbe6ff] bg-white/95 text-[#26324a]",
        ].join(" ")}
      >
        <span className="text-[16px]" aria-hidden>
          {urgent ? "⏳" : "🎉"}
        </span>
        <p className="text-[14px] font-medium leading-snug">
          {/* The countdown carries the urgency, so it leads in semibold; the
              benefit line stays at the paragraph's own weight. */}
          <span className="font-semibold">
            {days} {days === 1 ? "day" : "days"} left in your free trial.
          </span>{" "}
          Keep full access + unlock Beast Academy.
        </p>
        <Link
          href="/admin/billing"
          className="flex-none rounded-full bg-[#2f6bff] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#265fe0]"
        >
          Subscribe
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-none rounded-full p-1 text-[15px] leading-none text-current/60 transition-opacity hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
