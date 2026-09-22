"use client"

import { useEffect, useState, useCallback } from "react"
import { settingsInputCls } from "@/components/crm/settings/SettingsShell"

// Approved Agents panel — search Locator Beast agents by safe identity and Grant /
// Revoke Automated Texting authorization. Every mutation goes to the protected
// /api/admin/automated-texting route (platform-admin gated, service-role write).
// The panel never writes the authorization table directly.

type ApprovedAgent = { userId: string; grantedAt: string; name: string; email: string | null; photoUrl: string | null }
type SearchResult = { id: string; name: string; email: string | null; photoUrl: string | null; approved: boolean }

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase()
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className="h-8 w-8 flex-none rounded-full object-cover" />
  }
  return (
    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#e8ebf3] text-[12px] font-semibold text-[#4b5162]">
      {initial}
    </span>
  )
}

export default function ApprovedAgentsPanel() {
  const [approved, setApproved] = useState<ApprovedAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadApproved = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/automated-texting")
      if (!res.ok) throw new Error("Could not load approved agents.")
      const j = await res.json()
      setApproved(j.approved ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadApproved()
  }, [loadApproved])

  // Debounced search.
  useEffect(() => {
    const query = q.trim()
    if (!query) {
      setResults([])
      return
    }
    let active = true
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/automated-texting?q=${encodeURIComponent(query)}`)
        if (!res.ok) throw new Error("search_failed")
        const j = await res.json()
        if (active) setResults(j.results ?? [])
      } catch {
        if (active) setResults([])
      } finally {
        if (active) setSearching(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [q])

  async function mutate(userId: string, action: "grant" | "revoke") {
    setBusyId(userId)
    setError(null)
    try {
      const res = await fetch("/api/admin/automated-texting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Update failed")
      await loadApproved()
      // Reflect the change in any visible search results too.
      setResults((prev) => prev.map((r) => (r.id === userId ? { ...r, approved: action === "grant" } : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed")
    } finally {
      setBusyId(null)
    }
  }

  const grantBtn =
    "flex-none rounded-lg bg-[#2f6bff] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-50"
  const revokeBtn =
    "flex-none rounded-lg border border-[#e0644f] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#c23c28] transition-colors hover:bg-[#fdeeeb] disabled:opacity-50"

  return (
    <div className="flex flex-col gap-6">
      {/* Search / Grant */}
      <div className="flex flex-col gap-2">
        <label className="text-[12.5px] font-semibold text-[#4b5162]">Find an agent to approve</label>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className={settingsInputCls}
        />
        {q.trim() && (
          <div className="mt-1 overflow-hidden rounded-xl border border-[#e5e7ee]">
            {searching && results.length === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-[#9098a8]">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-[#9098a8]">No matching agents.</p>
            ) : (
              results.map((r) => (
                <div key={r.id} className="flex items-center gap-3 border-b border-[#eef0f5] px-3 py-2.5 last:border-b-0">
                  <Avatar name={r.name} photoUrl={r.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[#111318]">{r.name}</div>
                    {r.email && <div className="truncate text-[12px] text-[#9098a8]">{r.email}</div>}
                  </div>
                  {r.approved ? (
                    <span className="flex-none text-[12px] font-semibold text-[#1f9d63]">Approved</span>
                  ) : (
                    <button type="button" disabled={busyId === r.id} onClick={() => mutate(r.id, "grant")} className={grantBtn}>
                      {busyId === r.id ? "…" : "Grant"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Approved list */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">Approved accounts</h3>
        {loading ? (
          <p className="text-[12.5px] text-[#9098a8]">Loading…</p>
        ) : approved.length === 0 ? (
          <p className="text-[12.5px] text-[#9098a8]">No accounts are approved yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e5e7ee]">
            {approved.map((a) => (
              <div key={a.userId} className="flex items-center gap-3 border-b border-[#eef0f5] px-3 py-2.5 last:border-b-0">
                <Avatar name={a.name} photoUrl={a.photoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[#111318]">{a.name}</div>
                  {a.email && <div className="truncate text-[12px] text-[#9098a8]">{a.email}</div>}
                </div>
                <button type="button" disabled={busyId === a.userId} onClick={() => mutate(a.userId, "revoke")} className={revokeBtn}>
                  {busyId === a.userId ? "…" : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  )
}
