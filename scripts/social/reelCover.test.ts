/**
 * SOCIAL BEAST — Reel cover selection.
 *
 * Instagram picked the cover frame itself because the container request only ever carried
 * media_type / video_url / caption. Two ways to decide it now, and the whole feature rests on one
 * rule being applied identically in three places — the manual publish route, the cron worker, and
 * the dry run that CLAIMS to preview what those two send:
 *
 *   exactly one cover parameter is sent, and a custom cover wins.
 *
 * Meta happens to resolve cover_url over thumb_offset the same way, but a dry run that showed both
 * could not honestly say which took effect — so the choice is ours, and asserted here.
 *
 * Run: npx tsx scripts/social/reelCover.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { chooseCover, describeCover, resolveReelCover } from "@/lib/social/reelCover"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const IG = "lib/social/instagram.ts"
const PUB = "app/api/admin/social-autopilot/posts/[id]/publish/route.ts"
const WORKER = "app/api/cron/social-instagram-publish/route.ts"
const DRY = "lib/social/dryRun.ts"
const POSTS = "app/api/admin/social-autopilot/posts/[id]/route.ts"
const UI = "components/crm/social/ReelCoverControl.tsx"
const MIG = "supabase/manual/20261005_social_posts_reel_cover.sql"

async function main() {
  console.log("\nREEL COVER SELECTION\n")

  const ig = strip(read(IG))
  const pub = strip(read(PUB))
  const worker = strip(read(WORKER))
  const dry = strip(read(DRY))
  const posts = strip(read(POSTS))
  const ui = strip(read(UI))
  const mig = read(MIG)

  console.log("PRECEDENCE — CUSTOM COVER WINS:")
  {
    ok("custom path alone → custom", chooseCover("a/b/c.jpg", null).kind === "custom")
    ok("offset alone → offset", chooseCover(null, 3200).kind === "offset")
    ok("BOTH set → custom wins", chooseCover("a/b/c.jpg", 3200).kind === "custom")
    ok("neither → none (Instagram picks, as today)", chooseCover(null, null).kind === "none")
    ok("an empty/whitespace path is not a cover", chooseCover("   ", null).kind === "none")
    // A bad offset must not reach Meta: a rejected container is worse than Meta's default frame.
    ok("a negative offset is ignored", chooseCover(null, -1).kind === "none")
    ok("NaN / Infinity are ignored", chooseCover(null, NaN).kind === "none" && chooseCover(null, Infinity).kind === "none")
    ok("zero is a VALID offset (first frame)", chooseCover(null, 0).kind === "offset")
    const c = chooseCover(null, 3200.7)
    ok("a fractional offset is rounded to whole ms", c.kind === "offset" && c.ms === 3201)
  }

  console.log("\nEXACTLY ONE PARAMETER IS SENT:")
  {
    // The union type makes "both" unrepresentable; this asserts the call site honours it.
    ok("createReelContainer takes an optional cover", /cover\?: ReelCover \| null/.test(ig))
    ok("cover_url is set ONLY for kind 'url'", /if \(cover\?\.kind === "url"\) body\.set\("cover_url", cover\.url\)/.test(ig))
    ok("thumb_offset is set ONLY for kind 'offset'", /else if \(cover\?\.kind === "offset"\) body\.set\("thumb_offset", String\(cover\.ms\)\)/.test(ig))
    ok("…as an else-if, so both can never be set", /cover_url[\s\S]{0,80}else if[\s\S]{0,80}thumb_offset/.test(ig))
    ok("omitting the cover keeps today's behaviour (neither param)",
      !/body\.set\("cover_url"[^)]*\)\s*\n\s*body\.set\("thumb_offset"/.test(ig))

    // Behavioural: resolve both kinds and confirm the shape handed to the container.
    const off = await resolveReelCover(chooseCover(null, 1500), async () => "unused")
    ok("an offset resolves without signing anything", off?.kind === "offset" && off.ms === 1500)
    let signed = 0
    const cus = await resolveReelCover(chooseCover("p/q.jpg", null), async () => { signed++; return "https://signed" })
    ok("a custom cover signs exactly once", signed === 1 && cus?.kind === "url")
    // A custom cover that cannot be signed must NOT silently fall back to a different frame.
    const failed = await resolveReelCover(chooseCover("p/q.jpg", 999), async () => null)
    ok("an unsignable custom cover resolves to null, not to the offset", failed === null)
    ok("…and 'none' resolves to null", (await resolveReelCover(chooseCover(null, null), async () => "x")) === null)
  }

  console.log("\nALL THREE PATHS USE THE SAME CHOOSER:")
  {
    for (const [name, src] of [["publish route", pub], ["cron worker", worker], ["dry run", dry]] as const) {
      ok(`${name} imports the shared chooser`, /chooseCover/.test(src))
    }
    ok("the publish route passes the cover to the container",
      /createReelContainer\([^)]*dest\.token, cover\)/.test(pub))
    ok("the worker passes the cover to the container",
      /createReelContainer\([^)]*dest\.token, cover\)/.test(worker))
    ok("neither builds its own precedence rule",
      !/cover_storage_path \?\?|cover_storage_path \|\|/.test(pub) && !/cover_storage_path \?\?|cover_storage_path \|\|/.test(worker))
    // An unsignable custom cover is surfaced, not swallowed, in BOTH publish paths.
    ok("the publish route fails on an unsignable custom cover",
      /choice\.kind === "custom" && !cover/.test(pub))
    ok("the worker fails that post and continues", /choice\.kind === "custom" && !cover/.test(worker) && /await fail\(postId, "custom cover could not be signed"\)/.test(worker))
  }

  console.log("\nTHE DRY RUN NAMES THE ACTUAL PARAMETER:")
  {
    ok("it reports a cover field", /cover: describeCover\(coverChoice\)/.test(dry))
    ok("…and the kind", /coverKind: coverChoice\.kind/.test(dry))
    ok("…computed from the SAME chooser", /const coverChoice = chooseCover\(p\.cover_storage_path, p\.cover_thumb_offset_ms\)/.test(dry))
    // The description must name the real Graph parameter, not a vague "a cover".
    ok("custom is described as cover_url", describeCover(chooseCover("a.jpg", null)).includes("cover_url"))
    ok("offset is described as thumb_offset with the ms", describeCover(chooseCover(null, 2500)).includes("thumb_offset") && describeCover(chooseCover(null, 2500)).includes("2500ms"))
    ok("none says Instagram selects it", /Instagram selects/.test(describeCover(chooseCover(null, null))))
  }

  console.log("\nA COVER NEVER INVALIDATES THE RENDER:")
  {
    // The whole point of rule 5: choosing a cover is metadata, not a render input.
    // The real claim is COUPLING, not textual proximity: no cover branch may set renderAffecting.
    // (The cover block sits between the flag's declaration and its use, so a naive slice would
    // fail on position alone while proving nothing.)
    const coverBranches = posts
      .split("\n")
      .filter((l) => /coverThumbOffsetMs|coverStoragePath|cover_thumb_offset_ms|cover_storage_path|cover_render_version/.test(l))
    ok("no cover branch sets renderAffecting",
      coverBranches.length > 0 && coverBranches.every((l) => !/renderAffecting\s*=\s*true/.test(l)),
      coverBranches.filter((l) => /renderAffecting/.test(l)).join(" | "))
    // And the flag is genuinely still driven by the real render inputs.
    ok("…while overlay/audio fields still DO set it",
      /overlayTemplate[\s\S]{0,160}renderAffecting = true/.test(posts) || /audioChoice[\s\S]{0,160}renderAffecting = true/.test(posts))
    ok("the cover fields ARE accepted by PATCH",
      /if \("coverThumbOffsetMs" in body\)/.test(posts) && /if \("coverStoragePath" in body\)/.test(posts))
    ok("a negative offset is rejected at the API", /invalid coverThumbOffsetMs/.test(posts))
    ok("null clears the selection", /if \(v === null\) patch\.cover_thumb_offset_ms = null/.test(posts))
  }

  console.log("\nTHE RE-RENDER HINT IS TRUTHFUL, NOT A GUESS:")
  {
    // Knowing "was this re-rendered since the frame was chosen?" requires recording WHICH render
    // it was chosen against — render_version > 1 would be wrong whenever the frame came after.
    ok("the render version is stamped when a frame is chosen", /patch\.cover_render_version = /.test(posts))
    ok("…and cleared when the frame is cleared", /if \(body\.coverThumbOffsetMs === null\) patch\.cover_render_version = null/.test(posts))
    ok("the hint compares stamp vs current render_version",
      /r\.cover_render_version !== r\.render_version/.test(posts))
    ok("the offset is NEVER cleared by a re-render",
      !/render_status[\s\S]{0,200}cover_thumb_offset_ms = null/.test(posts))
    ok("the UI shows the exact approved wording",
      /Cover may have changed after re-render — review before publishing\./.test(ui))
    // Advisory only: nothing in the publish paths consults it.
    ok("publishing is NOT blocked by the hint",
      !/coverMayHaveShifted|cover_render_version/.test(pub) && !/coverMayHaveShifted|cover_render_version/.test(worker))
  }

  console.log("\nUI — ONE PREVIEW, COMPACT STRIP:")
  {
    const editor = read("components/crm/social/PostEditor.tsx")
    // The whole point of the refactor: no second player, no second scrubber.
    ok("the control renders NO video element of its own", !/<video/.test(ui))
    ok("…and no scrub slider of its own", !/type="range"/.test(ui))
    ok("it reads the EXISTING preview's position instead", /getCurrentMs\(\)/.test(ui))
    ok("the editor passes the live currentTime of its one preview",
      /previewVideoRef\.current/.test(editor) && /v\.currentTime \* 1000/.test(editor))
    ok("…from the element bound to the RENDERED derivative",
      /<video ref=\{previewVideoRef\} src=\{post\.renderedPreviewUrl!\}/.test(editor))
    // Gating uses the editor's own `rendered` flag, which already means
    // renderStatus==='ready' && renderedPreviewUrl && !overlayEdited — so a stale render cannot
    // be scrubbed for a cover.
    ok("gating reuses the editor's rendered flag", /renderReady=\{rendered\}/.test(editor))
    ok("the unrendered helper text is the approved wording",
      /Render video to choose a cover frame\./.test(ui))

    ok("the primary action is the approved label", /Use current frame as Reel cover/.test(ui))
    ok("a chosen frame shows the compact state", /✓ Reel cover: \{fmt\(p\.offsetMs\)\}/.test(ui))
    ok("…with Change and Clear", /&gt;Change&lt;|>Change</.test(ui) && />Clear</.test(ui))
    ok("Change re-reads the current frame", /onClick=\{useCurrentFrame\}[\s\S]{0,120}>Change</.test(ui))
    ok("custom cover is a secondary link", /Upload custom cover/.test(ui))
    ok("…with Replace and Remove once set", />Replace</.test(ui) && />Remove</.test(ui))
    ok("a small thumbnail is shown for a custom cover", /w-7 h-12 object-cover/.test(ui))
    ok("the editor mirrors custom-wins precedence", /const custom = !!p\.coverPath/.test(ui))
    ok("no re-render is triggered from the control", !/\/render/.test(ui))
    ok("the upload stays scoped to the signed-in user's folder",
      /auth\.user\?\.id/.test(ui) && /\$\{ownerId\}\/\$\{p\.contentId\}\/covers\//.test(ui))

    // The large panel is gone.
    ok("the big REEL COVER panel markup is removed",
      !/Cover frame position/.test(editor) && !/CUSTOM COVER \(OPTIONAL\)/.test(ui))
    ok("the editor still has exactly two videos (rendered + source fallback), not three",
      (editor.match(/<video/g) ?? []).length === 2)
  }

  console.log("\nPERSISTENCE + MIGRATION:")
  {
    ok("GET returns the offset", /coverThumbOffsetMs: /.test(posts))
    ok("…the custom path", /coverStoragePath: /.test(posts))
    ok("…and a signed preview URL for it", /coverPreviewUrl: await sign/.test(posts))
    ok("three nullable columns, no default",
      /add column if not exists cover_thumb_offset_ms integer/.test(mig) &&
      /add column if not exists cover_storage_path\s+text/.test(mig) &&
      /add column if not exists cover_render_version\s+integer/.test(mig))
    ok("a negative offset is impossible at the schema level",
      /cover_thumb_offset_ms is null or cover_thumb_offset_ms >= 0/.test(mig))
    ok("no backfill", !/\bupdate\s+public\.social_posts\b/i.test(mig))
    // Check the DDL, not the prose: the header explains WHY there is no cover_mode column, so a
    // naive grep matches the explanation and reports the opposite of the truth.
    const ddl = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    ok("no cover_mode column (the mode is derived, so it cannot disagree)", !/cover_mode/.test(ddl))
  }

  console.log("\nTIKTOK UNTOUCHED:")
  {
    const tt = read("app/api/integrations/tiktok/publish/route.ts")
    ok("the TikTok publish route knows nothing about covers",
      !/cover_url|thumb_offset|chooseCover|cover_storage_path/.test(tt))
    ok("the shared chooser mentions no TikTok", !/tiktok/i.test(strip(read("lib/social/reelCover.ts"))))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
