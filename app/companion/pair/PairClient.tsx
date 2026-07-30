"use client"

import { useState } from "react"

// Approve UI for pairing a Mac Companion. On approve, mints a device token via
// /api/companion/pair, then hands it back to the companion's loopback listener
// (127.0.0.1:<port>). If no port is present, falls back to showing the token
// once for manual entry.
export default function PairClient({ port, state }: { port: string; state: string }) {
  const [status, setStatus] = useState<"idle" | "working" | "handed-off" | "manual" | "error">("idle")
  const [token, setToken] = useState("")
  const [error, setError] = useState("")

  const portNum = /^\d+$/.test(port) ? Number(port) : null

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--beast-border)] bg-white p-8 text-center shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--beast-blue)]/10 text-[26px]">💬</div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-[var(--beast-ink)]">
          Connect this Mac
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
          Authorize the Locator Beast Companion on this Mac to sync your Apple Messages into your CRM.
        </p>

        {status === "manual" ? (
          <div className="mt-6 text-left">
            <p className="text-[13px] font-medium text-[var(--beast-ink-soft)]">Paste this key into the Companion (shown once):</p>
            <code className="mt-2 block break-all rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3 font-mono text-[13px] text-[var(--beast-ink)]">
              {token}
            </code>
          </div>
        ) : status === "handed-off" ? (
          <p className="mt-6 text-[14px] font-medium text-[#16a34a]">Handed off to the Companion — you can close this tab.</p>
        ) : (
          <button
            type="button"
            onClick={approve}
            disabled={status === "working"}
            className="mt-7 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:opacity-60"
          >
            {status === "working" ? "Connecting…" : "Approve & Connect"}
          </button>
        )}

        {error && <p className="mt-4 text-[13px] text-red-500">{error}</p>}
      </div>
    </div>
  )
}
