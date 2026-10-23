// WHICH Instagram connection the Comments screen is describing.
//
// This used to be `connections.find((a) => a.provider === "instagram")` over a list ordered by
// `provider` alone. With ONE Instagram account that is correct by accident. With two it is not
// ordered at all: Postgres is free to return rows tied on `provider` in any order, and that order
// can change between two identical queries, after an UPDATE, or after a vacuum — so the screen
// could describe one account on Monday and the other on Tuesday with nothing having changed.
//
// WHAT WENT WRONG IS WORTH BEING PRECISE ABOUT, because it decides the fix. The bug was never
// "it picked the wrong row"; it was "the question had no answer". Adding a tiebreaker to the SQL
// would make it deterministic without making it CORRECT — it would still be picking an account by
// position rather than by whether the account has anything to do with comments.
//
// So the rule is semantic first, positional only to break a genuine tie:
//
//   1. Instagram only. TikTok has its own comment path and is never what this screen describes.
//   2. PREFER the account that actually holds the comments permission. Comment automation is
//      exactly what instagram_business_manage_comments grants, and the poller already refuses to
//      spend a single API call on a connection without it (`missing_comments_scope`). An account
//      that cannot read a comment cannot be the account whose comment settings these are. This is
//      what makes a publishing-only destination — one connected through the invitation flow, which
//      requests INSTAGRAM_SCOPES and deliberately omits the comments scope — unable to displace
//      the production account here, structurally rather than by configuration.
//   3. Then OLDEST FIRST. Among accounts that can all do comments, the established one is the one
//      a screen with a single account-level switch should be describing.
//   4. Then lowest id. Only reachable when two rows share a created_at to the microsecond, which
//      in practice means a fixture; it exists so the function is total and never returns a
//      different answer for the same input.
//
// Steps 3 and 4 are a LAST RESORT, not the mechanism. If this screen ever needs to describe more
// than one comment-capable account, the honest fix is an account selector in the UI, not a cleverer
// rule here — at that point the single `accountEnabled` / `publicRepliesEnabled` pair it renders is
// the thing that has become wrong, and no picker can repair that.
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"

/** The fields the choice is made from. Deliberately a structural type: the caller passes its own
 *  row shape and gets that same type back, so nothing has to be cast at the call site. */
export type CommentsAccountRow = {
  id: string
  provider?: string | null
  scopes?: string[] | null
  created_at?: string | null
}

/** True when this row can actually act on comments. */
export function hasCommentsScope(row: CommentsAccountRow): boolean {
  return (row.scopes ?? []).includes(INSTAGRAM_COMMENTS_SCOPE)
}

/**
 * The Instagram connection whose comment settings the Comments screen is showing, or null when
 * there is no Instagram connection at all. Pure and total: same input, same answer, always.
 */
export function pickCommentsConnection<T extends CommentsAccountRow>(rows: readonly T[] | null | undefined): T | null {
  const instagram = (rows ?? []).filter((r) => (r.provider ?? "") === "instagram")
  if (instagram.length === 0) return null

  // An invalid or missing created_at must not win by sorting before a real one, so it is pushed to
  // the end rather than coerced to 0 (epoch) — which would make an unparseable date the "oldest"
  // row and hand it the account.
  const age = (r: T): number => {
    const t = Date.parse(r.created_at ?? "")
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
  }

  return [...instagram].sort((a, b) => {
    const ca = hasCommentsScope(a) ? 0 : 1
    const cb = hasCommentsScope(b) ? 0 : 1
    if (ca !== cb) return ca - cb
    const aa = age(a)
    const ab = age(b)
    if (aa !== ab) return aa - ab
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })[0]
}
