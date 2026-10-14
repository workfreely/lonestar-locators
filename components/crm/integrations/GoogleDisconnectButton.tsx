"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Disconnect the agent's own Google Calendar + Contacts authorization.
 *
 * ── CONFIRMATION, AND WHAT IT SAYS ──────────────────────────────────────────────────────────
 * The confirmation names the consequence rather than asking "are you sure": what stops, what
 * survives, and the fact that signing in with Google is a different thing entirely. Agents
 * routinely hesitate here precisely because those two are easy to confuse.
 *
 * ── IT NEVER REPORTS A DISCONNECT IT DID NOT ACHIEVE ────────────────────────────────────────
 * Three distinct outcomes, three distinct messages. Revoked at Google and removed here is the
 * clean case. Removed here but NOT revoked at Google is reported as exactly that, with the link
 * that finishes the job — a green tick there would be a lie the agent could not detect. A failure
 * to remove our own credentials is a failure, full stop: nothing was disconnected.
 */
const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions"

type Outcome = { kind: "clean" } | { kind: "partial" } | { kind: "error"; message: string }

export default function GoogleDisconnectButton() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  async function disconnect() {
    setBusy(true)
    setOutcome(null)
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; revoked?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setOutcome({ kind: "error", message: json.error ?? "We could not disconnect Google. Please try again." })
        return
      }
      setOutcome(json.revoked ? { kind: "clean" } : { kind: "partial" })
      setConfirming(false)
      // Re-read the server state so the row's Connected badge and the Connect/Reconnect label
      // reflect what actually happened, rather than this component's optimism.
      router.refresh()
    } catch {
      setOutcome({ kind: "error", message: "We could not reach Locator Beast. Nothing was disconnected." })
    } finally {
      setBusy(false)
    }
  }

  if (outcome?.kind === "clean") {
    return <span className="text-[12.5px] text-[#6b7280]">Google disconnected.</span>
  }

  if (outcome?.kind === "partial") {
    return (
      <span className="text-[12.5px] text-[#b45309]">
        Stopped syncing here, but we could not confirm removal at Google.{" "}
        <a href={GOOGLE_PERMISSIONS_URL} target="_blank" rel="noopener noreferrer" className="underline">
          Remove it in your Google Account
        </a>
        .
      </span>
    )
  }

  if (!confirming) {
    return (
      <div className="flex flex-none items-center gap-3">
        {outcome?.kind === "error" && <span className="text-[12.5px] text-[#b91c1c]">{outcome.message}</span>}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fef2f2]"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-none flex-col items-end gap-2">
      <p className="max-w-[320px] text-right text-[12.5px] leading-[1.5] text-[#6b7280]">
        New leads will stop creating Google contacts and calendar events. Contacts and events
        already created stay in your Google account, and your leads are untouched. This does not
        sign you out — signing in with Google keeps working.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="rounded-lg bg-[#b91c1c] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#991b1b] disabled:opacity-50"
        >
          {busy ? "Disconnecting…" : "Yes, disconnect"}
        </button>
      </div>
    </div>
  )
}
