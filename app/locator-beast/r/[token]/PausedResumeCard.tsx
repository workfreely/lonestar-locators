"use client"

import { useState } from "react"

// The single paused-state card on a DISABLED /r page. Body + "Resume Your Search"
// CTA; on success it swaps to the resumed confirmation. Resuming re-engages the LEAD
// (server-side, token-scoped) but NEVER re-opens the property list — the share stays
// disabled. Idempotent: repeated taps return success without duplicating anything.
export default function PausedResumeCard({ token, agentFirst }: { token: string; agentFirst: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")

  async function resume() {
    if (state === "busy" || state === "done") return
    setState("busy")
    try {
      const res = await fetch("/api/r/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) throw new Error("resume failed")
      setState("done")
    } catch {
      setState("error")
    }
  }

  if (state === "done") {
    return (
      <div className="lbr-paused">
        <h2 className="lbr-paused-title">Your search has been resumed!</h2>
        <p className="lbr-paused-body">{agentFirst} will reach out to you soon to get things updated.</p>
      </div>
    )
  }

  return (
    <div className="lbr-paused">
      <p className="lbr-paused-body">Tap Resume Search to pick up where we left off.</p>
      <button type="button" className="lbr-paused-btn" onClick={resume} disabled={state === "busy"} aria-busy={state === "busy"}>
        {state === "busy" ? "Resuming…" : "Resume Search"}
      </button>
      {state === "error" && (
        <p className="lbr-paused-err">Something went wrong. Please try again.</p>
      )}
    </div>
  )
}
