"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

// The "Instagram & Facebook Ads" (Meta Ads) integration row. Phase 1 = CONNECT only. States:
// not-connected (Connect) · pending (minimal ad-account/page picker) · connected (badge + Manage) ·
// expired/revoked (Reconnect). Non-beta users see a disabled "Soon" (unchanged behavior). All Meta
// complexity is hidden; friendly copy only — never raw Meta errors.

type Asset = { id: string; name: string; instagramId?: string | null; instagramUsername?: string | null }
type Options = { pages: Asset[]; adAccounts: Asset[]; businesses: Asset[] }
type Connection = {
  status: "pending" | "connected" | "expired" | "revoked" | "error"
  instagramUsername: string | null
  pageName: string | null
  businessName: string | null
  adAccountName: string | null
  adAccountMasked: string | null
  tokenExpiresAt: string | null
  options: Options | null
}
type Manage = { betaAllowed: boolean; connection: Connection | null; adLink?: string | null; adLinkFacebook?: string | null; tutorialUrl?: string | null }

const ERROR_COPY: Record<string, string> = {
  beta: "Instagram & Facebook Ads is in limited beta right now.",
  not_configured: "This integration isn’t quite ready yet — check back soon.",
  declined: "Connection canceled.",
  state: "Your session expired. Please try connecting again.",
  no_code: "Something went wrong connecting. Please try again.",
  auth_failed: "We couldn’t connect to Meta. Please try again.",
  save: "We connected to Meta but couldn’t save it. Please try again.",
  no_ad_account: "We couldn’t find a Meta ad account. You’ll need one to import ads.",
  no_page: "We couldn’t find a Facebook Page. Instagram & Facebook ads need a linked Page.",
  unknown: "Something went wrong. Please try again.",
}

const CONNECT_URL = "/api/integrations/meta/connect"
const NAME = "Instagram & Facebook Ads"
const DESC = "Connect Instagram or Facebook ads to track leads and view sales analytics."
const last4 = (id: string | null | undefined) => (id ? id.replace(/\D/g, "").slice(-4) : "")

export default function MetaAdsSection() {
  const router = useRouter()
  const params = useSearchParams()
  const [data, setData] = useState<Manage | null>(null)
  const [busy, setBusy] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [pickAd, setPickAd] = useState("")
  const [pickPage, setPickPage] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/meta/manage", { headers: { Accept: "application/json" } })
      setData(res.ok ? ((await res.json()) as Manage) : { betaAllowed: false, connection: null })
    } catch {
      setData({ betaAllowed: false, connection: null })
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const metaStatus = params.get("meta")
  const metaError = params.get("meta_error")

  const confirm = async () => {
    if (!pickAd) return
    setBusy(true)
    try {
      const res = await fetch("/api/integrations/meta/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: pickAd, pageId: pickPage || undefined }),
      })
      if (res.ok) { router.replace("/admin/integrations"); await load() }
    } finally { setBusy(false) }
  }
  const disconnect = async () => {
    if (!window.confirm("Disconnect Instagram & Facebook Ads? Your ads and leads will stop syncing.")) return
    setBusy(true)
    try { await fetch("/api/integrations/meta/disconnect", { method: "POST" }); setManageOpen(false); await load() }
    finally { setBusy(false) }
  }
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const refresh = async () => {
    setBusy(true); setSyncMsg("Refreshing…")
    try {
      const res = await fetch("/api/integrations/meta/sync", { method: "POST" })
      setSyncMsg(res.ok ? "Performance updated." : "Couldn’t refresh — try again shortly.")
    } catch { setSyncMsg("Couldn’t refresh — try again shortly.") }
    finally { setBusy(false) }
  }
  const copy = (v: string) => { try { void navigator.clipboard.writeText(v) } catch { /* ignore */ } }

  const conn = data?.connection ?? null
  const betaAllowed = data?.betaAllowed ?? false
  const banner =
    metaError && ERROR_COPY[metaError] ? { kind: "error" as const, text: ERROR_COPY[metaError] } :
    metaStatus === "connected" ? { kind: "ok" as const, text: "Connected." } : null

  // Right-hand action for the header row, by state.
  let action: React.ReactNode
  let panel: React.ReactNode = null

  if (!data || !betaAllowed) {
    // Non-beta (or still loading): original disabled "Soon".
    action = (
      <button type="button" disabled className="cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]">Soon</button>
    )
  } else if (conn?.status === "pending" && conn.options) {
    const { pages, adAccounts } = conn.options
    action = <span className="text-[12.5px] font-medium text-[#b45309]">Choose your ad account →</span>
    panel = (
      <div className="rounded-lg border border-[#e5e7ee] bg-[#fafbfc] p-4">
        <p className="text-[13px] font-semibold text-[#111318]">Almost done — choose your ad account</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {pages.length > 1 && (
            <label className="block">
              <span className="text-[11.5px] font-medium text-[#6b7280]">Instagram / Page</span>
              <select value={pickPage} onChange={(e) => setPickPage(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e5e7ee] bg-white px-3 py-2 text-[13px]">
                <option value="">Select…</option>
                {pages.map((p) => <option key={p.id} value={p.id}>{p.instagramUsername ? `@${p.instagramUsername}` : p.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-[11.5px] font-medium text-[#6b7280]">Ad account</span>
            <select value={pickAd} onChange={(e) => setPickAd(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e5e7ee] bg-white px-3 py-2 text-[13px]">
              <option value="">Select…</option>
              {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} · ••••{last4(a.id)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" disabled={busy || !pickAd || (pages.length > 1 && !pickPage)} onClick={() => void confirm()} className="rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Confirm</button>
          <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318]">Cancel</button>
        </div>
      </div>
    )
  } else if (conn && conn.status !== "pending") {
    const needsReconnect = conn.status === "expired" || conn.status === "revoked" || conn.status === "error"
    // Match the Google rows exactly: a centered [Connected pill] + [action button] on the right, so
    // the pill and Manage/Reconnect line up across all integration rows. Account detail moves to a
    // subline under the description (below) for breathing room.
    action = needsReconnect ? (
      <a href={CONNECT_URL} className="rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white">Reconnect</a>
    ) : (
      <div className="flex flex-none items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#15803d]"><span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />Connected</span>
        {/* Match the Google Reconnect button exactly (width/height/padding/transition). */}
        <button type="button" onClick={() => setManageOpen((o) => !o)} className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8]">Manage</button>
      </div>
    )
    if (manageOpen && !needsReconnect) {
      panel = (
        <div className="rounded-lg border border-[#e5e7ee] bg-[#fafbfc] p-4 text-[13px]">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Field label="Instagram account" value={conn.instagramUsername ? `@${conn.instagramUsername}` : "—"} />
            <Field label="Facebook Page" value={conn.pageName || "—"} />
            <Field label="Ad account" value={conn.adAccountName ? `${conn.adAccountName}${conn.adAccountMasked ? ` · ${conn.adAccountMasked}` : ""}` : conn.adAccountMasked || "—"} />
            <Field label="Status" value={conn.status === "connected" ? "Connected" : conn.status} />
            {conn.businessName ? <Field label="Business" value={conn.businessName} /> : null}
          </dl>
          {data?.adLink && (
            <div className="mt-3 rounded-lg border border-[#e5e7ee] bg-white p-3">
              <p className="text-[12px] font-semibold text-[#111318]">Your ad link</p>
              <p className="text-[11.5px] text-[#6b7280]">Paste this as your Instagram/Facebook ad’s website URL. New leads will be tagged to the exact campaign & ad automatically.</p>
              <div className="mt-2 flex items-center gap-2">
                <input readOnly value={data.adLink} className="min-w-0 flex-1 truncate rounded-md border border-[#e5e7ee] bg-[#fafbfc] px-2 py-1.5 text-[11.5px] text-[#6b7280]" />
                <button type="button" onClick={() => copy(data.adLink!)} className="flex-none rounded-lg border border-[#e5e7ee] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#111318] hover:bg-[#f4f5f8]">Copy</button>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] hover:bg-[#f4f5f8]">Refresh performance</button>
            <a href={CONNECT_URL} className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] hover:bg-[#f4f5f8]">Reconnect</a>
            <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded-lg border border-[#fecaca] bg-white px-4 py-2 text-[13px] font-semibold text-[#b91c1c] hover:bg-[#fef2f2]">Disconnect</button>
          </div>
          {syncMsg && <p className="mt-2 text-[12px] text-[#6b7280]">{syncMsg}</p>}
        </div>
      )
    }
  } else {
    // Beta-allowed, not connected.
    action = <a href={CONNECT_URL} className="rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#255ae0]">Connect</a>
  }

  const connectedInfo =
    conn && conn.status === "connected"
      ? `${conn.instagramUsername ? `@${conn.instagramUsername}` : conn.pageName || "Meta account"}${conn.adAccountMasked ? ` · Ad account ${conn.adAccountMasked}` : ""}`
      : null
  const tutorialUrl = data?.tutorialUrl ?? null
  const tutorialText = "New to Meta ads? Watch the setup tutorial →"

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      {/* Header row — IDENTICAL structure to the Google rows (items-center over name + one-line
          helper), so the Connected pill + action button line up exactly with Google's. */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#111318]">{NAME}</p>
          <p className="text-[12.5px] text-[#6b7280]">{DESC}</p>
        </div>
        <div className="flex-none">{action}</div>
      </div>
      {/* Secondary line — tutorial (left) + connected account detail (right, beneath the action). */}
      {betaAllowed && (connectedInfo || tutorialUrl !== undefined) && (
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {tutorialUrl ? (
              <a href={tutorialUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-[#2f6bff] hover:underline">{tutorialText}</a>
            ) : (
              // No URL wired yet — visible placeholder, non-navigating (never a broken external link).
              <span className="cursor-default text-[12px] font-medium text-[#9aa3b2]" title="Setup tutorial coming soon">{tutorialText}</span>
            )}
          </div>
          {connectedInfo && <p className="flex-none text-right text-[12px] text-[#6b7280]">{connectedInfo}</p>}
        </div>
      )}
      {banner && <p className={"mt-2 text-[12.5px] " + (banner.kind === "error" ? "text-[#b91c1c]" : "text-[#15803d]")}>{banner.text}</p>}
      {panel && <div className="mt-3">{panel}</div>}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium text-[#6b7280]">{label}</dt>
      <dd className="text-[13px] text-[#111318]">{value}</dd>
    </div>
  )
}
