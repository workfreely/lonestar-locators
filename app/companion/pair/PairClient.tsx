"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"

// Approve UI for pairing a Mac Companion. On approve, mints a device token via
// /api/companion/pair, then hands it back to the companion's loopback listener
// (127.0.0.1:<port>). If no port is present, falls back to showing the token
// once for manual entry.
//
// The identity block is load-bearing, not decoration: Beast Sync opens the SYSTEM
// DEFAULT browser, which may be signed into a different Locator Beast account
// than the one the locator works in. The device token binds this Mac to whatever
// workspace this session belongs to, so approving the wrong session silently
// routes a person's iMessages into someone else's CRM. Name the account, and give
// a way out, BEFORE the irreversible step.
export default function PairClient({
  port,
  state,
  email,
  displayName,
  workspaceName,
}: {
  port: string
  state: string
  email: string | null
  displayName: string | null
  workspaceName: string | null
}) {
  const [status, setStatus] = useState<"idle" | "working" | "handed-off" | "manual" | "error" | "switching">("idle")
  const [token, setToken] = useState("")
  const [error, setError] = useState("")

  const portNum = /^\d+$/.test(port) ? Number(port) : null

  // Sign out and come straight back to THIS pairing request, port + state intact,
  // so switching accounts never means restarting pairing from the Mac.
  async function switchAccount() {
    setStatus("switching")
    const qs = new URLSearchParams()
    if (port) qs.set("port", port)
    if (state) qs.set("state", state)
    const next = `/companion/pair?${qs.toString()}`
    try {
      await supabase.auth.signOut()
    } catch {
      /* best-effort — still send them to sign in */
    }
    window.location.href = `/login?next=${encodeURIComponent(next)}`
  }

  async function approve() {
    setStatus("working")
    setError("")
    try {
      const res = await fetch("/api/companion/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceName: "Mac Companion" }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? "Please sign in again to pair." : "Pairing failed. Please try again.")
        setStatus("error")
        return
      }
      const { token: raw } = await res.json()

      if (portNum && portNum > 0 && portNum < 65536) {
        // Hand the token to the companion's local listener, then it takes over.
        const cb = new URL(`http://127.0.0.1:${portNum}/callback`)
        cb.searchParams.set("token", raw)
        if (state) cb.searchParams.set("state", state)
        setStatus("handed-off")
        window.location.href = cb.toString()
      } else {
        // No loopback port — show the token once for manual entry.
        setToken(raw)
        setStatus("manual")
      }
    } catch {
      setError("Pairing failed. Please try again.")
      setStatus("error")
    }
  }

  const busy = status === "working" || status === "switching"

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--beast-border)] bg-white p-8 text-center shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--beast-blue)]/10 text-[26px]">💬</div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-[var(--beast-ink)]">
          Connect this Mac
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
          Authorize Beast Sync on this Mac to sync your Apple Messages into your CRM.
        </p>

        {/* WHO this will connect to. Shown before the action, always — this is the
            only place the browser's signed-in account becomes visible, and Beast
            Sync may have opened a browser the locator does not normally use. */}
        {status !== "manual" && status !== "handed-off" && (
          <div className="mt-6 rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--beast-ink-soft)]">
              Connecting to this account
            </p>
            {displayName && (
              <p className="mt-1.5 text-[14px] font-semibold text-[var(--beast-ink)]">{displayName}</p>
            )}
            <p className="mt-0.5 break-all text-[13px] text-[var(--beast-ink)]">{email ?? "Unknown account"}</p>
            <p className="mt-1 text-[12.5px] text-[var(--beast-ink-soft)]">
              Workspace: <span className="font-medium text-[var(--beast-ink)]">{workspaceName ?? "Unknown workspace"}</span>
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--beast-ink-soft)]">
              This Mac&rsquo;s messages will sync into this workspace. If this isn&rsquo;t you, switch accounts first.
            </p>
          </div>
        )}

        {status === "manual" ? (
          <div className="mt-6 text-left">
            <p className="text-[13px] font-medium text-[var(--beast-ink-soft)]">Paste this key into Beast Sync (shown once):</p>
            <code className="mt-2 block break-all rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3 font-mono text-[13px] text-[var(--beast-ink)]">
              {token}
            </code>
          </div>
        ) : status === "handed-off" ? (
          <p className="mt-6 text-[14px] font-medium text-[#16a34a]">Connected — you can close this tab and return to Beast Sync.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              className="mt-5 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:opacity-60"
            >
              {status === "working" ? "Connecting…" : "Connect This Mac"}
            </button>
            <button
              type="button"
              onClick={switchAccount}
              disabled={busy}
              className="mt-3 w-full rounded-full border border-[var(--beast-border)] bg-white px-7 py-3 text-[14px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f4f5f8] disabled:opacity-60"
            >
              {status === "switching" ? "Signing out…" : "Switch Account"}
            </button>
          </>
        )}

        {error && <p className="mt-4 text-[13px] text-red-500">{error}</p>}
      </div>
    </div>
  )
}
