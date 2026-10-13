// Comments — keyword matching, commenter identity, and the one-DM-per-person rule.
//
// Pure. No network, no database, no Instagram API, no messages. Every rule the brief sets out is
// asserted against the real implementation.
// Run: npx tsx scripts/social/commentKeywords.test.ts
import {
  COMMENT_KEYWORDS, matchComment, matchingKeywords, tokenize, pickVariant,
  leadFormLink, APPROVED_DM_BODY, APPROVED_PUBLIC_FALLBACK,
} from "@/lib/social/commentKeywords"
import {
  resolveCommenter, resolveProfileUrl, shouldSendPrivateReply, publicReplyKind,
  resolveDmOutcome, DM_CLAIM_SQL,
} from "@/lib/social/commentIdentity"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const kw = (t: string) => matchComment(t)?.keyword ?? null

console.log("1. CASE AND PUNCTUATION TOLERANCE:")
{
  for (const v of ["LIST", "list", "List", "LiSt", "LIST!", "list?", "...list...", "LIST 🔑", "🔑LIST🔑", "“list”"]) {
    ok(`${JSON.stringify(v)} → LIST`, kw(v) === "LIST", String(kw(v)))
  }
  for (const v of ["contact me", "CONTACT ME", "Contact Me!", "contact  me", "contact, me"]) {
    ok(`${JSON.stringify(v)} → CONTACT ME`, kw(v) === "CONTACT ME", String(kw(v)))
  }
  ok("a keyword mid-sentence still matches", kw("hey can I get the list please") === "LIST")
  ok("emoji-only comment matches nothing", kw("😍🔥🏡") === null)
  ok("empty / null / whitespace match nothing", kw("") === null && kw(null) === null && kw("   ") === null)
}

console.log("\n2. WHOLE WORDS ONLY — the rule that prevents an unsolicited DM:")
{
  const mustNotMatch: Array<[string, string]> = [
    ["monkey", "KEY"], ["donkey", "KEY"], ["keyboard", "KEY"],
    ["homes", "HOME"], ["homeowner", "HOME"], ["homely", "HOME"],
    ["listen", "LIST"], ["listing", "LIST"], ["realist", "LIST"], ["playlist", "LIST"],
    ["downtown", "TOWN"], ["township", "TOWN"], ["hometown", "TOWN"],
    ["sunrise", "RISE"], ["highrises", "RISE"],
    ["lofty", "LOFT"], ["information", "INFO"], ["anywhere", "WHERE"], ["messages", "MESSAGE"],
    ["moreover", "MORE"], ["locations", "LOCATION"],
  ]
  for (const [text, never] of mustNotMatch) {
    ok(`"${text}" does NOT match ${never}`, kw(text) !== never, `matched ${kw(text)}`)
  }
  ok("a sentence of innocent praise matches nothing", kw("this is gorgeous, I listen to that song too") === null, String(kw("this is gorgeous, I listen to that song too")))
  ok("hyphenated splits into whole tokens", kw("high-rise") === "RISE")
}

console.log("\n3. DETERMINISTIC PRECEDENCE WHEN SEVERAL MATCH:")
{
  ok("'more info on the list' → LIST (property beats general)", kw("more info on the list") === "LIST", String(kw("more info on the list")))
  ok("'contact me with more info' → CONTACT ME (phrase beats single word)", kw("contact me with more info") === "CONTACT ME", String(kw("contact me with more info")))
  ok("'town or loft?' → TOWN (declared order breaks the tie)", kw("town or loft?") === "TOWN", String(kw("town or loft?")))
  ok("'loft or town?' → TOWN too (position does NOT decide)", kw("loft or town?") === "TOWN", String(kw("loft or town?")))
  ok("matchingKeywords lists every hit, winner first",
    matchingKeywords("more info on the list").map((k) => k.keyword).join(",") === "LIST,INFO,MORE",
    matchingKeywords("more info on the list").map((k) => k.keyword).join(","))
  // Same input, many evaluations — a retry must reach the same answer.
  const repeated = new Set(Array.from({ length: 50 }, () => kw("contact me about a loft or a townhome")))
  ok("50 evaluations of one comment give ONE answer", repeated.size === 1, [...repeated].join(","))
}

console.log("\n4. EVERY APPROVED KEYWORD IS SUPPORTED, AND NOTHING EXTRA:")
{
  const want = ["LIST","TOWN","LOFT","RISE","HOME","KEY","INFO","DETAILS","MORE","WHERE","LOCATION","INTERESTED","CONTACT ME","MESSAGE"]
  const got = COMMENT_KEYWORDS.map((k) => k.keyword)
  ok(`all ${want.length} approved keywords present`, want.every((w) => got.includes(w)), got.join(","))
  ok("no extras", got.length === want.length, got.join(","))
  ok("WHAT is deliberately absent", !got.includes("WHAT"))
  ok("each keyword matches itself", got.every((k) => kw(k) === k))
  const types = Object.fromEntries(COMMENT_KEYWORDS.map((k) => [k.keyword, k.propertyType]))
  ok("property keywords carry their type",
    types.LIST === "Apartment" && types.TOWN === "Townhome" && types.LOFT === "Loft"
    && types.RISE === "High-Rise" && types.HOME === "Rental Home" && types.KEY === "Penthouse")
  ok("general-interest keywords carry no type",
    ["INFO","DETAILS","MORE","WHERE","LOCATION","INTERESTED","CONTACT ME","MESSAGE"].every((k) => types[k] === null))
}

console.log("\n5. COMMENTER IDENTITY — username is never identity:")
{
  const own = "17841400000000000"
  const withId = resolveCommenter("instagram", { providerUserId: "17841409999999999", username: "marisol.rdz" }, own)
  ok("a stable id makes a commenter DM-eligible", withId.dmEligible && withId.reason === "ok")

  const noId = resolveCommenter("instagram", { username: "marisol.rdz" }, own)
  ok("NO stable id → NOT DM-eligible", !noId.dmEligible && noId.reason === "no_stable_id")
  ok("…but the username is still kept for display", noId.username === "marisol.rdz")

  const ours = resolveCommenter("instagram", { providerUserId: own, username: "jay.tx.locator" }, own)
  ok("our own account is never messaged", !ours.dmEligible && ours.reason === "own_account")
  ok("…recognised by handle too when the id is missing",
    resolveCommenter("instagram", { username: "JAY.TX.LOCATOR" }, "jay.tx.locator").reason === "own_account")

  ok("a leading @ is stripped", resolveCommenter("instagram", { username: "@marisol.rdz" }, own).username === "marisol.rdz")
  ok("an empty username becomes null", resolveCommenter("instagram", { username: "  " }, own).username === null)
}

console.log("\n6. PROFILE LINKS — never open the wrong person's account:")
{
  ok("a provider-supplied URL is used verbatim",
    resolveProfileUrl("instagram", { username: "x", profileUrl: "https://www.instagram.com/real_one/" }) === "https://www.instagram.com/real_one/")
  ok("a provider URL wins over construction",
    resolveProfileUrl("instagram", { username: "different", profileUrl: "https://instagram.com/actual/" })?.includes("actual"))
  ok("a safe handle constructs an Instagram URL",
    resolveProfileUrl("instagram", { username: "marisol.rdz" }) === "https://www.instagram.com/marisol.rdz/")
  ok("a safe handle constructs a TikTok URL",
    resolveProfileUrl("tiktok", { username: "jay_tx" }) === "https://www.tiktok.com/@jay_tx")
  for (const bad of ["marisol rdz", "maris/ol", "a".repeat(31), "user?x=1", "..\\..", "<script>", ""]) {
    ok(`unsafe handle ${JSON.stringify(bad)} → no link`, resolveProfileUrl("instagram", { username: bad }) === null)
  }
  ok("a malformed provider URL is rejected, not linked",
    resolveProfileUrl("instagram", { username: "not safe here", profileUrl: "javascript:alert(1)" }) === null)
  ok("no username and no URL → no link", resolveProfileUrl("instagram", {}) === null)
  ok("an unknown provider does not invent a URL", resolveProfileUrl("youtube", { username: "someone" }) === null)
}

console.log("\n7. ONE DM PER PERSON PER CONNECTED ACCOUNT:")
{
  const id = resolveCommenter("instagram", { providerUserId: "IGSID_1", username: "kayla.b" }, "own")
  const on = { automationEnabled: true, identity: id }

  ok("first time → send", shouldSendPrivateReply({ ...on, existing: null }).send)
  ok("already messaged → refused, whatever the comment",
    shouldSendPrivateReply({ ...on, existing: { providerUserId: "IGSID_1", dmSentAt: "2026-10-13T00:00:00Z", dmClaimedAt: null } }).reason === "already_messaged")
  ok("a SECOND comment from the same person is still refused",
    !shouldSendPrivateReply({ ...on, existing: { providerUserId: "IGSID_1", dmSentAt: "2026-10-01T00:00:00Z", dmClaimedAt: null } }).send)
  ok("no stable id → refused even when never messaged",
    shouldSendPrivateReply({ automationEnabled: true, identity: resolveCommenter("instagram", { username: "ghost" }, "own"), existing: null }).reason === "no_stable_id")
  ok("automation off → refused", shouldSendPrivateReply({ ...on, automationEnabled: false, existing: null }).reason === "automation_off")
  ok("our own account → refused",
    shouldSendPrivateReply({ automationEnabled: true, identity: resolveCommenter("instagram", { providerUserId: "own", username: "jay" }, "own"), existing: null }).reason === "own_account")
  ok("EVERY refusal path is a refusal, never a send",
    [
      shouldSendPrivateReply({ ...on, automationEnabled: false, existing: null }),
      shouldSendPrivateReply({ ...on, existing: { providerUserId: "IGSID_1", dmSentAt: "x", dmClaimedAt: null } }),
      shouldSendPrivateReply({ automationEnabled: true, identity: resolveCommenter("instagram", {}, "own"), existing: null }),
    ].every((d) => !d.send))
}

console.log("\n7b. CONCURRENCY — the claim, not the read, is what enforces the rule:")
{
  const id = resolveCommenter("instagram", { providerUserId: "IGSID_2", username: "t.mendez" }, "own")
  const on = { automationEnabled: true, identity: id }

  // The pre-filter alone is check-then-act: two workers reading the SAME "never messaged" state
  // both decide to send. That is precisely why it is not the guarantee.
  const fresh = { providerUserId: "IGSID_2", dmSentAt: null, dmClaimedAt: null }
  ok("two workers reading identical fresh state BOTH decide to send (so a claim is required)",
    shouldSendPrivateReply({ ...on, existing: fresh }).send && shouldSendPrivateReply({ ...on, existing: fresh }).send)

  // The claim statement is the compare-and-set that only one of them can win.
  ok("the claim is conditional on dm_claimed_at IS NULL", /dm_claimed_at is null/.test(DM_CLAIM_SQL))
  ok("…and on dm_sent_at IS NULL", /dm_sent_at is null/.test(DM_CLAIM_SQL))
  ok("…and returns the row so the winner is identifiable", /returning id/.test(DM_CLAIM_SQL))
  ok("…and sets the claim in the same statement", /set dm_claimed_at = now\(\)/.test(DM_CLAIM_SQL))

  // Once claimed, the pre-filter refuses too — the loser does not even attempt a claim.
  ok("a held claim refuses further sends",
    shouldSendPrivateReply({ ...on, existing: { providerUserId: "IGSID_2", dmSentAt: null, dmClaimedAt: "2026-10-14T00:00:00Z" } }).reason === "claim_held")
}

console.log("\n7c. LOST ACKNOWLEDGMENTS ARE NEVER BLINDLY RETRIED:")
{
  const accepted = resolveDmOutcome("accepted")
  ok("accepted → stamp sent, keep the claim, may say 'DM sent'",
    accepted.markSent && !accepted.releaseClaim && accepted.status === "sent" && accepted.mayClaimDmPublicly)
  ok("accepted is not retryable", !accepted.retryable)

  const failed = resolveDmOutcome("failed")
  ok("confirmed failure → release the claim so a later comment may try",
    !failed.markSent && failed.releaseClaim && failed.status === "failed" && failed.retryable)
  ok("…and a failure must NOT claim a DM publicly", !failed.mayClaimDmPublicly)

  const unknown = resolveDmOutcome("uncertain")
  ok("UNCERTAIN → claim is NOT released", !unknown.releaseClaim)
  ok("UNCERTAIN → never retried automatically", !unknown.retryable)
  ok("UNCERTAIN → not marked sent", !unknown.markSent)
  ok("UNCERTAIN → must not claim a DM publicly", !unknown.mayClaimDmPublicly)
  ok("UNCERTAIN → surfaced as its own status", unknown.status === "uncertain")

  // The lost-ack scenario end to end: claimed, sent, response never seen.
  const afterLostAck = { providerUserId: "IGSID_3", dmSentAt: null, dmClaimedAt: "2026-10-14T00:00:00Z" }
  ok("a person whose ack was lost stays blocked, not re-messaged",
    !shouldSendPrivateReply({
      automationEnabled: true,
      identity: resolveCommenter("instagram", { providerUserId: "IGSID_3", username: "x" }, "own"),
      existing: afterLostAck,
    }).send)
}

console.log("\n8. A PUBLIC REPLY NEVER CLAIMS AN UNSENT DM:")
{
  ok("platform accepted → may say 'sent you a DM'", publicReplyKind(true) === "dm_sent")
  ok("not accepted → bio-link fallback", publicReplyKind(false) === "bio_link")
  ok("the fallback never mentions a DM or inbox",
    !/\bDM\b|inbox|message/i.test(APPROVED_PUBLIC_FALLBACK), APPROVED_PUBLIC_FALLBACK)
  ok("the approved fallback wording is exact",
    APPROVED_PUBLIC_FALLBACK === "Hey! 😊 I’d love to help! Check the link in my bio to get started. 🏡")
}

console.log("\n9. THE APPROVED DM AND ITS LEAD-FORM LINK:")
{
  ok("the DM wording is exact",
    APPROVED_DM_BODY === "Hey, it’s Jay! 😊 Thanks for commenting! My apartment locating service is free. Let’s find you a place! 🏡")
  ok("…and uses curly apostrophes, not straight ones", APPROVED_DM_BODY.includes("it’s") && !APPROVED_DM_BODY.includes("it's"))

  const link = leadFormLink({ origin: "https://locatorbeast.com", username: "jay-morris", platformSlug: "ig", keyword: "TOWN", mediaId: "17900000000000000" })
  ok("uses the existing branded /ig link", link.startsWith("https://locatorbeast.com/jay-morris/ig?"))
  ok("carries the keyword in utm_content", link.includes("utm_content=TOWN"))
  ok("carries the source post in utm_term", link.includes("utm_term=17900000000000000"))
  ok("marks the channel as a comment", link.includes("utm_medium=comment") && link.includes("utm_campaign=comment_automation"))
  ok("does NOT set utm_source (the /ig path already resolves it)", !link.includes("utm_source="))
  ok("omits utm_term when there is no media id",
    !leadFormLink({ origin: "https://locatorbeast.com", username: "jay-morris", platformSlug: "ig", keyword: "LIST" }).includes("utm_term"))
}

console.log("\n10. VARIATION PICKING IS DETERMINISTIC (a retry re-sends the same text):")
{
  const variants = ["Just sent you a DM!", "Check your inbox 📩", "DM'd you the options!"]
  const first = pickVariant(variants, "comment_abc123")
  ok("the same comment id always picks the same variation",
    Array.from({ length: 30 }, () => pickVariant(variants, "comment_abc123")).every((v) => v === first))
  ok("different comments spread across the bank",
    new Set(Array.from({ length: 60 }, (_, i) => pickVariant(variants, `c${i}`))).size > 1)
  ok("an empty bank yields null, not a crash", pickVariant([], "x") === null)
  ok("a single-variant bank always returns it", pickVariant(["only"], "anything") === "only")
}

console.log("\n11. TOKENIZER:")
{
  ok("splits on punctuation and emoji", tokenize("list, town! 🔑 loft").join("|") === "LIST|TOWN|LOFT")
  ok("uppercases", tokenize("MiXeD").join("") === "MIXED")
  ok("keeps digits", tokenize("2 bed").join("|") === "2|BED")
  ok("handles accents without shattering", tokenize("café").join("") === "CAFÉ")
  ok("null-safe", tokenize(null).length === 0 && tokenize(undefined).length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
