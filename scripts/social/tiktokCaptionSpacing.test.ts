// WHY THE PRIVATE PRESENTER POST'S CAPTION LOOKED COMPRESSED, AND WHAT STOPS IT RECURRING.
//
// Social Beast has an APPROVED TikTok formatter: buildTikTokCaptionPayload, whose last step is
// padTikTokSectionBreaks — every blank line becomes "\n" + U+2800 + "\n", because TikTok renders a
// bare \n\n as a single line break and the paragraphs collapse. That behaviour is correct and is
// covered in depth by tiktok-caption.test.ts.
//
// The presenter post did not use it. It was published through a ONE-OFF script that called
// buildInstagramCaptionPayload, which emits raw \n\n — right for Meta, collapsed by TikTok. No
// production route had the defect: both TikTok paths already used the TikTok builder, and the
// Instagram "Publish Now" route refuses a TikTok destination outright (publish: awaiting_approval).
//
// So this file asserts the two things that were actually missing:
//   1. the CONTRACT — the approved formatter's output, and that the Instagram one is wrong for
//      TikTok in exactly the way observed, with identical content;
//   2. the GUARD — no TikTok publish path in the repo builds its caption with the Instagram
//      builder, and the caption does not depend on whether a presenter is attached.
import { readFileSync } from "node:fs"
import {
  buildTikTokCaptionPayload, buildInstagramCaptionPayload, padTikTokSectionBreaks,
  TIKTOK_SECTION_PAD as PAD, TIKTOK_MAX_HASHTAGS, type OverlayTemplate,
} from "@/lib/social/composePost"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}
/** Source with comments stripped, so a historical note about the old call cannot satisfy a scan. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const source = { market: "Dallas", property_type: "Apartment", special: null, budget_range: "1450", amenities: "Pool\nGym" }
// The real presenter post's stored caption, verbatim: one blank line between the two sentences.
const STORED = "Moving to Dallas? I got you.\n\nMy apartment locating service is completely free!"
const TAGS = ["#dallasapartments", "#dallasapartmentlocators", "#movingtodallas", "#apartmenthunting", "#apartmentliving"]
const base = { caption: STORED, socialSpecial: null, sourceContentId: "presenter-y440", source }

console.log("the stripper works:")
// The needle is ASSEMBLED at runtime on purpose. Written as one literal it would appear in THIS
// line as code, survive comment-stripping, and the check would fail no matter how well strip works.
const needle = ["WHY THE PRIVATE", "PRESENTER POST'S CAPTION"].join(" ")
ok("this file's own explanation is not scanned", !strip(readFileSync("scripts/social/tiktokCaptionSpacing.test.ts", "utf8")).includes(needle))
ok("…and the needle really is in the file before stripping",
  readFileSync("scripts/social/tiktokCaptionSpacing.test.ts", "utf8").includes(needle), "the check would be vacuous")

// ── 1. THE OBSERVED DEFECT, REPRODUCED ────────────────────────────────────────────────────────
console.log("\nthe compression is reproducible, and it is the BUILDER that differs:")
const tt = buildTikTokCaptionPayload(base)
const ig = buildInstagramCaptionPayload({ ...base, hashtags: TAGS, overlayTemplate: null })
ok("the Instagram payload (what the one-off sent) carries bare blank lines", /\n{2,}/.test(ig))
ok("…and no pad character at all", !ig.includes(PAD))
ok("the TikTok payload has NO bare blank line left", !/\n{2,}/.test(tt))
ok("…every section boundary is a padded line instead", tt.split("\n").filter((l) => l === PAD).length === 2)
ok("…and that is the only difference: strip the pads and the two agree",
  tt.split("\n").filter((l) => l !== PAD).join("\n") === ig.split("\n").filter((l) => l !== "").join("\n"))

// ── 2. THE WORDING, HASHTAGS AND CTA ARE UNTOUCHED ────────────────────────────────────────────
// The correction is spacing-only. Nothing here may change the text.
console.log("\ncontent is preserved exactly — this fix moves whitespace, nothing else:")
ok("both stored sentences survive verbatim",
  tt.includes("Moving to Dallas? I got you.") && tt.includes("My apartment locating service is completely free!"))
ok("the manual caption body is verbatim modulo pads", tt.startsWith(padTikTokSectionBreaks(STORED)))
ok("…and removing the pads yields the stored caption exactly",
  tt.replace(new RegExp(`\\n${PAD}\\n`, "g"), "\n\n").startsWith(STORED))
ok("the hashtag block is last, on its own line", tt.split("\n").at(-1)!.startsWith("#"))
ok(`no more than ${TIKTOK_MAX_HASHTAGS} hashtags`, (tt.match(/#/g) ?? []).length <= TIKTOK_MAX_HASHTAGS)
ok("no pad shares a line with a hashtag", !tt.split("\n").some((l) => l.includes("#") && l.includes(PAD)))
ok("the sentence order is unchanged",
  tt.indexOf("Moving to Dallas?") < tt.indexOf("completely free!"))

// ── 3. THE TEMPLATE OPENER IS NOW THREADED ────────────────────────────────────────────────────
// The second half of the fix. A MANUAL caption is returned verbatim, so this is invisible on the
// presenter post itself — it bites a template-drafted post whose caption is generator-owned.
console.log("\nthe overlay template now reaches the TikTok body (it did not before):")
const MT = "market_type_centered" as OverlayTemplate
const genNo = buildTikTokCaptionPayload({ ...base, caption: null })
const genWith = buildTikTokCaptionPayload({ ...base, caption: null, overlayTemplate: MT })
ok("a GENERATED caption's opener depends on the template", genNo !== genWith, "the parameter is being ignored")
ok("…and the template version is still padded, not raw", !/\n{2,}/.test(genWith) && genWith.includes(PAD))
ok("a MANUAL caption is unaffected by the template, as designed",
  buildTikTokCaptionPayload({ ...base, overlayTemplate: MT }) === tt)
ok("omitting the parameter still works (no caller is forced to change)", typeof genNo === "string" && genNo.length > 0)

// ── 4. THE GUARD: NO TIKTOK PATH MAY USE THE INSTAGRAM BUILDER ────────────────────────────────
console.log("\nevery TikTok publish path in the repo uses the TikTok formatter:")
for (const f of ["app/api/integrations/tiktok/publish/route.ts", "app/api/cron/social-tiktok-publish/route.ts"]) {
  const code = strip(readFileSync(f, "utf8"))
  ok(`${f.split("/").slice(-3).join("/")}: builds via buildTikTokCaptionPayload`, /buildTikTokCaptionPayload\(/.test(code))
  ok("…and never via buildInstagramCaptionPayload", !/buildInstagramCaptionPayload/.test(code))
  ok("…and passes the overlay template", /overlayTemplate:/.test(code))
  ok("…and selects overlay_template, or the pass-through is a silent null", /overlay_template/.test(code))
}
// The Instagram route is the mirror image: it must NOT be reachable for a TikTok destination.
{
  const dests = strip(readFileSync("lib/social/destinations.ts", "utf8"))
  const ttSpec = dests.slice(dests.indexOf("tiktok_video: {"))
  ok("tiktok_video is still NOT publishable through the Instagram route",
    /publish: "awaiting_approval"/.test(ttSpec.slice(0, 400)))
  const pubRoute = strip(readFileSync("app/api/admin/social-autopilot/posts/[id]/publish/route.ts", "utf8"))
  ok("…and that route refuses any destination whose publish is not supported",
    /publish !== "supported"/.test(pubRoute) && /destination_not_publishable/.test(pubRoute))
}

// ── 5. PRESENTER-AGNOSTIC ─────────────────────────────────────────────────────────────────────
// Point of the whole exercise: an AI presenter must not change one byte of the caption.
console.log("\nthe caption does not depend on the presenter:")
ok("buildTikTokCaptionPayload takes no presenter input at all",
  !/presenter/i.test(strip(readFileSync("lib/social/composePost.ts", "utf8")).slice(
    strip(readFileSync("lib/social/composePost.ts", "utf8")).indexOf("export function buildTikTokCaptionPayload"),
    strip(readFileSync("lib/social/composePost.ts", "utf8")).indexOf("export function buildTikTokCaptionPayload") + 1400)))
ok("the on-demand route's caption block reads no presenter column",
  !/presenter[a-z_]*\s*[,:]/.test(strip(readFileSync("app/api/integrations/tiktok/publish/route.ts", "utf8"))))

// ── 6. IDEMPOTENCE ────────────────────────────────────────────────────────────────────────────
console.log("\nre-padding can never accumulate invisible characters:")
ok("pad(pad(x)) === pad(x)", padTikTokSectionBreaks(padTikTokSectionBreaks(tt)) === padTikTokSectionBreaks(tt))
ok("the pad count is stable under repeats", [...padTikTokSectionBreaks(tt)].filter((c) => c === PAD).length === 2)
ok("the output of the builder is already a fixed point", padTikTokSectionBreaks(tt) === tt)

console.log(`\nTikTok caption spacing: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
