"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

// CP5 — Sent Lists management surface (Workspace → Client Tools → Sent Lists).
//
// A READ + MANAGE view over the EXISTING immutable client-share snapshots — it
// creates no parallel sharing system. Data comes from the canonical CP2 list
// endpoint (workspace-wide sent-only branch); Preview / Copy Link resolve the exact
// stable URL through the canonical Vault-backed GET /api/admin/client-shares/:id;
// Disable / Activate use the canonical PATCH. Snapshots are immutable and never
// edited here. Everything is RLS-scoped to the caller's workspace on the server.

type SentList = {
  id: string
  leadId: number
  clientName: string
  listNumber: number
  prefix: string | null
  sentAt: string | null
  status: "active" | "disabled"
  itemCount: number
  favoritedCount: number
  lastViewedAt: string | null
  viewSessionCount: number
}

export default function SentListsPanel({
  timeZone,
  leadId = null,
  clientName = null,
}: {
  timeZone: string
  /** When set, scope the view to ONE client's lists (the CRM Recommended Properties
   *  entry). Null = the workspace-wide surface (/admin/sent-lists), unchanged. */
  leadId?: number | string | null
  clientName?: string | null
}) {
  const [rows, setRows] = useState<SentList[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone || undefined,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [timeZone],
  )
  const fmtDate = useCallback(
    (iso: string | null) => {
      if (!iso) return null
      const d = new Date(iso)
      return isNaN(d.getTime()) ? null : dateFmt.format(d)
    },
    [dateFmt],
  )

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/client-shares", { headers: { Accept: "application/json" } })
      if (!res.ok) {
        setError(res.status === 401 ? "Please sign in again." : "Couldn't load sent lists.")
        setRows([])
        return
      }
      const json = (await res.json()) as { shares?: SentList[] }
      const all = Array.isArray(json.shares) ? json.shares : []
      // Client-scoped entry (CRM Recommended Properties) filters the SAME canonical
      // sent-only list to this lead — the smallest safe scoping, no API/schema change.
      setRows(leadId != null ? all.filter((r) => String(r.leadId) === String(leadId)) : all)
    } catch {
      setError("Couldn't load sent lists.")
      setRows([])
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  // Resolve the exact stable client URL through the canonical Vault-backed path.
  // Never mints; never exposes token internals (the endpoint returns only /r/<token>).
  const resolveUrl = useCallback(async (id: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/client-shares/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } })
      if (!res.ok) return null
      const json = (await res.json()) as { url?: string }
      return typeof json.url === "string" ? json.url : null
    } catch {
      return null
    }
  }, [])

  const onPreview = useCallback(
    async (id: string) => {
      setBusyId(id)
      const url = await resolveUrl(id)
      setBusyId(null)
      if (url) window.open(url, "_blank", "noopener,noreferrer")
      else setError("Couldn't open that list.")
    },
    [resolveUrl],
  )

  const onCopy = useCallback(
    async (id: string) => {
      setBusyId(id)
      const url = await resolveUrl(id)
      setBusyId(null)
      if (!url) {
        setError("Couldn't copy that link.")
        return
      }
      try {
        await navigator.clipboard.writeText(url)
        setCopiedId(id)
        setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800)
      } catch {
        // Clipboard blocked (permissions) — surface the URL so the agent can copy it.
        setError("Copy blocked by the browser. Link: " + url)
      }
    },
    [resolveUrl],
  )

  // Disable / Activate — the canonical reversible toggle. Never deletes the snapshot;
  // the SAME historical list becomes usable again on Activate (no new token/list).
  const onToggle = useCallback(async (id: string, disable: boolean) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/client-shares/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: disable }),
      })
      if (res.ok) {
        setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, status: disable ? "disabled" : "active" } : r)))
      } else {
        setError(disable ? "Couldn't disable that list." : "Couldn't reactivate that list.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setBusyId(null)
    }
  }, [])

  const scoped = leadId != null
  const wrap = "max-w-[1200px] mx-auto"
  const btn =
    "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

  return (
    <div className={wrap}>
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[var(--crm-text-primary)]">
          {scoped ? `Sent List History${clientName ? ` (${clientName})` : ""}` : "Sent Lists"}
        </h1>
        <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1">
          {scoped
            ? "Recommendation lists you've sent to this client. Preview or copy the exact list they see, or disable a link."
            : "Recommendation lists you've sent to clients. Preview or copy the exact list a client sees, or disable a link."}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[13px] text-[var(--crm-text-secondary)]">
          {error}
        </div>
      )}

      {rows === null ? (
        <div className="text-[13px] text-[var(--crm-text-secondary)] py-10 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-[var(--crm-text-primary)]">No sent lists yet</p>
          <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1.5">
            {scoped ? "Lists you send to this client will appear here." : "Lists you send to clients will appear here."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">
                {!scoped && <th className="px-4 py-3 font-semibold">Client</th>}
                <th className="px-3 py-3 font-semibold">List</th>
                <th className="px-3 py-3 font-semibold">Sent</th>
                <th className="px-3 py-3 font-semibold text-right">Properties</th>
                <th className="px-3 py-3 font-semibold text-right">Favorited</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold text-right">Views</th>
                <th className="px-3 py-3 font-semibold">Last Viewed</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const busy = busyId === r.id
                return (
                  <tr key={r.id} className="border-t border-[var(--crm-border)]">
                    {!scoped && <td className="px-4 py-3 font-semibold text-[var(--crm-text-primary)] whitespace-nowrap">{r.clientName}</td>}
                    <td className="px-3 py-3 text-[var(--crm-text-secondary)] whitespace-nowrap">List {r.listNumber}</td>
                    <td className="px-3 py-3 text-[var(--crm-text-secondary)] whitespace-nowrap">{fmtDate(r.sentAt) ?? "—"}</td>
                    <td className="px-3 py-3 text-[var(--crm-text-secondary)] text-right tabular-nums">{r.itemCount}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {r.favoritedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#e0245e]">
                          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden fill="#e0245e" stroke="#e0245e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" />
                          </svg>
                          {r.favoritedCount}
                        </span>
                      ) : (
                        <span className="text-[var(--crm-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold " +
                          (r.status === "active"
                            ? "text-emerald-700 bg-emerald-500/12 dark:text-emerald-400"
                            : "text-[var(--crm-text-muted)] bg-[var(--crm-card)]")
                        }
                      >
                        <span className={"h-1.5 w-1.5 rounded-full " + (r.status === "active" ? "bg-emerald-500" : "bg-[var(--crm-text-muted)]")} />
                        {r.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[var(--crm-text-secondary)] text-right tabular-nums">{r.viewSessionCount}</td>
                    <td className="px-3 py-3 text-[var(--crm-text-secondary)] whitespace-nowrap">
                      {fmtDate(r.lastViewedAt) ?? <span className="text-[var(--crm-text-muted)]">Not viewed yet</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <button type="button" className={btn} disabled={busy} onClick={() => onPreview(r.id)}>Preview</button>
                        <button type="button" className={btn} disabled={busy} onClick={() => onCopy(r.id)}>
                          {copiedId === r.id ? "Copied" : "Copy Link"}
                        </button>
                        {r.status === "active" ? (
                          <button type="button" className={btn} disabled={busy} onClick={() => onToggle(r.id, true)}>Disable</button>
                        ) : (
                          <button type="button" className={btn} disabled={busy} onClick={() => onToggle(r.id, false)}>Activate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
