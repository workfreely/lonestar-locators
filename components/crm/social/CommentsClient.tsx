"use client"

import { useMemo, useState } from "react"
import { SiInstagram, SiTiktok } from "react-icons/si"
import { APPROVED_DM_BODY, APPROVED_PUBLIC_FALLBACK } from "@/lib/social/commentKeywords"
import { resolveProfileUrl } from "@/lib/social/commentIdentity"

// Social Beast → Comments. Three views behind one tab: Inbox, Reply Bank, Automation.
//
// PHASE 2 IS A SURFACE, NOT A SENDER. Nothing here calls Instagram. Every control that would cause
// a message is inert and says so, because the permissions it needs have not been requested yet.

// `scopes` is what the Instagram permission line is derived from. It was previously hardcoded to
// "Permissions needed", which was true then and would have stayed wrong after the grant.
export type AccountRow = { id: string; provider: string; username: string | null; status: string | null; scopes?: string[] | null }
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
export function outcomeOf(c: CommentRow): { text: string; tone: string; hint?: string } {
  const dm = c.comment_actions?.find((a) => a.kind === "private_reply")
  const pub = c.comment_actions?.find((a) => a.kind === "public_reply")
  const bad = "bg-[color-mix(in_srgb,var(--crm-danger)_16%,transparent)] text-[var(--crm-danger)]"
  const warn = "bg-[color-mix(in_srgb,#d9a441_18%,transparent)] text-[#d9a441]"
  const good = "bg-[color-mix(in_srgb,var(--crm-accent)_16%,transparent)] text-[var(--crm-accent)]"
  const mute = "bg-[var(--crm-card)] text-[var(--crm-text-muted)]"

  // ── WHAT ACTUALLY HAPPENED, BOTH LEGS AT ONCE ───────────────────────────────────────────
  // This used to test `failed` on either leg before asking whether the other had succeeded, so a
  // refused DM followed by a correctly-posted bio-link reply collapsed to a bare "failed". That is
  // the fallback WORKING, and the label said nothing happened — which is how a healthy system gets
  // mistaken for a broken one. Every combination now reads as itself, and a partial success says
  // which part succeeded.
  //
  // Order: uncertain first (it is the only state a human must resolve, because an uncertain DM is
  // never retried), then the mixed outcomes, then the clean ones.
  if (dm?.status === "uncertain" || pub?.status === "uncertain") {
    return {
      text: pub?.status === "sent" ? "DM uncertain · public reply sent" : "uncertain — review",
      tone: warn,
      hint: "An uncertain send is never retried automatically, because it may already have been delivered.",
    }
  }
  if (dm?.status === "failed" && pub?.status === "sent") {
    return {
      text: "DM failed · public reply sent",
      tone: warn,
      hint: "The private message was refused, so the public reply used link-in-bio wording and claimed no DM.",
    }
  }
  if (dm?.status === "failed" && pub?.status === "failed") return { text: "both failed", tone: bad }
  if (dm?.status === "sent" && pub?.status === "failed") {
    return { text: "DM sent · public reply failed", tone: warn }
  }
  if (dm?.status === "failed" || pub?.status === "failed") return { text: "failed", tone: bad }
  if (dm?.status === "sent" && pub?.status === "sent") return { text: "DM + public reply", tone: good }
  if (dm?.status === "sent") return { text: "DM sent", tone: good }
  // A public reply with no DM leg of its own: skipped, or never attempted. Named so it does not
  // read as a full success when half the intended response did not happen.
  if (pub?.status === "sent") {
    return {
      text: dm?.status === "skipped" ? "public reply only" : "public reply",
      tone: good,
      hint: dm?.status === "skipped" ? `No private message: ${(dm.reason ?? "skipped").replace(/_/g, " ")}.` : undefined,
    }
  }
  // A held comment is awaiting a human — shown before any action reason, because the hold is why
  // no action exists.
  if (c.hold_reason) return { text: `held — ${c.hold_reason.replace(/_/g, " ")}`, tone: warn }
  if (dm?.reason === "no_stable_id") {
    return {
      text: "not messaged",
      tone: warn,
      hint: "Instagram did not return a verified profile for this commenter, so no private message was sent.",
    }
  }
  if (dm?.reason === "already_messaged") return { text: "already messaged", tone: mute }
  if (dm?.reason === "own_account") return { text: "own account — skipped", tone: mute }
  if (!c.matched_keyword) return { text: "no match", tone: mute }
  return { text: "no action", tone: mute }
}

/** Minutes as the operator thinks of them. Exact hours read as hours; anything else stays minutes
 *  rather than being rounded into a figure that looks like a configured value and is not. */
function formatAge(minutes: number | null, unreadable: boolean): string {
  if (unreadable) return "Unknown"
  if (minutes === null) return "Not set"
  if (minutes % 1440 === 0) { const d = minutes / 1440; return d === 1 ? "24 hours" : `${d} days` }
  if (minutes % 60 === 0) { const h = minutes / 60; return h === 1 ? "1 hour" : `${h} hours` }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`
}

type AutomationStatus = { text: string; tone: string; dot: string }

/**
 * What the status pill says. Every gate has to agree before this may claim the system is live,
 * because any single one being off means nothing reaches Instagram.
 *
 * The three states are deliberately distinct. "Unknown" is not "off": a setting we could not read
 * is a fault to investigate, and printing a confident "off" would hide it. "Dry run" is not "off"
 * either — detection and logging are running, which is exactly what an operator needs to see
 * before arming. Only all-gates-open earns "live".
 */
export function automationStatus(input: {
  globalEnabled: boolean
  globalUnreadable: boolean
  accountEnabled: boolean
  accountSettingsUnreadable: boolean
  hasCommentsScope: boolean
  sendingEnabled: boolean
}): AutomationStatus {
  const muted = { tone: "text-[var(--crm-text-muted)]", dot: "bg-[var(--crm-text-muted)]" }
  if (input.globalUnreadable || input.accountSettingsUnreadable) {
    return { text: "Automation unknown", ...muted }
  }
  const armed = input.globalEnabled && input.accountEnabled && input.hasCommentsScope
  if (!armed) return { text: "Automation off", ...muted }
  if (!input.sendingEnabled) {
    return { text: "Automation on · dry run", tone: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" }
  }
  return { text: "Automation live", tone: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" }
}

export default function CommentsClient({
  accounts, rules, rulesArePreview, comments, globalEnabled, globalUnreadable = false, sendingEnabled = false,
  accountEnabled = false, publicRepliesEnabled = false, maxCommentAgeMinutes = null,
  accountSettingsUnreadable = false,
}: {
  accounts: AccountRow[]
  rules: RuleRow[]
  rulesArePreview: boolean
  comments: CommentRow[]
  globalEnabled: boolean
  /** The setting could not be READ — distinct from it being off. Both are not-enabled; only one
   *  is a fault, and saying "Off" when we do not know would be a confidence we have not earned. */
  globalUnreadable?: boolean
  /** SOCIAL_COMMENT_SEND_ENABLED, read server-side. The switch that decides whether anything
   *  actually reaches Meta — separate from every database toggle. */
  sendingEnabled?: boolean
  /** comment_account_settings.enabled for the Instagram connection. */
  accountEnabled?: boolean
  /** comment_account_settings.public_replies_enabled. Was once printed as a literal "Off". */
  publicRepliesEnabled?: boolean
  /** comment_account_settings.max_comment_age_minutes. Null when unknown. */
  maxCommentAgeMinutes?: number | null
  /** The per-account settings could not be READ — distinct from their being off. */
  accountSettingsUnreadable?: boolean
}) {
  const [view, setView] = useState<"inbox" | "rules" | "automation">("inbox")

  const ig = accounts.find((a) => a.provider === "instagram") ?? null
  const automation = automationStatus({
    globalEnabled,
    globalUnreadable,
    accountEnabled,
    accountSettingsUnreadable,
    hasCommentsScope: (ig?.scopes ?? []).includes("instagram_business_manage_comments"),
    sendingEnabled,
  })
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

  // True when no rule has a saved variation — the repeated per-row notice collapses into one line.
  const noVariations = rules.length > 0 && rules.every((r) => r.comment_reply_variants.length === 0)

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
      {/* The state is shown as a small persistent status, not a banner. It stays truthful without
          explaining itself: the Automation view carries the detail. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {tab("inbox", "Inbox")}
          {tab("rules", "Reply Bank")}
          {tab("automation", "Automation")}
        </div>
        {/* THE STATUS PILL ANSWERS ONE QUESTION: can this send right now? It was a literal
            "Automation off", which survived the switches being armed and told the operator the
            opposite of the truth while live DMs were going out. It now derives from every gate
            that has to agree — the workspace switch, the account switch, the comments scope and
            SOCIAL_COMMENT_SEND_ENABLED — because any one of them being off means nothing sends.
            "Unknown" is its own state: a setting we could not read must never render as "off". */}
        <span className={`inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap ${automation.tone}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${automation.dot}`} aria-hidden="true" />
          {automation.text}
        </span>
      </div>

      {view === "inbox" && (
        <div className={card}>
          <div className={`${label} mb-3`}>Inbox</div>
          {comments.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-[13px] font-semibold text-[var(--crm-text-secondary)]">No comments yet</div>
              <div className="text-[12px] text-[var(--crm-text-muted)] mt-1">Comments will appear here once connected.</div>
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
                          <div className="flex items-start gap-2">
                          {/* INITIAL-LETTER AVATAR, not a photo. Instagram's comment payload gives
                              a username and an id and no profile picture for an ordinary
                              commenter, and profile_url is a PROFILE PAGE rather than an image —
                              rendering it in an <img> would show a broken frame on every row.
                              A letter is derived from data we already hold, so it cannot 404,
                              cannot leak a third party's photo, and needs no extra API call. */}
                          <span aria-hidden
                                className="mt-[1px] flex-none grid place-items-center rounded-full
                                           w-[22px] h-[22px] text-[10.5px] font-bold
                                           bg-[var(--crm-card)] border border-[var(--crm-border)]
                                           text-[var(--crm-text-secondary)]">
                            {(name.replace(/^@/, "").trim()[0] ?? "?").toUpperCase()}
                          </span>
                          <div className="min-w-0">
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
                          </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top text-[var(--crm-text-secondary)]">{c.body ?? "—"}</td>
                        <td className="px-2 py-2 align-top text-[var(--crm-text-muted)] whitespace-nowrap">
                          {/* THREE CASES, AND THE THIRD IS THE COMMON ONE.
                              A Social Beast post is named. Otherwise the comment is on media we
                              did not publish, so there is no post to name — we show what we
                              actually hold: the permalink if Instagram gave us one, else a
                              shortened media id. Never a guessed match: `post_id` is NULL on
                              every imported comment and inferring one from a timestamp or a
                              caption would attach a real comment to the wrong post. */}
                          {c.social_posts?.post_name ? (
                            c.social_posts.post_name
                          ) : c.permalink ? (
                            <a href={c.permalink} target="_blank" rel="noopener noreferrer"
                               className="text-[11px] text-[var(--crm-accent)] hover:underline">
                              View post
                            </a>
                          ) : c.external_media_id ? (
                            <span className="text-[11px] text-[var(--crm-text-muted)] font-mono"
                                  title={`Instagram media ${c.external_media_id} — not published through Social Beast`}>
                              …{c.external_media_id.slice(-6)}
                            </span>
                          ) : (
                            <span className="text-[var(--crm-text-muted)]">—</span>
                          )}
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
                          <span className={`${pill} ${outcome.tone}`} title={outcome.hint}>{outcome.text}</span>
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className={label}>Reply Bank</div>
            {rulesArePreview && (
              <span className={`${pill} border border-[var(--crm-border)] text-[var(--crm-text-muted)]`}>Preview — not saved</span>
            )}
          </div>
          {/* An enabled rule and live automation are different things, and the distinction has to be
              unmistakable: every rule below reads "Enabled" while nothing sends. */}
          <p className="text-[12px] text-[var(--crm-text-muted)] mt-1 mb-3">
            Enabled rules do not send while automation is off.
          </p>
          <div>
            {rules.map((r) => (
              <div key={r.id} className="grid grid-cols-[130px_1fr_80px] gap-3 py-2.5 border-t border-[var(--crm-border)] first:border-t-0 max-[700px]:grid-cols-1">
                <div>
                  <code className="text-[11px] rounded border border-[var(--crm-border)] bg-[var(--crm-card)] px-1.5 py-[1px]">{r.keyword}</code>
                  <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-1">{r.property_type ?? "general interest"}</div>
                </div>
                <div className="text-[12px] text-[var(--crm-text-secondary)]">
                  {/* The empty case is stated ONCE, under the list, rather than on every row. */}
                  {r.comment_reply_variants.length === 0
                    ? <span className="text-[var(--crm-text-muted)]">—</span>
                    : r.comment_reply_variants.map((v) => <div key={v.id}>{v.body}</div>)}
                </div>
                <div className="text-[11.5px] text-[var(--crm-text-muted)]">{r.enabled ? "Enabled" : "Disabled"}</div>
              </div>
            ))}
          </div>
          {noVariations && (
            <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-2">No reply variations saved yet.</p>
          )}

          <div className="mt-4 pt-3 border-t border-[var(--crm-border)]">
            <div className={label}>Private message</div>
            <p className="text-[12px] text-[var(--crm-text-muted)] mt-1 mb-2">Approved wording.</p>
            <div className="rounded-lg border border-[var(--crm-border)] border-l-2 border-l-[var(--crm-accent)] bg-[var(--crm-card)] px-3 py-2.5 text-[12.5px] text-[var(--crm-text-primary)]">
              {APPROVED_DM_BODY}
              <div className="text-[var(--crm-accent)] mt-2 break-all">locatorbeast.com/&lt;you&gt;/ig</div>
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
          <div className={`${label} mb-3`}>Automation</div>

          {/* MASTER STATUS, NOT A SWITCH. There is deliberately no toggle here: arming comment
              automation also requires an environment gate and a per-account activation stamp, so a
              control that looked like the whole answer would promise more than it delivers. The
              underlying gate (accountAutomationGate) stays fail-closed regardless of what this
              renders. The value is now READ rather than hardcoded. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-3">
            <div>
              <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Auto Replies</div>
              <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-[2px]">
                {globalUnreadable
                  ? "The setting could not be read, so auto replies are treated as off."
                  : globalEnabled
                    ? "Switched on for this workspace. Each account also has to be enabled."
                    : "Switched off for this workspace."}
              </div>
            </div>
            <span className={`${pill} border border-[var(--crm-border)] ${globalEnabled && !globalUnreadable ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--crm-text-muted)]"}`}>
              {globalUnreadable ? "Unknown" : globalEnabled ? "On" : "Off"}
            </span>
          </div>

          {/* SENDING — the switch that actually decides, shown beside the one that does not.
              Every row above can read "Enabled" while SOCIAL_COMMENT_SEND_ENABLED keeps the
              senders inert; without this an operator has no way to tell an armed system from a
              dry run, and would reasonably conclude replies were going out when none were. */}
          <div className="flex items-center justify-between gap-3 py-2.5 border-t border-[var(--crm-border)]">
            <div>
              <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Sending</div>
              <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-[2px]">
                {sendingEnabled
                  ? "Replies and messages can reach Instagram."
                  : "Nothing reaches Instagram. Matches are detected and logged, but every send is skipped."}
              </div>
            </div>
            <span className={`${pill} border border-[var(--crm-border)] ${sendingEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--crm-text-muted)]"}`}>
              {sendingEnabled ? "Live" : "Dry run"}
            </span>
          </div>

          <div className={`${label} mt-4 mb-1`}>Accounts</div>
          <div className="flex items-center justify-between gap-3 py-[7px] border-t border-[var(--crm-border)] text-[12.5px]">
            <span className="inline-flex items-center gap-2 text-[var(--crm-text-primary)]">
              <SiInstagram size={13} aria-hidden="true" />
              {ig?.username ? `@${ig.username}` : "Instagram"}
            </span>
            {/* DERIVED, NOT ASSUMED. Previously a hardcoded "Permissions needed". */}
            <span
              className="text-[var(--crm-text-muted)] text-right"
              title={
                !ig
                  ? undefined
                  : (ig.scopes ?? []).includes("instagram_business_manage_comments")
                    ? "Comment access is granted for this account."
                    : "Comment access has not been granted for this account yet — re-authorize from Accounts."
              }
            >
              {!ig
                ? "Not connected"
                : (ig.scopes ?? []).includes("instagram_business_manage_comments")
                  ? "Permission granted"
                  : "Permission needed"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 py-[7px] border-t border-[var(--crm-border)] text-[12.5px]">
            <span className="inline-flex items-center gap-2 text-[var(--crm-text-primary)]">
              <SiTiktok size={13} aria-hidden="true" />
              {tt?.username ?? "TikTok"}
            </span>
            <span className="text-[var(--crm-text-muted)] text-right" title="TikTok does not offer comment replies on this API.">
              Unavailable
            </span>
          </div>

          <div className={`${label} mt-4 mb-1`}>Settings</div>
          {[
            ["Automatic public replies", accountSettingsUnreadable ? "Unknown" : publicRepliesEnabled ? "On" : "Off"],
            ["Maximum comment age", formatAge(maxCommentAgeMinutes, accountSettingsUnreadable)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-[7px] border-t border-[var(--crm-border)] text-[12.5px]">
              <span className="text-[var(--crm-text-primary)]">{k}</span>
              <span className="text-[var(--crm-text-muted)] text-right">{v}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
