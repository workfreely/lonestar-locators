// ONE EXCHANGE, ONE ROW — and the link is Instagram's id, never a timestamp.
//
// Our posted replies are ingested as ordinary comments from our own account, so the Inbox showed
// each exchange twice: once as the comment, once as a standalone row reading "own account —
// skipped". That second row described the DM leg of OUR comment and said nothing about the
// conversation, which is exactly the kind of thing an operator reads as a failure.
//
// The assertions below pin both directions: a reply must be folded into the comment it answers,
// and a reply we cannot place must NOT disappear.
import { groupConversations, type CommentRow } from "@/components/crm/social/CommentsClient"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

const row = (o: Partial<CommentRow>): CommentRow => ({
  id: o.id ?? "x", provider: "instagram", body: o.body ?? "", author_username: o.author_username ?? "someone",
  permalink: null, commented_at: o.commented_at ?? "2026-10-21T13:42:17Z", matched_keyword: o.matched_keyword ?? null,
  hold_reason: null, external_comment_id: o.external_comment_id ?? null, external_media_id: null,
  social_commenters: null, social_posts: null, comment_actions: o.comment_actions ?? [],
} as unknown as CommentRow)

// The real 21 Oct exchange.
const THEIRS = row({
  id: "theirs", author_username: "the_flavor_muse", external_comment_id: "18399380821206995",
  body: "Why can yall just give the info on the place posted? I get it, you want leads.",
  matched_keyword: "INFO",
  comment_actions: [
    { kind: "private_reply", status: "failed", reason: "permission", external_id: null },
    { kind: "public_reply", status: "sent", reason: "accepted", external_id: "17989835033996377" },
  ],
})
const OURS = row({
  id: "ours", author_username: "realestatepro_tx", external_comment_id: "17989835033996377",
  body: "I got you! 😊 Link in bio!",
  comment_actions: [{ kind: "private_reply", status: "skipped", reason: "own_account", external_id: null }],
})

console.log("\n1. THE REAL EXCHANGE COLLAPSES TO ONE ROW:")
{
  const out = groupConversations([OURS, THEIRS])
  ok("two rows become one", out.length === 1, `got ${out.length}`)
  ok("the surviving row is THEIR comment", out[0].id === "theirs")
  ok("our reply is attached to it", out[0].reply?.externalId === "17989835033996377")
  ok("with the text we actually posted", out[0].reply?.body === "I got you! 😊 Link in bio!")
  ok("and its real delivery status", out[0].reply?.status === "sent")
  ok('our reply no longer appears as its own row', !out.some((c) => c.id === "ours"))
}

console.log("\n2. THE LINK IS THE PLATFORM ID, NOT PROXIMITY:")
{
  // A reply posted at the same instant, but answering a DIFFERENT comment, must not attach here.
  const decoy = row({ id: "decoy", external_comment_id: "99999", body: "Link in bio!", commented_at: THEIRS.commented_at })
  const out = groupConversations([decoy, THEIRS, OURS])
  const theirs = out.find((c) => c.id === "theirs")
  ok("the correct reply is attached", theirs?.reply?.externalId === "17989835033996377")
  ok("the same-timestamp decoy is NOT attached", theirs?.reply?.body !== "Link in bio!")
  ok("…and the decoy stays visible as its own row", out.some((c) => c.id === "decoy"))
}

console.log("\n3. A REPLY WE CANNOT PLACE IS NEVER SILENTLY DROPPED:")
{
  // Accepted by Instagram, not yet ingested back: an id, no stored text.
  const out = groupConversations([THEIRS])
  ok("the parent still renders", out.length === 1)
  ok("the reply is reported by status", out[0].reply?.status === "sent")
  ok("…with no invented wording", out[0].reply?.body === null)
}

console.log("\n4. NOTHING ELSE IS HIDDEN:")
{
  const plain = row({ id: "plain", author_username: "someone_else", external_comment_id: "555", body: "nice place" })
  const held = row({ id: "held", external_comment_id: "666", body: "LIST", comment_actions: [{ kind: "public_reply", status: "skipped", reason: "disabled", external_id: null }] })
  const out = groupConversations([plain, held, THEIRS, OURS])
  ok("a comment with no reply survives", out.some((c) => c.id === "plain"))
  ok("a SKIPPED public reply attaches nothing (nothing was posted)",
    out.find((c) => c.id === "held")?.reply === null)
  ok("…and that comment still renders", out.some((c) => c.id === "held"))
  ok("exactly one row was removed, and it was ours", out.length === 3 && !out.some((c) => c.id === "ours"))
}

console.log("\n5. ORDER AND HISTORY ARE PRESERVED:")
{
  const a = row({ id: "a", external_comment_id: "1", commented_at: "2026-10-21T10:00:00Z" })
  const b = row({ id: "b", external_comment_id: "2", commented_at: "2026-10-20T10:00:00Z" })
  const out = groupConversations([a, b])
  ok("input order is kept (the page sorts, not this)", out.map((c) => c.id).join(",") === "a,b")
  ok("no comment is mutated", out[0].body === a.body && out[1].body === b.body)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
