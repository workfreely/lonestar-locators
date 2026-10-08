// Social Beast — PREVIEW/RENDER SAFE-AREA PARITY.
//
// The invariant: the box a headline is FITTED INTO in the editor preview is the box it is fitted
// into by the FFmpeg burn-in, for the same post. Making the safe area per-platform created a way to
// break that silently — the render route reads post.platform and passes it, so a preview that
// omitted the argument would fit a TikTok post to Instagram's 860px while the burn-in used TikTok's
// 764px. Nothing would error; the published Reel would simply disagree with what was approved.
//
// These assertions therefore compare LAYOUTS, not constants, and they check the call sites too: a
// preview that stops forwarding its platform is the actual regression, and it is invisible to any
// test that only exercises computeOverlayLayout directly.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { computeOverlayLayout, headlineTextWidthPx } from "@/lib/social/overlaySpec"
import { textAvailPx, sideMarginPx, PLATFORM_SAFE_AREAS, DEFAULT_PLATFORM } from "@/lib/social/platformSafeArea"

let passed = 0
const failures: string[] = []
function ok(label: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

// Real conversational copy: one short hook that fits at the ceiling on both platforms, and one long
// enough that the narrower TikTok box must treat it differently from the wider Instagram box.
const SHORT = "POV: You upgraded your apartment"
const LONG = "This is what real rental home living looks like in San Antonio"
const DETAIL = "Starting at $2,500/month"
const TPL = "upgrade"

console.log("\nPREVIEW AND RENDER RESOLVE THE SAME LAYOUT (same input ⇒ same output):")
for (const platform of ["instagram", "tiktok"]) {
  for (const [name, headline] of [["short", SHORT], ["long", LONG]] as const) {
    // The preview calls computeOverlayLayout directly; renderReel calls the SAME function with the
    // platform it read from the post. Identical arguments must give an identical layout.
    const preview = computeOverlayLayout(TPL, headline, DETAIL, platform)
    const render = computeOverlayLayout(TPL, headline, DETAIL, platform)
    ok(`${platform}/${name}: identical font size`, preview.headline.fontPx === render.headline.fontPx)
    ok(`${platform}/${name}: identical line breaks`, JSON.stringify(preview.headline.lines) === JSON.stringify(render.headline.lines))
    ok(`${platform}/${name}: identical side margin`, preview.headline.sideMarginPx === render.headline.sideMarginPx)
    ok(`${platform}/${name}: identical detail size`, (preview.detail?.fontPx ?? 0) === (render.detail?.fontPx ?? 0))
  }
}

console.log("\nEACH PLATFORM IS FITTED TO ITS OWN BOX:")
for (const platform of ["instagram", "tiktok"]) {
  const avail = textAvailPx(platform)
  for (const [name, headline] of [["short", SHORT], ["long", LONG]] as const) {
    const l = computeOverlayLayout(TPL, headline, DETAIL, platform)
    const widest = Math.max(...l.headline.lines.map((ln) => headlineTextWidthPx(ln, l.headline.fontPx)))
    ok(`${platform}/${name}: every line fits the ${avail}px box`, widest <= avail)
    ok(`${platform}/${name}: margin matches the safe area`, l.headline.sideMarginPx === sideMarginPx(platform))
  }
}

// The whole point of per-platform fitting: the wider platform is NOT penalised by the narrower one.
// If this fails, something has gone back to a single strictest-shared box.
const igLong = computeOverlayLayout(TPL, LONG, DETAIL, "instagram")
const ttLong = computeOverlayLayout(TPL, LONG, DETAIL, "tiktok")
console.log("\nTHE WIDER PLATFORM IS NOT PENALISED BY THE NARROWER ONE:")
ok("Instagram's box is genuinely wider than TikTok's", textAvailPx("instagram") > textAvailPx("tiktok"))
ok("the same copy is NOT laid out identically on both", igLong.headline.fontPx !== ttLong.headline.fontPx || JSON.stringify(igLong.headline.lines) !== JSON.stringify(ttLong.headline.lines))
// NOT "Instagram's font is bigger": with this copy Instagram shrinks to 26px to hold ONE line
// (835px of its 860px box) while TikTok, unable to fit 764px, wraps to two lines and keeps the 38px
// ceiling. Larger text on the narrower platform is the fit-down-then-wrap rule working, not a bug.
// The real non-penalty guarantee is structural: the wider box never needs MORE lines.
ok("the wider box never needs more lines", igLong.headline.lines.length <= ttLong.headline.lines.length)
ok("Instagram holds this headline on one line", igLong.headline.lines.length === 1)
ok("TikTok cannot, so it wraps rather than shrinking past the floor", ttLong.headline.lines.length === 2)

console.log("\nINSTAGRAM USES THE MEASURED 860px BOX, BOTH SIDES:")
ok("the Instagram text box is 860px wide", textAvailPx("instagram") === 860)
ok("…with 110px margins", sideMarginPx("instagram") === 110)
ok("…and is the measured entry", PLATFORM_SAFE_AREAS.instagram.measured === true)
ok("a rendered Instagram layout reports the 110px margin", computeOverlayLayout(TPL, SHORT, DETAIL, "instagram").headline.sideMarginPx === 110)

console.log("\nTIKTOK USES THE TIKTOK BOX, BOTH SIDES:")
ok("the TikTok text box is 764px wide", textAvailPx("tiktok") === 764)
ok("…with 158px margins", sideMarginPx("tiktok") === 158)
ok("…and is flagged provisional, not measured", PLATFORM_SAFE_AREAS.tiktok.measured === false)
ok("a rendered TikTok layout reports the 158px margin", computeOverlayLayout(TPL, SHORT, DETAIL, "tiktok").headline.sideMarginPx === 158)

console.log("\nABSENT / UNKNOWN PLATFORM KEEPS THE SAFE FALLBACK:")
ok("the fallback is Instagram", DEFAULT_PLATFORM === "instagram")
const omitted = computeOverlayLayout(TPL, LONG, DETAIL)
const explicitIg = computeOverlayLayout(TPL, LONG, DETAIL, "instagram")
ok("omitting the platform equals Instagram", JSON.stringify(omitted) === JSON.stringify(explicitIg))
ok("undefined equals Instagram (the ?? undefined call shape)", JSON.stringify(computeOverlayLayout(TPL, LONG, DETAIL, undefined)) === JSON.stringify(explicitIg))
ok("an unknown platform falls back, it does not throw", JSON.stringify(computeOverlayLayout(TPL, LONG, DETAIL, "myspace")) === JSON.stringify(explicitIg))

// ── THE CALL SITES ───────────────────────────────────────────────────────────────────────────
// Guard the wiring itself. Every consumer of computeOverlayLayout must pass a platform; a new
// preview that forgets to is exactly the regression this file exists to prevent.
console.log("\nEVERY PREVIEW CALL SITE FORWARDS A PLATFORM:")
const editor = read("components/crm/social/PostEditor.tsx")
const client = read("components/crm/social/SocialAutopilotClient.tsx")
const bulk = read("components/crm/social/BulkReview.tsx")
const render = read("lib/social/renderVideo.ts")
// The render body now lives in lib/social/renderPost.ts — ONE implementation shared by the
// interactive admin route and the bulk queue worker. These assertions follow it there, which
// also means they now cover the BULK path, not just the interactive one.
const route = read("lib/social/renderPost.ts")

ok("PostEditor passes post.platform", /computeOverlayLayout\(overlayTemplate, headline, overlayDetail, post\.platform\)/.test(editor))
ok("…not the UI-only platform selector", !/computeOverlayLayout\([^)]*selectedPlatforms/.test(editor))
ok("the library card preview passes the draft's platform", /computeOverlayLayout\(tpl, headline, newest\.overlaySubheadline \?\? "", newest\.platform \?\? undefined\)/.test(client))
ok("…and the rollup actually carries platform", /platform: p\.platform \?\? null,/.test(client))
ok("BulkReview passes an explicit platform", /computeOverlayLayout\([^)]*DEFAULT_PLATFORM\)/.test(bulk))
ok("renderVideo passes the input platform", /computeOverlayLayout\([\s\S]*?input\.platform \?\? "instagram"\)/.test(render))
ok("the render route selects platform from the post", /\.select\("id, platform,/.test(route))
ok("…and forwards it to renderReel", /platform: \(p\.platform as string \| null\) \?\? "instagram"/.test(route))

// Count the REAL call sites so a NEW one cannot be added without this test noticing. Comment lines
// are excluded — SocialAutopilotClient's docblock quotes the expression it mirrors, and counting
// that as a call site would make this assertion pass for the wrong reason.
const callSiteLines = [editor, client, bulk, render].flatMap((src) =>
  src.split("\n").filter((ln) => ln.includes("computeOverlayLayout(") && !/^\s*(\/\/|\*|\/\*)/.test(ln)))
ok("exactly 4 live computeOverlayLayout call sites (add a new one ⇒ wire it here too)", callSiteLines.length === 4)
ok("…and every one of them passes a platform argument", callSiteLines.every((ln) =>
  /post\.platform|newest\.platform|DEFAULT_PLATFORM|input\.platform/.test(ln)))

// BulkReview's explicit default is only correct while post creation is single-platform.
console.log("\nBULK REVIEW'S DEFAULT STILL MATCHES WHAT POST CREATION ASSIGNS:")
const postsRoute = read("app/api/admin/social-autopilot/posts/route.ts")
ok("new posts are still created as Instagram", /const platform = "instagram"/.test(postsRoute))
ok("…which is DEFAULT_PLATFORM, the value BulkReview previews", DEFAULT_PLATFORM === "instagram")

console.log("\nTHE DEAD MARGIN CONSTANT IS GONE:")
const spec = read("lib/social/overlaySpec.ts")
ok("HOOK_SIDE_MARGIN_PX is removed", !/export const HOOK_SIDE_MARGIN_PX/.test(spec))
ok("…and nothing imports it", ![editor, client, bulk, render].some((s) => /HOOK_SIDE_MARGIN_PX/.test(s)))
ok("the live margin still comes from sideMarginPx(platform)", /sideMarginPx: sideMarginPx\(platform\)/.test(spec))
ok("HOOK_TEXT_AVAIL_PX is KEPT (still consumed by the composer tests)", /export const HOOK_TEXT_AVAIL_PX/.test(spec))

console.log(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length) { for (const f of failures) console.log(`  FAILED: ${f}`); process.exit(1) }
