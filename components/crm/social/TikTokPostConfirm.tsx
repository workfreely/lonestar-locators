"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SiTiktok } from "react-icons/si"

// Minimal TikTok Direct Post confirmation (Sandbox MVP). Opens for a READY Social Beast post,
// loads Creator Info + the exact caption/video via ONE server dry-run call, lets the admin confirm
// privacy/interaction options populated ONLY from Creator Info plus TikTok's Commercial Content
// Disclosure, and — on explicit "Post to TikTok" — fires the real Direct Post. Tokens never touch
// the client. Reuses CRM tokens/styles; not an editor. While the app is unaudited, TikTok only
// accepts SELF_ONLY (private) — respected here.

type Capabilities = {
  privacyLevelOptions: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number
}
type DryRun = {
  ready: boolean
  transferMethod: string
  creator: { username: string; nickname: string; avatarUrl: string }
  capabilities: Capabilities
  unaudited: boolean
  title: string
  titleLength: number
  videoSize: number
}

const PRIVACY_LABEL: Record<string, string> = {
  SELF_ONLY: "Private (only me)",
  PUBLIC_TO_EVERYONE: "Public",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
}

const PUBLISH = "/api/integrations/tiktok/publish"
const STATUS = "/api/integrations/tiktok/publish/status"
// Existing SAFE render-only action: produces the 9:16 derivative (render_status→ready),
// leaves the post's lifecycle status unchanged, and does NOT publish to Instagram.
const RENDER = (postId: string) => `/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/render`

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Switch-style toggle for Content Disclosure — a themed visual replacement for a plain checkbox,
// sitting beside its heading instead of floating at the far right of a wide row. Purely
// presentational: the caller still owns the boolean state/handler exactly as before.
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors ${checked ? "bg-[var(--crm-accent)]" : "bg-[var(--crm-border)]"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  )
}

export default function TikTokPostConfirm({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DryRun | null>(null)

  // No default value — TikTok requires the user to manually pick a privacy level; the radios
  // below render nothing checked until they do (in today's Sandbox, that means clicking the one
  // enabled option, SELF_ONLY).
  const [privacy, setPrivacy] = useState<string>("")
  // Interaction toggles. Comments now default ON, because these are promotional posts whose whole
  // CTA is "Comment LIST" — a default that silenced the thing the video asks for was working
  // against the content. Duet and Stitch stay OFF.
  //
  // Creator Info can only further RESTRICT: a creator-disabled interaction is not offered in the UI
  // and the default below is taken from the capability, so it is never switched on for a creator
  // who has comments off. resolveDirectPostSelection clamps it server-side regardless
  // (`info.comment_disabled ? true : …`), so this is a UI default and never an override.
  const [allowComment, setAllowComment] = useState(false)
  const [allowDuet, setAllowDuet] = useState(false)
  const [allowStitch, setAllowStitch] = useState(false)

  // Commercial Content Disclosure (TikTok Content Sharing Guidelines). Now defaults to ON with
  // "Your brand" selected: every video Social Beast posts promotes the locating service itself,
  // which is exactly what TikTok's own-brand disclosure describes, and the published post is
  // labelled "Promotional content" as a result.
  //
  // Branded Content stays OFF — it means a paid third-party promotion, which these are not, and
  // TikTok forbids it on a SELF_ONLY post anyway. Disclosure ON with neither box ticked is refused
  // server-side, so the pair of defaults has to be set together to be valid.
  const [disclosureOn, setDisclosureOn] = useState(false)
  const [yourBrand, setYourBrand] = useState(false)
  const [brandedContent, setBrandedContent] = useState(false)

  // DEFAULTS ARE APPLIED ONCE PER POST, NOT ON EVERY OPEN.
  //
  // load() runs on every open and used to reset privacy, disclosure and the interaction toggles
  // unconditionally — so closing the dialog to check something and reopening it silently discarded
  // whatever had been chosen. This records which post has already been initialised; a reopen then
  // leaves the current selections alone and only refreshes Creator Info and the caption.
  // Cleared after a successful post, so the next one starts from the defaults again rather than
  // inheriting the last post's choices.
  const initialisedFor = useRef<string | null>(null)
  // TikTok never allows Branded Content on a SELF_ONLY (private) post.
  const brandedContentBlocked = privacy === "SELF_ONLY"
  // Keep state consistent if privacy resolves to SELF_ONLY after Branded Content was checked
  // (not reachable today — only SELF_ONLY is ever selectable pre-audit — but safe once audited).
  useEffect(() => {
    if (brandedContentBlocked && brandedContent) setBrandedContent(false)
  }, [brandedContentBlocked, brandedContent])
  const disclosureIncomplete = disclosureOn && !yourBrand && !brandedContent
  const postBlocked = disclosureIncomplete || !privacy

  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<{ publishId: string; status: string; failReason: string | null } | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [needsRender, setNeedsRender] = useState(false) // post has no current render → offer Render now
  const [rendering, setRendering] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null); setData(null); setResult(null); setNeedsRender(false)
    // Privacy is deliberately NOT pre-selected: TikTok requires an explicit choice. It is cleared
    // only on a first initialisation, so reopening keeps a choice already made.
    const firstForThisPost = initialisedFor.current !== postId
    if (firstForThisPost) { setPrivacy(""); setDisclosureOn(true); setYourBrand(true); setBrandedContent(false) }
    try {
      // Single dry-run: resolves token + Creator Info + caption + video size WITHOUT posting.
      const res = await fetch(PUBLISH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, mode: "dry_run", privacyLevel: "SELF_ONLY" }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ready) {
        // A post with no current render isn't an error — offer the safe render-only action.
        if (json?.error === "not_ready") { setNeedsRender(true); return }
        setError(json?.error === "not_connected" ? "TikTok isn't connected." : "Couldn't prepare the TikTok post.")
        return
      }
      const d = json as DryRun
      setData(d)
      if (firstForThisPost) {
        // Comments ON unless the creator has them disabled — the capability decides, not us.
        setAllowComment(!d.capabilities.commentDisabled)
        setAllowDuet(false)
        setAllowStitch(false)
        initialisedFor.current = postId
      } else if (d.capabilities.commentDisabled) {
        // A reopen keeps the operator's choices, with one exception: if Creator Info now reports
        // comments disabled, that is TikTok restricting the account and it wins over a stale
        // selection. The server clamps it too; this keeps the UI from showing something untrue.
        setAllowComment(false)
      }
    } catch {
      setError("Couldn't reach TikTok.")
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => { if (open) void load() }, [open, load])

  // Render the draft's current derivative via the existing safe render route (no Instagram
  // publish; status stays a draft), then reload the dry-run so the video shows as ready.
  const doRender = async () => {
    setRendering(true); setError(null)
    try {
      const res = await fetch(RENDER(postId), { method: "POST" })
      if (!res.ok) { setError("Couldn't render this post. Please try again."); return }
      setNeedsRender(false)
      await load()
    } catch {
      setError("Couldn't render this post.")
    } finally {
      setRendering(false)
    }
  }

  const doPost = async () => {
    if (!data) return
    if (!confirm("Post this video to TikTok now? (Sandbox — private/SELF_ONLY)")) return
    setPosting(true); setError(null)
    try {
      const res = await fetch(PUBLISH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId, mode: "post", privacyLevel: privacy,
          disableComment: !allowComment, disableDuet: !allowDuet, disableStitch: !allowStitch,
          disclosureOn, disclosureYourBrand: yourBrand, disclosureBrandedContent: brandedContent,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.publishId) {
        setError(json?.detail ? `TikTok rejected the post: ${json.detail}` : "TikTok post failed.")
        return
      }
      setResult({ publishId: json.publishId, status: json.status, failReason: json.failReason ?? null })
      // This post is done. Drop the init marker so a subsequent open starts from the defaults —
      // including an unset privacy, which TikTok requires to be chosen per post.
      initialisedFor.current = null
    } catch {
      setError("Couldn't reach TikTok.")
    } finally {
      setPosting(false)
    }
  }

  const checkStatus = async () => {
    if (!result) return
    setStatusBusy(true)
    try {
      const res = await fetch(STATUS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishId: result.publishId }) })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.status) setResult({ ...result, status: json.status, failReason: json.failReason ?? null })
    } finally {
      setStatusBusy(false)
    }
  }

  if (!open) return null

  const btn = "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const btnPrimary = "text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const unaudited = !!data?.unaudited

  const sectionLabel = "text-[11.5px] font-bold uppercase tracking-wide text-[var(--crm-text-secondary)]"
  const fieldLabel = "text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[800px] rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <SiTiktok size={16} className="text-[var(--crm-text-primary)]" aria-hidden />
          <h2 className="text-[14px] font-bold text-[var(--crm-text-primary)]">Post to TikTok</h2>
          <button type="button" aria-label="Close" className="ml-auto text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={onClose}>×</button>
        </div>

        {loading && <div className="mt-4 text-[12.5px] text-[var(--crm-text-muted)]">{rendering ? "Rendering video…" : "Loading TikTok account…"}</div>}
        {error && <div className="mt-3 text-[12.5px] text-amber-600 dark:text-amber-400">{error}</div>}

        {/* No current render → offer the safe render-only action (does NOT post to Instagram). */}
        {needsRender && !data && !loading && (
          <div className="mt-4 space-y-3">
            <div className="text-[12.5px] text-[var(--crm-text-secondary)]">This post hasn&apos;t been rendered yet. Render its video now to prepare the TikTok post — this only creates the video and does <span className="font-semibold">not</span> post to Instagram.</div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" className={btn} disabled={rendering} onClick={onClose}>Cancel</button>
              <button type="button" className={btnPrimary} disabled={rendering} onClick={() => void doRender()}>{rendering ? "Rendering…" : "Render video"}</button>
            </div>
          </div>
        )}

        {data && !result && (
          <div className="mt-3 flex flex-col gap-4">
            {/* Account — full width */}
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.creator.avatarUrl} alt="" width={32} height={32} className="rounded-full object-cover flex-none" style={{ width: 32, height: 32 }} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-[var(--crm-text-primary)] truncate">{data.creator.nickname}</div>
                <div className="text-[11.5px] text-[var(--crm-text-muted)] truncate">@{data.creator.username}</div>
              </div>
            </div>

            {/* Two columns on desktop: Post (caption) | TikTok Settings. Single column on mobile. */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5">
              {/* LEFT — Post */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className={sectionLabel}>Post</span>
                <div>
                  <span className={fieldLabel}>Caption</span>
                  <textarea readOnly value={data.title} rows={16} className="mt-1 w-full min-h-[300px] text-[12.5px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-2 resize-none" />
                  <div className="text-[10.5px] text-[var(--crm-text-muted)] mt-0.5">{data.titleLength}/2200</div>
                </div>
              </div>

              {/* RIGHT — TikTok Settings */}
              <div className="flex flex-col gap-4 min-w-0 md:border-l md:border-[var(--crm-border)] md:pl-5">
                <span className={sectionLabel}>TikTok Settings</span>

                {/* Privacy — options come ONLY from Creator Info */}
                <div>
                  <span className={fieldLabel}>Privacy</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {data.capabilities.privacyLevelOptions.map((opt) => {
                      const blocked = unaudited && opt !== "SELF_ONLY"
                      return (
                        <label key={opt} className={`flex items-center gap-2 text-[12.5px] ${blocked ? "opacity-45" : "text-[var(--crm-text-primary)]"}`}>
                          <input type="radio" name="tt-privacy" value={opt} checked={privacy === opt} disabled={blocked} onChange={() => setPrivacy(opt)} />
                          {PRIVACY_LABEL[opt] ?? opt}
                          {blocked && <span className="text-[10.5px] text-[var(--crm-text-muted)]">(Sandbox: private only)</span>}
                        </label>
                      )
                    })}
                  </div>
                  {!privacy && <div className="mt-1 text-[10.5px] text-[var(--crm-text-muted)]">Select a privacy option.</div>}
                </div>

                {/* Content disclosure — TikTok's Commercial Content Disclosure, off by default. */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className={fieldLabel}>Content disclosure</span>
                    <Switch
                      checked={disclosureOn}
                      label="Content disclosure"
                      onChange={(on) => {
                        setDisclosureOn(on)
                        if (!on) { setYourBrand(false); setBrandedContent(false) }
                      }}
                    />
                  </div>
                  <p className="text-[11.5px] text-[var(--crm-text-secondary)]">Let people know if this post promotes a brand, product, or service.</p>

                  {disclosureOn && (
                    <div className="mt-0.5 flex flex-col gap-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] p-2.5">
                      <label className="flex items-start gap-2 text-[12.5px] text-[var(--crm-text-primary)]">
                        <input type="checkbox" className="mt-0.5" checked={yourBrand} onChange={(e) => setYourBrand(e.target.checked)} />
                        <span>
                          <span className="font-semibold">Your Brand</span>
                          <span className="block text-[11.5px] text-[var(--crm-text-secondary)]">You&apos;re promoting yourself or your own business.</span>
                          {yourBrand && <span className="block text-[10.5px] text-[var(--crm-text-muted)] mt-0.5">Your video will be labeled as &quot;Promotional content.&quot;</span>}
                        </span>
                      </label>
                      <label className={`flex items-start gap-2 text-[12.5px] ${brandedContentBlocked ? "opacity-45" : "text-[var(--crm-text-primary)]"}`}>
                        <input type="checkbox" className="mt-0.5" checked={brandedContent} disabled={brandedContentBlocked} onChange={(e) => setBrandedContent(e.target.checked)} />
                        <span>
                          <span className="font-semibold">Branded Content</span>
                          <span className="block text-[11.5px] text-[var(--crm-text-secondary)]">You&apos;re promoting another brand or a third party.</span>
                          {brandedContent && !brandedContentBlocked && <span className="block text-[10.5px] text-[var(--crm-text-muted)] mt-0.5">Your video will be labeled as &quot;Paid partnership.&quot;</span>}
                          {brandedContentBlocked && <span className="block text-[10.5px] text-[var(--crm-text-muted)] mt-0.5">Branded content visibility cannot be set to private.</span>}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Interactions — only when the creator permits them */}
                <div className="flex flex-col gap-1">
                  <span className={fieldLabel}>Interactions</span>
                  {data.capabilities.commentDisabled ? (
                    <span className="text-[11.5px] text-[var(--crm-text-muted)]">Comments off (creator setting)</span>
                  ) : (
                    <label className="flex items-center gap-2 text-[12.5px] text-[var(--crm-text-primary)]"><input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} /> Allow comments</label>
                  )}
                  {data.capabilities.duetDisabled ? (
                    <span className="text-[11.5px] text-[var(--crm-text-muted)]">Duet off (creator setting)</span>
                  ) : (
                    <label className="flex items-center gap-2 text-[12.5px] text-[var(--crm-text-primary)]"><input type="checkbox" checked={allowDuet} onChange={(e) => setAllowDuet(e.target.checked)} /> Allow Duet</label>
                  )}
                  {data.capabilities.stitchDisabled ? (
                    <span className="text-[11.5px] text-[var(--crm-text-muted)]">Stitch off (creator setting)</span>
                  ) : (
                    <label className="flex items-center gap-2 text-[12.5px] text-[var(--crm-text-primary)]"><input type="checkbox" checked={allowStitch} onChange={(e) => setAllowStitch(e.target.checked)} /> Allow Stitch</label>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom — full width: status, consent, validation, actions */}
            <div className="flex flex-col gap-2 border-t border-[var(--crm-border)] pt-3">
              <div className="text-[11px] text-[var(--crm-text-muted)]">Video ready · {fmtBytes(data.videoSize)} · {data.transferMethod}</div>

              {/* Consent declaration — immediately above the final Post button. */}
              <div className="text-[10.5px] text-[var(--crm-text-muted)]">
                {brandedContent
                  ? "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation."
                  : "By posting, you agree to TikTok's Music Usage Confirmation."}
              </div>

              {disclosureIncomplete && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400">You need to indicate if your content promotes yourself, a third party, or both.</div>
              )}
              {!disclosureIncomplete && !privacy && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400">Select a privacy option before posting.</div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" className={btn} onClick={onClose}>Cancel</button>
                <button type="button" className={btnPrimary} disabled={posting || postBlocked} onClick={() => void doPost()}>{posting ? "Posting…" : "Post to TikTok"}</button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Direct Post submitted</div>
            <div className="text-[12.5px] text-[var(--crm-text-secondary)]">Status: <span className="font-semibold">{result.status}</span>{result.failReason ? ` · ${result.failReason}` : ""}</div>
            <div className="text-[11px] text-[var(--crm-text-muted)] font-mono break-all">publish_id: {result.publishId}</div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" className={btn} disabled={statusBusy} onClick={() => void checkStatus()}>{statusBusy ? "Checking…" : "Check status"}</button>
              <button type="button" className={btnPrimary} onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
