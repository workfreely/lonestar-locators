// Social Beast — TWO INDEPENDENT CAPABILITIES PER CONNECTED ACCOUNT.
//
// One Instagram connection grants two unrelated abilities, and conflating them is the mistake this
// module exists to prevent: an account can be perfectly connected while publishing is paused and
// auto reply has no permission at all. "Connected" is a fact about the token, not a promise that
// anything is happening.
//
// PURE, AND THE UI'S ONLY SOURCE OF LABELS. The page computes these server-side and the component
// renders them. Nothing here reads a database or re-derives a rule: the auto-reply state comes
// straight from accountAutomationGate, which is already the one authority on whether comment
// automation may run, and is already covered by its own tests.

import type { AccountGate } from "@/lib/social/commentSafety"
import type { AutoPostingState } from "@/lib/social/autoPosting"

/** The pill. Deliberately small — five states the operator can act on, not a status taxonomy. */
export type CapabilityState = "active" | "paused" | "disabled" | "permission_needed" | "attention"

export type Capability = {
  state: CapabilityState
  /** The right-aligned pill. Two or three words — scannable down a column of accounts. */
  badge: string
  /** The line under the capability name. Always says what is true, never what is configured. */
  detail: string
}

/**
 * Instagram Publishing.
 *
 * ── THE REQUIREMENT THIS ENCODES ──────────────────────────────────────────────────────────
 * A connected account must NEVER read as "publishing is on". Posting needs THREE things to be
 * true, and the label names whichever one is false:
 *
 *   1. the connection is healthy            (status / expiry)
 *   2. the master Auto Posting switch is on (social_settings.auto_posting)
 *   3. this destination is not paused       (social_connections.posting_paused)
 *
 * So the happy label is "Auto posting on", and every other case says "Connected" plus the reason
 * nothing is being published. There is no branch that reports activity from connection alone.
 *
 * FAILS CLOSED. An unreadable master switch is reported as paused, matching
 * AUTO_POSTING_FALLBACK and the worker's own behaviour — the worker treats unreadable as paused,
 * so a UI that showed "on" would be lying about what the server will do.
 */
export function publishingCapability(input: {
  connectionStatus: string
  expired: boolean
  destinationPaused: boolean
  autoPosting: AutoPostingState
  autoPostingUnreadable?: boolean
  /** True when this destination publishes through Buffer — both buffer columns present. */
  bufferRouted?: boolean
}): Capability {
  // A BUFFER-ROUTED DESTINATION HOLDS NONE OF OUR TOKENS. Its publishing credential is the Buffer
  // API key in Vault, and sa_get_buffer_destination returns no token and no expiry at all. So
  // token_expires_at on such a row is a leftover from however it was first connected, and reading
  // it as "reconnect needed" would tell the operator to fix an account that publishes perfectly
  // well — which is exactly what both TikTok rows would have said, their native tokens having
  // expired on 2026-11-20. A Buffer channel that genuinely cannot publish reports itself through
  // isDisconnected / isLocked, which the worker already surfaces per publish.
  if (input.connectionStatus === "error" || (input.expired && !input.bufferRouted)) {
    return {
      state: "attention",
      badge: "Reconnect needed",
      detail: "Instagram authorization needs renewing",
    }
  }
  if (input.autoPostingUnreadable) {
    return {
      state: "paused",
      badge: "Paused",
      detail: "Connected · Auto posting setting unreadable, treated as paused",
    }
  }
  if (input.autoPosting !== "on") {
    return {
      state: "paused",
      badge: "Paused",
      detail: "Connected · Auto posting paused",
    }
  }
  if (input.destinationPaused) {
    return {
      state: "paused",
      badge: "Paused",
      detail: "Connected · This account paused",
    }
  }
  return {
    state: "active",
    badge: "Active",
    detail: "Connected · Auto posting on",
  }
}

/**
 * DOES THIS ACTION STILL WANT A HUMAN?
 *
 * The account badge used to count every `failed` or `uncertain` comment_action for ever, with no
 * notion of whether anyone could still act on one. Three private replies that Meta refused on
 * 21 Oct 2026 therefore pinned "Attention needed" permanently — while the capability that produced
 * them was switched off and they could not be retried, so there was nothing a person could do with
 * the warning except learn to ignore it. A warning nobody can act on teaches people to ignore the
 * ones they can.
 *
 * NOTHING IS HIDDEN AND NOTHING IS WRITTEN. Every row stays in comment_actions exactly as it is,
 * and the Comments screen still renders each one against its comment. This decides ONE thing: what
 * the account-level pill counts.
 *
 * THE RULE, and the reasoning behind each line:
 *
 *   public_reply, failed or uncertain   ALWAYS counts. Public replies work, they are the whole of
 *                                       automation now, and a failure is real work.
 *
 *   uncertain, either kind              ALWAYS counts, including while DMs are off. "Uncertain"
 *                                       means we do not know whether Meta delivered it. It may
 *                                       have been sent. That question does not stop mattering
 *                                       because a switch moved afterwards, and an uncertain send is
 *                                       never retried — these are exactly the rows that would
 *                                       otherwise sit invisible for ever.
 *
 *   private_reply, FAILED, DMs off      Does not count. Failed is a definite negative: nothing was
 *                                       delivered, and the idempotency check in commentRunner means
 *                                       it can never be attempted again. With dmGate off, no future
 *                                       attempt is possible either. There is no action available.
 *
 *   private_reply, FAILED, DMs on       Counts. Turning DMs back on makes the failures relevant
 *                                       again — they are evidence about a capability now in use.
 *
 * READ FROM THE LIVE GATE, not stored. `dmEnabled` comes from dmGate(process.env) at render time,
 * so setting SOCIAL_COMMENT_DM_ENABLED=true brings these rows back on the next page load with no
 * migration, no backfill and nothing to remember.
 *
 * This is deliberately NOT a "reviewed" flag. It answers "is this actionable?", which the system
 * already knows. Acknowledging a failure a person HAS looked at and accepted is a different
 * question, needs durable per-row state, and is not solved here.
 */
export function actionNeedsAttention(
  action: { kind?: string | null; status?: string | null },
  dmEnabled: boolean,
): boolean {
  const status = (action.status ?? "").trim()
  // Only these two ever reached the tally; anything else is not unresolved work.
  if (status !== "failed" && status !== "uncertain") return false
  if (status === "uncertain") return true
  return (action.kind ?? "").trim() !== "private_reply" || dmEnabled
}

/** Counts that mean a person should look, regardless of which switches are set. */
export type AutoReplyAttention = {
  /** comment_actions rows with status failed or uncertain. */
  unresolvedActions: number
  /** Commenters claimed for a DM whose outcome was never established. Never retried automatically. */
  danglingClaims: number
  /**
   * The most common classified reason among those unresolved actions, for the detail line.
   *
   * SAFE BY CONSTRUCTION: this is our own classification vocabulary (permission, rate_limited,
   * rejected, outside_window, transport_error…), never Meta's message. The ledger now appends
   * numeric codes to the stored string, so this is read from the leading word only and no code,
   * token or provider text can reach the UI through it.
   */
  topReason?: string | null
}

/**
 * Instagram Auto Reply.
 *
 * A RENDERER FOR accountAutomationGate, NOT A SECOND OPINION. The gate already decides this, and
 * its reasons map one-to-one onto the states below. Re-deriving them here would create two
 * authorities that could disagree — and the one the operator reads would be the one that is wrong.
 *
 * ── THE ORDER, AND WHY ────────────────────────────────────────────────────────────────────
 *   1. unknown_state    the settings could not be read, so we do not know anything. Most severe.
 *   2. not_authorized   the blocking, actionable problem: the scope is missing. One click fixes it.
 *   3. unresolved work  something already happened that needs a human — surfaced even when the
 *                       switches are off, because an uncertain send is never retried and would
 *                       otherwise sit invisible for ever.
 *   4. ok               genuinely live.
 *   5. everything else  the switches are simply off.
 *
 * The attention counts are ALSO appended to `detail` in cases 2 and 4, so a pill that has to show
 * the more urgent thing does not hide the other one.
 */
export function autoReplyCapability(
  gate: AccountGate,
  attention: AutoReplyAttention = { unresolvedActions: 0, danglingClaims: 0 },
): Capability {
  const needsEyes = attention.unresolvedActions > 0 || attention.danglingClaims > 0
  // "2 action(s) ... need review" said that something needed looking at but not what, so every
  // cause looked alike — a dead token and a refused permission read identically. The classified
  // reason is appended when we have one.
  const reasonSuffix = attention.topReason ? ` · ${attention.topReason.replace(/_/g, " ")}` : ""
  const eyesDetail = needsEyes
    ? ` · ${attention.unresolvedActions} action(s) and ${attention.danglingClaims} message claim(s) need review${reasonSuffix}`
    : ""

  if (gate.reason === "unknown_state") {
    return {
      state: "attention",
      badge: "Attention needed",
      detail: "Automation settings could not be read, treated as off",
    }
  }
  if (gate.reason === "not_authorized") {
    return {
      state: "permission_needed",
      badge: "Permission needed",
      detail: `Comment-management permission required${eyesDetail}`,
    }
  }
  if (needsEyes) {
    return {
      state: "attention",
      badge: "Attention needed",
      detail: `Auto reply ${gate.active ? "enabled" : "off"}${eyesDetail}`,
    }
  }
  if (gate.active) {
    return {
      state: "active",
      badge: "Enabled",
      detail: "New comments are read and answered automatically",
    }
  }
  return {
    state: "disabled",
    badge: "Ready but disabled",
    detail:
      gate.reason === "not_activated"
        ? "Permission granted · Never switched on for this account"
        : "Permission granted · Auto reply switched off",
  }
}

// ── THE PALETTE ─────────────────────────────────────────────────────────────────────────────
// ONE COLOUR PER STATE, and every state a different one. Before this, `paused` and `disabled`
// both fell through to muted grey and `attention` and `permission_needed` shared amber — five
// states wearing three colours, which is the opposite of telling them apart at a glance.
//
// The hues are ordered by how much they ask of the reader:
//   active            emerald — the only green anywhere. Green means something IS happening.
//   disabled          sky     — cool and calm: nothing is wrong, it is simply switched off.
//   paused            yellow  — a deliberate stop, not a fault.
//   permission_needed orange  — a fault you can fix in one click.
//   attention         amber   — the existing warning colour, deliberately unchanged.
//
// Yellow, orange and amber are neighbours, so they are separated by lightness as well as hue and
// each carries a distinct dot. Declared here rather than in the component so the page and the
// preview harness cannot drift apart — they did once already.
export const CAPABILITY_TONE: Record<CapabilityState, string> = {
  active: "text-emerald-600 dark:text-emerald-400",
  disabled: "text-sky-600 dark:text-sky-400",
  paused: "text-yellow-600 dark:text-yellow-400",
  permission_needed: "text-orange-600 dark:text-orange-400",
  attention: "text-amber-600 dark:text-amber-400",
}

export const CAPABILITY_DOT: Record<CapabilityState, string> = {
  active: "bg-emerald-500",
  disabled: "bg-sky-500",
  paused: "bg-yellow-500",
  permission_needed: "bg-orange-500",
  attention: "bg-amber-500",
}

/** Copy for the re-authorization action. One definition so the link and its tooltip cannot drift. */
export const REAUTHORIZE_COMMENTS_LABEL = "Re-authorize Comments"

/**
 * The tooltip. It has one job: make a safe action feel safe.
 *
 * It says the three things an operator needs before clicking a button next to "Disconnect":
 * nothing is disconnected, the SAME account must be chosen, and publishing is unaffected. The
 * third matters because sa_connect_instagram stores what Meta reports as GRANTED — choosing a
 * different account takes the INSERT branch and leaves the original connection behind on its old
 * scopes, which is the one way this action can go wrong.
 */
export const REAUTHORIZE_COMMENTS_TITLE =
  "Re-authorize this Instagram account to grant comment access. Nothing is disconnected and your " +
  "publishing settings, schedules and scheduled posts are unaffected — sign in with the SAME " +
  "Instagram account."

// ── THE ACCOUNTS PAGE'S THREE WORDS ─────────────────────────────────────────────────────────
// The redesigned card states three things per account: can we reach it, is it posting, is it
// answering comments. Those are the SAME facts publishingCapability and autoReplyCapability
// already decide — these map their verdict onto the card's shorter vocabulary and derive nothing
// new. A second opinion computed in the component is exactly how the page and the worker came to
// disagree once already.

/** Exactly three, because the card's status chip offers exactly three. */
export type ConnectionStatus = "connected" | "not_connected" | "reconnect_needed"

/**
 * Can we reach this account?
 *
 * ONLY about the token. A healthy account with posting paused is CONNECTED — the pause belongs on
 * the Auto Posting line, and conflating the two is what made a paused account and a dead token
 * wear the same pill. A row with no connection at all (an invitation that nobody has accepted) is
 * not passed here; it has no status to read and renders as not_connected.
 */
export function connectionStatus(input: {
  status: string
  expired: boolean
  /** True when this destination publishes through Buffer — both buffer columns present. */
  bufferRouted?: boolean
}): ConnectionStatus {
  // Expiry is only evidence of a problem for a destination that publishes with OUR token. See the
  // note in publishingCapability: a Buffer-routed row does not, so its expiry says nothing.
  return input.status === "error" || (input.expired && !input.bufferRouted)
    ? "reconnect_needed"
    : "connected"
}

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  not_connected: "Not Connected",
  reconnect_needed: "Reconnect Needed",
}

/** One word for the Auto Posting line, from the capability that already decided it. */
export function autoPostingWord(cap: Capability): string {
  if (cap.state === "active") return "On"
  if (cap.state === "attention") return "Blocked"
  return "Paused"
}

/** One or two words for the Auto Reply line, from the gate's verdict. Never re-derived. */
export function autoReplyWord(cap: Capability): string {
  switch (cap.state) {
    case "active": return "On"
    case "permission_needed": return "Permission needed"
    case "attention": return "Needs attention"
    default: return "Off"
  }
}

/**
 * The status chip's palette.
 *
 * Declared HERE, beside CAPABILITY_TONE, for the reason that module comment already gives: a
 * colour defined in the component is a colour the preview harness cannot see, and the two drifted
 * apart once already. Connection status is a different taxonomy from CapabilityState — three
 * values about reachability, not five about activity — so it gets its own map rather than being
 * forced through one that does not fit.
 *
 * Emerald stays the only green: a reachable account is not a busy one, but "Connected" is a fact
 * about the token and there is nothing to warn about, so it is the one place green means "fine".
 */
export const CONNECTION_STATUS_TONE: Record<ConnectionStatus, string> = {
  connected: "text-emerald-600 dark:text-emerald-400 border-emerald-500/40",
  not_connected: "text-[var(--crm-text-muted)] border-[var(--crm-border)]",
  reconnect_needed: "text-amber-600 dark:text-amber-400 border-amber-500/50",
}

export const CONNECTION_STATUS_DOT: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500",
  not_connected: "bg-[var(--crm-text-muted)]",
  reconnect_needed: "bg-amber-500",
}
