"use client"

import { useState } from "react"

/**
 * Start Follow-Up for a lead that arrived while the locator was Out of Office.
 *
 * Deliberately a SIBLING of HoldControls, never an extension of it. Hold Resume is
 * subtractive — it clears two columns and manufactures nothing. This one causes a
 * client to be texted. Overloading one button with both meanings would make its
 * blast radius depend on hidden lead state, and HoldControls does not even render
 * for these leads (held_at is null), so there is no control here to reuse.
 *
 * IN-FLIGHT SAFETY. The button disables while the request is open, and the card is
 * NOT optimistically updated: it stays visible until the API confirms, so a failed
 * request leaves the action available rather than silently losing it. That is the
 * opposite of the usual optimistic-UI instinct, and correct here — the cost of a
 * lost click is a lead nobody follows up, while the cost of a double click is
 * nothing, because the server and the one-active-lifecycle unique index are the
 * real idempotency.
 */
export default function OooFollowUpControls({
  leadId,
  onStarted,
}: {
  leadId: string | number
  /** Called only after the API confirms, so the parent can drop the button. */
  onStarted?: (leadId: string | number) => void
}) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle")

  // The card itself is clickable (it opens the lead); these controls must not
  // trigger that — same guard HoldControls uses.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  async function start(e: React.MouseEvent) {
    e.stopPropagation()
    if (state === "busy") return
    setState("busy")
    try {
      const res = await fetch("/api/admin/leads/start-ooo-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      })
      if (!res.ok) throw new Error(`start failed: ${res.status}`)
      // The endpoint reports an already-started lead as ok:true, so a stale tab or
      // a second click converges on the same end state rather than erroring.
      onStarted?.(leadId)
    } catch {
      setState("error")
    }
  }

  return (
    <div className="kb-hold-controls" onClick={stop}>
      <button
        type="button"
        className="kb-hold-btn kb-hold-btn--primary"
        onClick={start}
        disabled={state === "busy"}
        aria-busy={state === "busy"}
      >
        {state === "busy" ? "Starting…" : "Start Follow-Up"}
      </button>
      {state === "error" && (
        <p className="kb-ooo-err">Could not start follow-up. Try again.</p>
      )}
    </div>
  )
}
