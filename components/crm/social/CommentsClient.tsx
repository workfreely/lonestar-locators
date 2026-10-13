"use client"

import { useMemo, useState } from "react"
import { SiInstagram, SiTiktok } from "react-icons/si"
import { APPROVED_DM_BODY, APPROVED_PUBLIC_FALLBACK } from "@/lib/social/commentKeywords"
import { resolveProfileUrl } from "@/lib/social/commentIdentity"

// Social Beast → Comments. Three views behind one tab: Inbox, Reply Bank, Automation.
//
// PHASE 2 IS A SURFACE, NOT A SENDER. Nothing here calls Instagram. Every control that would cause
// a message is inert and says so, because the permissions it needs have not been requested yet.

export type AccountRow = { id: string; provider: string; username: string | null; status: string | null }
export type RuleRow = {
  id: string
  keyword: string
  property_type: string | null
  enabled: boolean
  comment_reply_variants: { id: string; body: string; claims_dm: boolean }[]
}
export type CommentRow = {
  id: string
  provider: string
  body: string | null
  author_username: string | null
  permalink: string | null
  commented_at: string | null
  matched_keyword: string | null
  hold_reason: string | null
  external_media_id: string | null
  social_commenters: { provider_user_id: string; username: string | null; profile_url: string | null; dm_sent_at: string | null } | null
  comment_actions: { kind: string; status: string; reason: string | null }[]
  social_posts: { post_name: string | null } | null
}

const card = "rounded-xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4"
const label = "text-[10.5px] font-semibold uppercase tracking-[.06em] text-[var(--crm-text-muted)]"
const pill = "inline-block text-[10px] font-bold px-2 py-[2px] rounded-full whitespace-nowrap"

function ago(iso: string | null): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return "—"
  const m = Math.floor(ms / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}

/**
 * What happened to this comment, as one readable outcome.
 *
 * Reads the ACTION LEDGER rather than inferring from the comment. A skip shows its reason, so
 * "nothing happened" is always explained — most importantly `no_stable_id`, which is the honest
 * case where we could not identify the person well enough to message them safely.
 */
function outcomeOf(c: CommentRow): { text: string; tone: string } {
  const dm = c.comment_actions?.find((a) => a.kind === "private_reply")
  const pub = c.comment_actions?.find((a) => a.kind === "public_reply")
  const bad = "bg-[color-mix(in_srgb,var(--crm-danger)_16%,transparent)] text-[var(--crm-danger)]"
  const warn = "bg-[color-mix(in_srgb,#d9a441_18%,transparent)] text-[#d9a441]"
  const good = "bg-[color-mix(in_srgb,var(--crm-accent)_16%,transparent)] text-[var(--crm-accent)]"
  const mute = "bg-[var(--crm-card)] text-[var(--crm-text-muted)]"

  if (dm?.status === "uncertain" || pub?.status === "uncertain") return { text: "uncertain — review", tone: warn }
  if (dm?.status === "failed" || pub?.status === "failed") return { text: "failed", tone: bad }
  if (dm?.status === "sent" && pub?.status === "sent") return { text: "DM + public reply", tone: good }
  if (dm?.status === "sent") return { text: "DM sent", tone: good }
  if (pub?.status === "sent") return { text: "public reply", tone: good }
  // A held comment is awaiting a human — shown before any action reason, because the hold is why
  // no action exists.
  if (c.hold_reason) return { text: `held — ${c.hold_reason.replace(/_/g, " ")}`, tone: warn }
  if (dm?.reason === "no_stable_id") return { text: "no stable ID — no DM", tone: warn }
  if (dm?.reason === "already_messaged") return { text: "already messaged", tone: mute }
  if (dm?.reason === "own_account") return { text: "own account — skipped", tone: mute }
  if (!c.matched_keyword) return { text: "no match", tone: mute }
  return { text: "no action", tone: mute }
}

export default function CommentsClient({
  accounts, rules, rulesArePreview, comments, globalEnabled,
}: {
  accounts: AccountRow[]
  rules: RuleRow[]
  rulesArePreview: boolean
  comments: CommentRow[]
  globalEnabled: boolean
}) {
  const [view, setView] = useState<"inbox" | "rules" | "automation">("inbox")

  const ig = accounts.find((a) => a.provider === "instagram") ?? null
  const tt = accounts.find((a) => a.provider === "tiktok") ?? null

  // Returning commenters — only resolvable when a stable provider id exists, which is the same
  // condition that makes someone DM-eligible. Keyed on that id, never on the username.
  const historyCount = useMemo(() => {
    const byPerson = new Map<string, number>()
    for (const c of comments) {
      const id = c.social_commenters?.provider_user_id
      if (id) byPerson.set(id, (byPerson.get(id) ?? 0) + 1)
    }
    return byPerson
  }, [comments])

  const tab = (id: typeof view, text: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={
        "text-[12px] font-semibold px-3 py-[6px] rounded-full border transition-colors " +
        (view === id
          ? "border-[var(--crm-text-muted)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"
          : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]")
      }
    >
      {text}
    </button>
  )

  return (
    <div>
      <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[12.5px] text-[var(--crm-text-secondary)]">
        <b className="text-[var(--crm-text-primary)]">Automation is off.</b>{" "}
        Comment permissions have not been requested yet, so nothing is collected, replied to or messaged. This tab is
        here to review the rules before any of that is turned on.
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {tab("inbox", "Inbox")}
        {tab("rules", "Reply Bank")}
        {tab("automation", "Automation")}
      </div>

      {view === "inbox" && (
        <div className={card}>
          <div className={label}>Inbox</div>
          <p className="text-[12px] text-[var(--crm-text-muted)] mt-1 mb-3">
            Comments on your connected accounts, newest first. Outcome comes from the action ledger, so a skip always
            shows why.
          </p>
          {comments.length === 0 ? (
            <div className="text-[12.5px] text-[var(--crm-text-muted)] py-8 text-center">
              No comments collected yet. They appear here once comment permissions are granted and polling is enabled.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {["", "Commenter", "Comment", "Post", "Match", "Outcome", "When", ""].map((h, i) => (
                      <th key={i} className={`${label} text-left px-2 pb-2 whitespace-nowrap`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comments.map((c) => {
                    const person = c.social_commenters
                    // Provider URL first; a constructed one only from a handle we consider safe.
                    const href = resolveProfileUrl(c.provider, {
                      username: person?.username ?? c.author_username,
                      profileUrl: person?.profile_url ?? null,
                    })
                    const name = person?.username ?? c.author_username ?? "—"
                    const seen = person?.provider_user_id ? historyCount.get(person.provider_user_id) ?? 1 : 0
                    const outcome = outcomeOf(c)
                    return (
                      <tr key={c.id} className="border-t border-[var(--crm-border)]">
                        <td className="px-2 py-2 align-top">
                          {c.provider === "tiktok" ? <SiTiktok size={13} aria-label="TikTok" /> : <SiInstagram size={13} aria-label="Instagram" />}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {/* A profile we could not resolve is shown as INERT TEXT. Opening the
                              wrong person's account is worse than offering no link at all. */}
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--crm-accent)] hover:underline">
                              {name}
                            </a>
                          ) : (
                            <span className="font-semibold text-[var(--crm-text-primary)]" title="No reliable profile link for this commenter">
                              {name}
                            </span>
                          )}
                          {seen > 1 && (
                            <span className="block text-[10.5px] text-[var(--crm-text-muted)]">{seen} comments</span>
                          )}
                        </td>
                        <td className="px-2 py-2 align-top text-[var(--crm-text-secondary)]">{c.body ?? "—"}</td>
                        <td className="px-2 py-2 align-top text-[var(--crm-text-muted)] whitespace-nowrap">
                          {c.social_posts?.post_name ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {c.matched_keyword ? (
                            <code className="text-[11px] rounded border border-[var(--crm-border)] bg-[var(--crm-card)] px-1.5 py-[1px]">
                              {c.matched_keyword}
                            </code>
                          ) : (
                            <span className="text-[var(--crm-text-muted)]">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span className={`${pill} ${outcome.tone}`}>{outcome.text}</span>
                        </td>
                        <td className="px-2 py-2 align-top text-[var(--crm-text-muted)] whitespace-nowrap tabular-nums">{ago(c.commented_at)}</td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">
                          {href && (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--crm-accent)] mr-2.5">Open Profile</a>
                          )}
                          {/* Only offered when the platform actually gave us a permalink. */}
                          {c.permalink && (
                            <a href={c.permalink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--crm-accent)]">View Comment</a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "rules" && (
        <div className={card}>
          <div className={label}>Reply Bank</div>
          <p className="text-[12px] text-[var(--crm-text-muted)] mt-1 mb-3">
            {rulesArePreview
              ? "Preview of the approved keyword set — not yet saved. Matching is case-insensitive, punctuation-tolerant and whole-word only; exactly one rule fires per comment."
              : "Keyword → property interest → public reply variations. Exactly one rule fires per comment."}
          </p>
          <div>
            {rules.map((r) => (
              <div key={r.id} className="grid grid-cols-[130px_1fr_80px] gap-3 py-2.5 border-t border-[var(--crm-border)] first:border-t-0 max-[700px]:grid-cols-1">
                <div>
                  <code className="text-[11px] rounded border border-[var(--crm-border)] bg-[var(--crm-card)] px-1.5 py-[1px]">{r.keyword}</code>
                  <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-1">{r.property_type ?? "general interest"}</div>
                </div>
                <div className="text-[12px] text-[var(--crm-text-secondary)]">
                  {r.comment_reply_variants.length === 0
                    ? <span className="text-[var(--crm-text-muted)]">No variations configured yet.</span>
                    : r.comment_reply_variants.map((v) => <div key={v.id}>{v.body}</div>)}
                </div>
                <div className="text-[11.5px] text-[var(--crm-text-muted)]">{r.enabled ? "On" : "Off"}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--crm-border)]">
            <div className={label}>Private message</div>
            <p className="text-[12px] text-[var(--crm-text-muted)] mt-1 mb-2">Approved wording. Sent at most once per person, per connected account.</p>
            <div className="rounded-lg border border-[var(--crm-border)] border-l-2 border-l-[var(--crm-accent)] bg-[var(--crm-card)] px-3 py-2.5 text-[12.5px] text-[var(--crm-text-primary)]">
              {APPROVED_DM_BODY}
              <div className="text-[var(--crm-accent)] mt-2 break-all">locatorbeast.com/&lt;you&gt;/ig?utm_medium=comment&amp;utm_content=&lt;KEYWORD&gt;</div>
            </div>
            <div className={`${label} mt-3`}>Public reply when no DM was sent</div>
            <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2.5 text-[12.5px] text-[var(--crm-text-secondary)] mt-1">
              {APPROVED_PUBLIC_FALLBACK}
            </div>
          </div>
        </div>
      )}

      {view === "automation" && (
        <div className={card}>
          <div className={label}>Automation</div>
          <p className="text-[12px] text-[var(--crm-text-muted)] mt-1 mb-3">
            Every switch defaults off, and the stricter one always wins.
          </p>
          {[
            ["Global auto replies", globalEnabled ? "On" : "Off"],
            [`Instagram${ig?.username ? ` — @${ig.username}` : ""}`, ig ? "Off" : "Not connected"],
            [`TikTok${tt?.username ? ` — ${tt.username}` : ""}`, "Unavailable — Business API"],
            ["Read comments", "Permission needed"],
            ["Public reply permission", "Permission needed"],
            ["Private reply (DM) permission", "Permission needed"],
            ["Like a comment", "Not offered by Instagram"],
            ["Process comments from", "After activation only"],
            ["Maximum comment age", "24 hours"],
            ["Automatic public replies", "Off — optional, separate from the DM"],
            ["Public reply cooldown", "24 hours per person"],
            ["Held for manual review", "Hostile · spam · negative context · nested replies"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-[7px] border-t border-[var(--crm-border)] first:border-t-0 text-[12.5px]">
              <span className="text-[var(--crm-text-primary)]">{k}</span>
              <span className="text-[var(--crm-text-muted)] text-right">{v}</span>
            </div>
          ))}
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-3">
            A private message is sent at most once per person per connected account, and only when the platform
            returns a stable user ID. Without one, the commenter gets the public reply instead — a username is not a
            reliable identity. Switching automation on stamps an activation time and only comments newer than it are
            ever processed, so turning this on cannot answer a backlog. A send whose outcome could not be established
            is held, never retried.
          </p>
        </div>
      )}
    </div>
  )
}
