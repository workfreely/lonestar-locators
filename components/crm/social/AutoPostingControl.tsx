"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * SOCIAL BEAST — the master Auto Posting switch.
 *
 * Two renderings of ONE server-side setting:
 *   mode="control" — the authoritative toggle, on the Accounts page beside Publishing Destinations
 *   mode="status"  — a read-only pill for the Queue/Calendar, where you schedule
 *
 * The pill exists because a queue full of scheduled posts looks identical whether or not anything
 * will actually publish. PAUSED is therefore styled as a warning, not a neutral chip: the failure
 * mode worth designing against is believing posting is armed when it is not.
 *
 * This is display and intent only. The switch is enforced SERVER-SIDE by the Instagram worker,
 * which reads the same setting and fails closed — hiding a button has never stopped anything.
 */

type State = "on" | "paused"

export default function AutoPostingControl({ mode = "control" }: { mode?: "control" | "status" }) {
  const [state, setState] = useState<State | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/social-autopilot/auto-posting", { headers: { Accept: "application/json" }, cache: "no-store" })
      if (!res.ok) { setUnreadable(true); setState("paused"); return }
      const j = (await res.json()) as { autoPosting?: string; unreadable?: boolean }
      setState(j.autoPosting === "on" ? "on" : "paused")
      setUnreadable(!!j.unreadable)
    } catch {
      // Unknown is shown as PAUSED, matching what the server will actually do.
      setUnreadable(true)
      setState("paused")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = useCallback(async () => {
    if (state === null || busy) return
    const next: State = state === "on" ? "paused" : "on"
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/social-autopilot/auto-posting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoPosting: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const j = (await res.json()) as { autoPosting?: string }
      // Trust the STORED value the server reports back, never the value we asked for.
      setState(j.autoPosting === "on" ? "on" : "paused")
      setUnreadable(false)
    } catch {
      setError("Couldn’t change Auto Posting.")
      void load()
    } finally {
      setBusy(false)
    }
  }, [state, busy, load])

  if (state === null) return null

  const on = state === "on"

  if (mode === "status") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full border ${
          on
            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
            : "border-amber-500/50 text-amber-300 bg-amber-500/15"
        }`}
        title={on ? "Scheduled Instagram posts publish automatically." : "Scheduled posts stay scheduled — nothing publishes automatically."}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-emerald-400" : "bg-amber-400"}`} />
        Auto Posting: {on ? "ON" : "PAUSED"}
      </span>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] p-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">
          Auto Posting{" "}
          <span className={on ? "text-emerald-400" : "text-amber-300"}>{on ? "ON" : "PAUSED"}</span>
        </div>
        <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
          {on
            ? "Scheduled Instagram posts publish automatically at their scheduled time."
            : "Scheduled posts stay scheduled and are never deleted — but nothing publishes automatically."}
        </div>
        {/* The backlog rule, stated where the decision is made rather than discovered later. */}
        <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-1">
          Turning this back on does not publish posts missed while paused — those are reported as
          overdue and wait for you to reschedule them.
        </div>
        {unreadable && (
          <div className="text-[11.5px] text-amber-300 mt-1">
            The setting could not be read, so posting is treated as paused.
          </div>
        )}
        {error && <div className="text-[11.5px] text-[#c0264b] mt-1">{error}</div>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`flex-none px-4 py-2 rounded-lg text-[12px] font-semibold whitespace-nowrap disabled:opacity-50 border ${
          on
            ? "border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
            : "crm-cta border-transparent"
        }`}
      >
        {busy ? "Saving…" : on ? "Pause Auto Posting" : "Turn Auto Posting On"}
      </button>
    </div>
  )
}
