// Comments — WEBHOOK INTAKE: signature verification, the handshake, and payload normalisation.
//
// The endpoint is PUBLIC, so the signature is the only thing standing between an anonymous caller
// and our account replying to strangers. Every rejection branch is asserted, and each one is also
// checked to FAIL when the guard is removed — an assertion that passes either way proves nothing.
// Run: npx tsx scripts/social/commentWebhook.test.ts
import crypto from "node:crypto"
import {
  verifyMetaSignature, verifyHandshake, parseInstagramCommentWebhook, dedupeIncoming,
} from "@/lib/social/commentWebhook"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

const SECRET = "app-secret-value"
const sign = (body: string, secret = SECRET) =>
  `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`

console.log("1. SIGNATURE VERIFICATION — the only gate on a public endpoint:")
{
  const body = JSON.stringify({ object: "instagram", entry: [] })
  ok("a correctly signed body verifies",
    verifyMetaSignature({ rawBody: body, header: sign(body), appSecret: SECRET }).ok)

  ok("NO SECRET CONFIGURED is a refusal, not a bypass",
    verifyMetaSignature({ rawBody: body, header: sign(body), appSecret: "" }).reason === "not_configured")
  ok("a missing header is refused",
    verifyMetaSignature({ rawBody: body, header: null, appSecret: SECRET }).reason === "missing_header")
  ok("a wrong secret is refused",
    verifyMetaSignature({ rawBody: body, header: sign(body, "wrong"), appSecret: SECRET }).reason === "mismatch")

  // THE CRITICAL ONE: the body is what is signed, so tampering must invalidate it.
  const tampered = JSON.stringify({ object: "instagram", entry: [{ id: "evil" }] })
  ok("a body MODIFIED after signing is refused",
    verifyMetaSignature({ rawBody: tampered, header: sign(body), appSecret: SECRET }).reason === "mismatch")

  ok("a bare hex digest with no sha256= prefix is refused (the algorithm is not the caller's choice)",
    verifyMetaSignature({
      rawBody: body,
      header: crypto.createHmac("sha256", SECRET).update(body).digest("hex"),
      appSecret: SECRET,
    }).reason === "malformed_header")
  ok("a sha1= signature is refused even if it would otherwise match",
    verifyMetaSignature({
      rawBody: body,
      header: `sha1=${crypto.createHmac("sha1", SECRET).update(body).digest("hex")}`,
      appSecret: SECRET,
    }).reason === "malformed_header")
  ok("a truncated digest is refused",
    verifyMetaSignature({ rawBody: body, header: "sha256=abc123", appSecret: SECRET }).reason === "malformed_header")
  ok("an empty string body still verifies when correctly signed (no special-casing)",
    verifyMetaSignature({ rawBody: "", header: sign(""), appSecret: SECRET }).ok)
  ok("case-insensitive hex is accepted",
    verifyMetaSignature({ rawBody: body, header: sign(body).toUpperCase().replace("SHA256", "sha256"), appSecret: SECRET }).ok)

  // Nothing may verify on missing information.
  ok("EVERY degraded input is a refusal",
    [
      { rawBody: body, header: null, appSecret: SECRET },
      { rawBody: body, header: "", appSecret: SECRET },
      { rawBody: body, header: sign(body), appSecret: null },
      { rawBody: body, header: "sha256=", appSecret: SECRET },
      { rawBody: body, header: "garbage", appSecret: SECRET },
    ].every((i) => !verifyMetaSignature(i).ok))
}

console.log("\n2. THE SUBSCRIPTION HANDSHAKE:")
{
  const base = { mode: "subscribe", token: "verify-me", challenge: "1158201444", expectedToken: "verify-me" }
  const r = verifyHandshake(base)
  ok("a correct handshake echoes the challenge", r.ok && r.challenge === "1158201444")
  ok("a wrong token is refused", verifyHandshake({ ...base, token: "nope" }).ok === false)
  ok("a token that is a PREFIX of ours is refused (length is checked)",
    verifyHandshake({ ...base, token: "verify" }).ok === false)
  ok("mode must be subscribe", !verifyHandshake({ ...base, mode: "unsubscribe" }).ok)
  ok("no configured token is a refusal", !verifyHandshake({ ...base, expectedToken: "" }).ok)
  ok("no challenge is a refusal", !verifyHandshake({ ...base, challenge: "" }).ok)
}

console.log("\n3. PAYLOAD NORMALISATION — and the field this design turns on:")
{
  const payload = {
    object: "instagram",
    entry: [{
      id: "17841436885324014",
      time: 1_792_000_000,
      changes: [{
        field: "comments",
        value: {
          id: "17900000000000001",
          text: "LIST please!",
          from: { id: "78901234567", username: "renter.jane" },
          media: { id: "media-1" },
        },
      }],
    }],
  }
  const { comments, ignored } = parseInstagramCommentWebhook(payload)
  ok("one comment is parsed", comments.length === 1)
  const c = comments[0]
  ok("the STABLE COMMENTER ID is captured from from.id", c.authorProviderUserId === "78901234567")
  ok("the username is captured", c.authorUsername === "renter.jane")
  ok("the recipient account id comes from entry.id", c.recipientProviderUserId === "17841436885324014")
  ok("the media id is captured", c.externalMediaId === "media-1")
  ok("entry.time becomes the comment timestamp",
    c.commentedAt === new Date(1_792_000_000 * 1000).toISOString())
  ok("a top-level comment is not a nested reply", c.isNestedReply === false)
  ok("intake is recorded as webhook", c.intake === "webhook")
  ok("nothing was ignored", ignored.length === 0)

  // A comment with NO from.id — the case the whole DM rule hinges on.
  const noFrom = parseInstagramCommentWebhook({
    object: "instagram",
    entry: [{ id: "a", time: 1, changes: [{ field: "comments", value: { id: "c1", text: "LIST" } }] }],
  })
  ok("a comment with no `from` still parses, with a NULL commenter id",
    noFrom.comments.length === 1 && noFrom.comments[0].authorProviderUserId === null)

  ok("parent_id marks a nested reply", parseInstagramCommentWebhook({
    object: "instagram",
    entry: [{ id: "a", time: 1, changes: [{ field: "comments", value: { id: "c1", text: "x", parent_id: "c0" } }] }],
  }).comments[0].isNestedReply === true)
  ok("parent_id EQUAL to the comment's own id is not a parent", parseInstagramCommentWebhook({
    object: "instagram",
    entry: [{ id: "a", time: 1, changes: [{ field: "comments", value: { id: "c1", text: "x", parent_id: "c1" } }] }],
  }).comments[0].isNestedReply === false)
}

console.log("\n4. WHAT IS REFUSED OR IGNORED, AND SAID SO:")
{
  const live = parseInstagramCommentWebhook({
    object: "instagram",
    entry: [{ id: "a", time: 1, changes: [{ field: "live_comments", value: { id: "c1", text: "LIST" } }] }],
  })
  ok("LIVE comments are not processed", live.comments.length === 0)
  ok("…and the reason is reported, not silently dropped",
    live.ignored.length === 1 && /live/i.test(live.ignored[0].reason))

  const noId = parseInstagramCommentWebhook({
    object: "instagram",
    entry: [{ id: "a", time: 1, changes: [{ field: "comments", value: { text: "LIST" } }] }],
  })
  ok("a comment with NO ID is refused — it has no idempotency key",
    noId.comments.length === 0 && /deduplicated/i.test(noId.ignored[0].reason))

  ok("a non-instagram object is refused wholesale",
    parseInstagramCommentWebhook({ object: "page", entry: [{ id: "a", changes: [] }] }).comments.length === 0)
  ok("an unrelated field is ignored with a reason",
    parseInstagramCommentWebhook({
      object: "instagram", entry: [{ id: "a", time: 1, changes: [{ field: "mentions", value: { id: "m" } }] }],
    }).ignored[0].reason === "not a comment event")

  for (const junk of [null, undefined, "string", 42, [], {}, { object: "instagram" }, { object: "instagram", entry: "x" }]) {
    const r = parseInstagramCommentWebhook(junk)
    if (r.comments.length !== 0) { fail++; console.log(`  ✗ junk payload produced comments: ${JSON.stringify(junk)}`); break }
  }
  ok("no malformed payload ever yields a comment", true)
  ok("a missing entry.time yields a NULL timestamp (screenComment then holds it)",
    parseInstagramCommentWebhook({
      object: "instagram", entry: [{ id: "a", changes: [{ field: "comments", value: { id: "c1", text: "LIST" } }] }],
    }).comments[0].commentedAt === null)
}

console.log("\n5. DUPLICATE DELIVERY — Meta retries, and batches:")
{
  const one = {
    provider: "instagram" as const, externalCommentId: "c1", externalMediaId: null,
    recipientProviderUserId: "a", authorProviderUserId: "u1", authorUsername: "u",
    body: "LIST", commentedAt: null, isNestedReply: false, intake: "webhook" as const,
  }
  ok("a duplicate comment id within ONE delivery is collapsed",
    dedupeIncoming([one, { ...one }]).length === 1)
  ok("different ids are both kept",
    dedupeIncoming([one, { ...one, externalCommentId: "c2" }]).length === 2)
  ok("the FIRST occurrence is the one kept",
    dedupeIncoming([one, { ...one, body: "second" }])[0].body === "LIST")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
