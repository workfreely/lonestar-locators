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
}): Capability {
  if (input.connectionStatus === "error" || input.expired) {
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
