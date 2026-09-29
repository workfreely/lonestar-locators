// Social Beast — PLATFORM-AWARE HASHTAG LIMITS.
// The editor hashtag cap is the STRICTEST (smallest) limit among the selected destinations:
//   Instagram 7 · TikTok 5 · YouTube 7  (Social Beast PRODUCT limits, not platform API hard caps).
// Any selection that includes TikTok caps at 5; Instagram and/or YouTube alone allow 7. Existing tags
// already over the cap are the caller's concern — hashtagLimitFor() only computes the cap and never
// mutates a set, so a >5 selection is NEVER silently trimmed by this logic.
// Run: npx tsx scripts/social/hashtagLimits.test.ts
import { readFileSync } from "node:fs"
import { hashtagLimitFor, PLATFORM_HASHTAG_LIMIT, MAX_HASHTAGS } from "@/lib/social/hashtags"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("Per-platform product limits (IG 7 / TikTok 5 / YouTube 7):")
ok("instagram = 7", PLATFORM_HASHTAG_LIMIT.instagram === 7)
ok("tiktok = 5", PLATFORM_HASHTAG_LIMIT.tiktok === 5)
ok("youtube = 7", PLATFORM_HASHTAG_LIMIT.youtube === 7)

console.log("\nAll selection combinations (strictest applicable wins):")
const S = (...ids: string[]) => new Set(ids)
// Singles
ok("Instagram only → 7", hashtagLimitFor(S("instagram")) === 7)
ok("TikTok only → 5", hashtagLimitFor(S("tiktok")) === 5)
ok("YouTube only → 7", hashtagLimitFor(S("youtube")) === 7)
// Pairs
ok("Instagram + YouTube → 7", hashtagLimitFor(S("instagram", "youtube")) === 7)
ok("Instagram + TikTok → 5", hashtagLimitFor(S("instagram", "tiktok")) === 5)
ok("TikTok + YouTube → 5", hashtagLimitFor(S("tiktok", "youtube")) === 5)
// Triple
ok("Instagram + TikTok + YouTube → 5", hashtagLimitFor(S("instagram", "tiktok", "youtube")) === 5)
// Order-independence (Set has no order guarantee anyway, but assert explicitly)
ok("TikTok listed first still → 5", hashtagLimitFor(S("tiktok", "instagram", "youtube")) === 5)

console.log("\nEdge cases (fallback + unknown ids):")
ok("empty selection → fallback 7 (editor baseline, NOT the generation cap)", hashtagLimitFor(S()) === 7)
ok("empty selection → explicit fallback honored", hashtagLimitFor(S(), 9) === 9)
ok("unknown id only → fallback 7", hashtagLimitFor(S("facebook")) === 7)
ok("unknown id ignored, TikTok still caps → 5", hashtagLimitFor(S("facebook", "tiktok")) === 5)
ok("unknown id ignored, IG baseline → 7", hashtagLimitFor(S("facebook", "instagram")) === 7)

console.log("\n>5 existing-selection case — cap is computed, tags are NEVER trimmed here:")
{
  // A post carrying 7 IG-generated tags, then TikTok gets added to the selection (cap drops to 5).
  const existing = ["#satxapartments", "#sanantonioapartmentlocator", "#movingtosanantonio", "#highrise", "#downtownsanantonio", "#sanantoniotexas", "#nowleasing"]
  const cap = hashtagLimitFor(S("instagram", "tiktok"))
  ok("cap is 5 when TikTok joins a 7-tag Instagram post", cap === 5)
  ok("the 7 existing tags are OVER the cap (2 over)", existing.length - cap === 2)
  // hashtagLimitFor returns a number only — it cannot and does not mutate the caller's array.
  ok("hashtagLimitFor returns a number, not a list (no trimming)", typeof cap === "number")
  // Still 7: a HISTORICAL post generated under the old cap is never trimmed or rewritten.
  ok("existing 7-tag historical set is untouched by computing the cap", existing.length === 7)
}

console.log("\nSource guarantees (PostEditor uses the shared cap for the editor, MAX_HASHTAGS for generation):")
{
  const src = readFileSync(new URL("../../components/crm/social/PostEditor.tsx", import.meta.url), "utf8")
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
  // Editor cap is derived from the shared helper over the selected platforms.
  ok("imports hashtagLimitFor", /import\s*\{[^}]*\bhashtagLimitFor\b[^}]*\}\s*from\s*["']@\/lib\/social\/hashtags["']/.test(noComments))
  // The editor cap now uses the helper's own platform baseline; it no longer passes the GENERATION
  // constant, so the two caps cannot drift into each other.
  ok("derives hashtagLimit from hashtagLimitFor(selectedPlatforms)", /const\s+hashtagLimit\s*=\s*hashtagLimitFor\(\s*selectedPlatforms\s*\)/.test(noComments))
  ok("editor cap no longer passes the generation constant", !/hashtagLimitFor\(\s*selectedPlatforms\s*,\s*MAX_HASHTAGS/.test(noComments))
  // The three editor-cap surfaces use hashtagLimit (add-cap, add-input visibility, help/label).
  ok("add-cap uses hashtagLimit (prevent adding past the cap)", /prev\.length\s*>=\s*hashtagLimit/.test(noComments))
  ok("add-input visibility uses hashtagLimit", /hashtags\.length\s*<\s*hashtagLimit/.test(noComments))
  ok("count label / warning uses hashtagLimit", /hashtags\.length\s*>\s*hashtagLimit/.test(noComments))
  // Generation is UNCHANGED — every buildHashtags call still uses MAX_HASHTAGS, never hashtagLimit.
  const genCalls = noComments.match(/buildHashtags\([^)]*\)/g) ?? []
  ok("buildHashtags is still called (generation present)", genCalls.length >= 2)
  ok("no buildHashtags call uses hashtagLimit (generation untouched)", genCalls.every((c) => !/hashtagLimit/.test(c)))
  // The generation constant now lives in lib/social/hashtags (one canonical source, value 5) and
  // PostEditor imports it instead of declaring its own.
  ok("PostEditor imports the shared MAX_HASHTAGS rather than declaring its own", /import\s*\{[^}]*MAX_HASHTAGS[^}]*\}\s*from\s*"@\/lib\/social\/hashtags"/.test(noComments) && !/const\s+MAX_HASHTAGS\s*=/.test(noComments))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
