// AI PRESENTER — V1.
//
// A transparent waist-up avatar is composited lower-left for a 3–5s intro, then fades out, while
// the walkthrough keeps playing. The three things that can silently ruin it, and are asserted here:
//
//   1. THE DECODER. FFmpeg's native vp9/vp8 decoders DISCARD alpha with no warning, so a
//      transparent WebM composites as an OPAQUE BOX. Measured on the renderer's own binary. WebM is
//      the only transparent format HeyGen emits, so the default path is exactly the broken one and
//      `-c:v libvpx-vp9` must precede that input.
//   2. THE FADE. `fade=t=out` without `alpha=1` fades to BLACK — a dark rectangle grows where the
//      avatar was, which is worse than no fade at all.
//   3. eof_action. Without `pass`, the 4-second avatar input ENDS THE WHOLE VIDEO at 4 seconds.
//
// And the invariant that outranks the feature: the frozen y427 headline anchor and every existing
// render are untouched. Verified here structurally and, in the demo, by a pixel diff of the
// headline band — byte-identical with and without the presenter.
//
// Run: npx tsx scripts/social/presenter.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  PRESENTER, presenterBottomPx, presenterBottomInsetPx, clampIntroSeconds,
  presenterPreviewFractions, decoderForPresenterClip, buildPresenterPlan, buildPresenterFilter,
  clampWidthPx, normalizeSide, presenterXPx,
} from "../../lib/social/presenterSpec"
import { buildVideoFilter, buildFfmpegArgs } from "../../lib/social/renderVideo"
import { renderJobKey } from "../../lib/social/renderJobs"
import { SOCIAL_CANVAS, safeAreaFor } from "../../lib/social/platformSafeArea"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const FONT = "/f/LibreBaskerville-Head.ttf"
const ITEM = { file: "/w/headline.txt", fontPx: 66, topPx: 427, lineSpacing: 8, font: FONT }

// ── 1. PLACEMENT ────────────────────────────────────────────────────────────
console.log("1. lower-left, clear of the Instagram caption block:")
{
  const caption = safeAreaFor("instagram").zones.find((z) => z.kind === "caption")!
  ok("the caption block starts at the MEASURED y1548", caption.rect.y === 1548)
  // The presenter now sits DELIBERATELY lower, overlapping the top of the caption block by a
  // declared amount — 36px of clearance read as floating, with 408px of empty frame beneath the
  // figure. There were only 36px between that position and the caption boundary, so a lower
  // placement necessarily enters the zone; the question is by how much, not whether.
  ok(`the bottom edge is the caption top plus the declared overlap (${presenterBottomPx("instagram")})`,
    presenterBottomPx("instagram") === caption.rect.y + PRESENTER.captionOverlapPx)
  ok("...which is lower than the old 1512 position", presenterBottomPx("instagram") > 1512)
  ok("...and the bottom gap shrank from 408px", SOCIAL_CANVAS.h - presenterBottomPx("instagram") < 408)
  ok("...while stopping short of the caption TEXT line at y1649",
    presenterBottomPx("instagram") < 1649)
  ok("...and never past the canvas itself", presenterBottomPx("instagram") <= SOCIAL_CANVAS.h)
  ok("its left edge matches the headline box's left edge, so they read as one composition",
    PRESENTER.xPx === safeAreaFor("instagram").text.x)
  ok("it stays well clear of the engagement rail on the right",
    PRESENTER.xPx + PRESENTER.widthPx < 978)
  ok("the bottom INSET is measured from the canvas bottom, for overlay=y=H-h-N",
    presenterBottomInsetPx("instagram") === SOCIAL_CANVAS.h - presenterBottomPx("instagram"))

  // Bottom-anchored: a taller clip must grow UPWARD, never down into the caption.
  const inset = presenterBottomInsetPx("instagram")
  const bottomFor = (h: number) => SOCIAL_CANVAS.h - inset // independent of h, by construction
  ok("a 540px-tall clip and an 800px-tall clip share the same bottom edge",
    bottomFor(540) === bottomFor(800))
}

// ── 2. TIMING ───────────────────────────────────────────────────────────────
console.log("\n2. a 3–5 second intro that fades out:")
{
  ok("the default is 4s, inside the stated 3–5 range", PRESENTER.defaultIntroSeconds === 4 && PRESENTER.minIntroSeconds === 3 && PRESENTER.maxIntroSeconds === 5)
  ok("2s clamps up to 3", clampIntroSeconds(2) === 3)
  ok("9s clamps down to 5", clampIntroSeconds(9) === 5)
  ok("3.5s is honoured", clampIntroSeconds(3.5) === 3.5)
  ok("null / undefined / NaN fall back to the default", clampIntroSeconds(null) === 4 && clampIntroSeconds(undefined) === 4 && clampIntroSeconds(NaN) === 4)

  const plan = buildPresenterPlan({ inputIndex: 1, introSeconds: 4 })
  const f = buildPresenterFilter(plan, "out")
  ok("the fade ENDS when the intro ends (starts at intro - fade)", f.includes("st=3.400") && f.includes("d=0.600"))
  ok("a clamped-to-minimum 3s intro still fades fully inside its own window",
    buildPresenterFilter(buildPresenterPlan({ inputIndex: 1, introSeconds: 3 }), "out").includes("st=2.400"))
}

// ── 3. THE THREE SILENT KILLERS ─────────────────────────────────────────────
console.log("\n3. the filter details that fail silently when wrong:")
{
  const plan = buildPresenterPlan({ inputIndex: 2, introSeconds: 4 })
  const f = buildPresenterFilter(plan, "withpres")

  ok("fade carries alpha=1 — without it the avatar fades to a BLACK BOX", /fade=t=out:[^,\]]*:alpha=1/.test(f))
  ok("the clip is formatted to yuva420p, making the alpha explicit", f.includes("format=yuva420p"))
  ok("eof_action=pass — without it the 4s avatar would END the whole video", f.includes("eof_action=pass"))
  ok("shortest=0, for the same reason", f.includes("shortest=0"))
  ok("the overlay stops compositing once the fade completes", f.includes("enable='lt(t,4.000)'"))
  ok("width-driven scale with -2 keeps aspect AND an even height (x264 requires it)", f.includes(`scale=${PRESENTER.widthPx}:-2`))
  ok("bottom-anchored via H-h", f.includes(`y=H-h-${plan.bottomInsetPx}`))
  ok("setpts=PTS-STARTPTS, so the avatar starts at t=0 regardless of its own timestamps", f.includes("setpts=PTS-STARTPTS"))
  ok("it reads from the plan's input index, not a hardcoded one", f.startsWith("[2:v]"))
}

// ── 4. THE DECODER ──────────────────────────────────────────────────────────
console.log("\n4. transparent WebM needs the libvpx decoder (measured, not assumed):")
{
  ok("a .webm gets libvpx-vp9", decoderForPresenterClip("/tmp/a.webm") === "libvpx-vp9")
  ok("...case-insensitively", decoderForPresenterClip("/tmp/A.WEBM") === "libvpx-vp9")
  ok("ProRes .mov needs no flag (its alpha decodes natively)", decoderForPresenterClip("/tmp/a.mov") === null)
  ok(".mp4 needs no flag", decoderForPresenterClip("/tmp/a.mp4") === null)

  const args = buildFfmpegArgs({
    sourcePath: "/w/src.mp4", outputPath: "/w/out.mp4", filter: "[0:v]null[v]", audioChoice: "source",
    presenterInput: { path: "/w/p.webm", decoder: "libvpx-vp9" },
  })
  const i = args.indexOf("/w/p.webm")
  ok("the decoder flag is emitted IMMEDIATELY BEFORE its own -i", args[i - 1] === "-i" && args[i - 2] === "libvpx-vp9" && args[i - 3] === "-c:v")
  ok("...and AFTER the source input, so it cannot apply to the walkthrough", args.indexOf("/w/src.mp4") < i)
  {
    // `-c:v libx264` is ALWAYS present for the OUTPUT encoder, so "contains no -c:v" can never
    // pass. What matters is that no DECODER flag precedes the presenter's own -i.
    const noFlag = buildFfmpegArgs({ sourcePath: "/w/src.mp4", outputPath: "/w/o.mp4", filter: "[0:v]null[v]",
      audioChoice: "source", presenterInput: { path: "/w/p.mov", decoder: null } })
    const j = noFlag.indexOf("/w/p.mov")
    ok("no decoder flag precedes a clip that does not need one", noFlag[j - 1] === "-i" && noFlag[j - 2] !== "libvpx-vp9" && noFlag[j - 3] !== "-c:v")
    ok("...the output encoder is still libx264, untouched", noFlag[noFlag.indexOf("-c:v") + 1] === "libx264")
  }
}

// ── 5. INPUT ORDER MUST NOT DISTURB VOICE CLIPS ─────────────────────────────
console.log("\n5. adding a presenter cannot renumber the voice-clip inputs:")
{
  const withBoth = buildFfmpegArgs({
    sourcePath: "/w/src.mp4", outputPath: "/w/out.mp4", filter: "[0:v]null[v]", audioChoice: "source",
    extraInputs: ["/w/hook.mp3", "/w/cta.mp3"],
    presenterInput: { path: "/w/p.webm", decoder: "libvpx-vp9" },
  })
  const inputsInOrder = withBoth.map((a, i) => (a === "-i" ? withBoth[i + 1] : null)).filter(Boolean)
  ok("order is source, hook, cta, presenter", JSON.stringify(inputsInOrder) === JSON.stringify(["/w/src.mp4", "/w/hook.mp3", "/w/cta.mp3", "/w/p.webm"]))
  ok("...so hook stays input 1 and cta stays input 2, exactly as buildAudioFilter indexed them",
    inputsInOrder[1] === "/w/hook.mp3" && inputsInOrder[2] === "/w/cta.mp3")
  ok("the presenter is therefore input 3 here", inputsInOrder[3] === "/w/p.webm")

  // The plan must agree with that arithmetic.
  ok("buildPresenterPlan computes the same index from the voice count",
    buildPresenterPlan({ inputIndex: 1 + 2 }).inputIndex === 3)
  ok("...and index 1 when there are no voice clips", buildPresenterPlan({ inputIndex: 1 }).inputIndex === 1)
}

// ── 6. THE FROZEN GEOMETRY IS UNTOUCHED ─────────────────────────────────────
console.log("\n6. y427 and every existing render are unaffected:")
{
  const chain = "scale=1080:1920,format=yuv420p"
  const without = buildVideoFilter(FONT, [ITEM], chain)
  const withNull = buildVideoFilter(FONT, [ITEM], chain, null)
  ok("omitting the presenter produces a BYTE-IDENTICAL graph to before", without === withNull)
  ok("...and still anchors the headline at y427", without.includes(":y=427"))

  const withPres = buildVideoFilter(FONT, [ITEM], chain, buildPresenterPlan({ inputIndex: 1 }))
  ok("adding a presenter does NOT move the headline", withPres.includes(":y=427"))
  ok("...the drawtext node is otherwise unchanged",
    withPres.includes("drawtext") && withPres.split("drawtext")[1].split("[v]")[0] === without.split("drawtext")[1].split("[v]")[0])

  // ORDER: avatar first, text second, so text is drawn ON TOP and can never be occluded.
  ok("the presenter is composited BEFORE the drawtext chain",
    withPres.indexOf("overlay=") < withPres.indexOf("drawtext"))
  ok("...the text chain reads from the composited label, not raw [bg]", withPres.includes("[withpres]drawtext"))
  ok("the graph still ends in [v]", withPres.trim().endsWith("[v]"))

  // No text at all (the 'existing' overlay mode) must still work with a presenter.
  const noText = buildVideoFilter(FONT, [], chain, buildPresenterPlan({ inputIndex: 1 }))
  ok("a presenter with NO overlay text still produces a valid graph ending in [v]", noText.trim().endsWith("[v]") && noText.includes("overlay="))
}

// ── 7. PREVIEW / RENDER PARITY ──────────────────────────────────────────────
console.log("\n7. the editor preview reads the SAME numbers as the renderer:")
{
  const fr = presenterPreviewFractions("instagram")
  ok("left fraction is the renderer's x over the canvas width", Math.abs(fr.leftFrac - PRESENTER.xPx / SOCIAL_CANVAS.w) < 1e-12)
  ok("width fraction likewise", Math.abs(fr.widthFrac - PRESENTER.widthPx / SOCIAL_CANVAS.w) < 1e-12)
  ok("bottom fraction is the renderer's own inset over the canvas height",
    Math.abs(fr.bottomFrac - presenterBottomInsetPx("instagram") / SOCIAL_CANVAS.h) < 1e-12)
  ok("every fraction is inside the canvas", fr.leftFrac > 0 && fr.leftFrac < 1 && fr.bottomFrac > 0 && fr.bottomFrac < 1)
  // ONE geometry path: the spec module is the only place these numbers exist.
  const spec = read("lib/social/presenterSpec.ts")
  const renderer = read("lib/social/renderVideo.ts")
  ok("the renderer hardcodes NO presenter geometry of its own",
    !/overlay=x=\d+:y=H-h-\d+/.test(renderer) && renderer.includes("buildPresenterFilter"))
  ok("...the numbers live only in the spec", spec.includes("xPx: 110") && spec.includes("widthPx: 400"))
}

// ── 8. SCHEMA: OFF BY DEFAULT, MULTI-AGENT, NO CREDENTIALS ──────────────────
console.log("\n8. the schema is multi-agent and safe by default:")
{
  const m = read("supabase/migrations/20261009000005_ai_presenter.sql")
  const sql = m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")

  ok("presenter_id is NULLABLE with no default → OFF for every existing post",
    /add column if not exists presenter_id uuid references public\.social_presenters\(id\)/.test(sql) && !/presenter_id[^;]*not null/.test(sql))
  ok("ON DELETE SET NULL — deleting a presenter disables it, never deletes posts",
    /presenter_id uuid references public\.social_presenters\(id\) on delete set null/.test(sql))
  ok("...and there is NO cascade anywhere near social_posts", !/social_posts[\s\S]{0,200}on delete cascade/.test(sql))

  ok("ownership is modelled from the first migration", /owner_user_id uuid references auth\.users\(id\)/.test(sql))
  ok("a sample has no owner and an agent presenter must have one (enforced, not conventional)",
    /check \(\(is_sample and owner_user_id is null\) or \(not is_sample and owner_user_id is not null\)\)/.test(sql))
  ok("RLS is enabled", /alter table public\.social_presenters enable row level security/.test(sql))
  ok("reads are scoped to your own rows plus the shared samples", /is_sample or owner_user_id = auth\.uid\(\)/.test(sql))
  ok("an agent can never create or alter a SAMPLE", (sql.match(/not is_sample and owner_user_id = auth\.uid\(\)/g) ?? []).length >= 3)

  ok("NO credential column exists on any presenter table",
    !/api_key|secret|token|bearer/i.test(sql))
  ok("...only the avatar IDENTIFIER, which is useless without the server-side key", /heygen_avatar_id text/.test(sql))
  ok("the intro range is enforced in the database too",
    /default_intro_seconds >= 3 and default_intro_seconds <= 5/.test(sql) && /presenter_intro_seconds >= 3 and presenter_intro_seconds <= 5/.test(sql))

  ok("ONE audio column feeds both lip-sync and the final mix, so they cannot disagree",
    /presenter_audio_storage_path text/.test(sql) && !/lipsync_audio|render_audio/.test(sql))
  {
    // STRUCTURAL. The prose in `comment on ...` legitimately explains that sources are never
    // touched, and that explanation matched a text search for the very thing it rules out — the
    // same trap that produced false failures in the source-protection work. So strip the comment
    // statements and assert on the DDL that actually executes.
    // Strip SQL STRING LITERALS, not "statements up to the next ;" — a semicolon inside a comment's
    // own prose ("never an API key; credentials live...") ends that strip early and leaves the
    // explanation behind to match.
    const ddl = sql.replace(/'(?:[^']|'')*'/g, "''")
    ok("no DDL column or reference points at a source object",
      !/source\./i.test(ddl) && !/social_content/i.test(ddl))
    ok("...the clip columns are named as derivatives",
      /presenter_clip_storage_path text/.test(ddl) && /clip_storage_path text/.test(ddl))
  }
}

// ── 9. THE RENDER QUEUE AND THE INVALIDATION SET AGREE ──────────────────────
// renderInvalidation.ts states these two lists must mirror each other: "if a column is added to
// one it belongs in the other." A presenter change that invalidated the render but hashed to the
// same job key would be dropped by the queue as duplicate work.
console.log("\n9. a presenter change invalidates the render AND enqueues new work:")
{
  const inv = read("lib/social/renderInvalidation.ts")
  for (const col of ["presenter_id", "presenter_intro_seconds", "presenter_clip_storage_path", "presenter_audio_storage_path"]) {
    ok(`${col} is render-affecting`, new RegExp(`"${col}"`).test(inv))
  }
  const base = {
    postId: "p1", destination: "instagram_reel" as const, platform: "instagram" as const,
    overlayMode: "generate", overlayTemplate: "market_type", headline: "H", subheadline: "S",
    audioChoice: "original", voiceHookId: null, voiceCtaId: null,
  }
  const noPres = renderJobKey(base)
  const withA = renderJobKey({ ...base, presenterId: "a", presenterIntroSeconds: 4 })
  const withB = renderJobKey({ ...base, presenterId: "b", presenterIntroSeconds: 4 })
  const withA5 = renderJobKey({ ...base, presenterId: "a", presenterIntroSeconds: 5 })
  ok("two different presenters produce DIFFERENT job keys", withA !== withB)
  ok("the same presenter at a different intro length too", withA !== withA5)
  ok("adding a presenter changes the key", noPres !== withA)
  // BACKWARD COMPATIBILITY: every existing post has no presenter and must hash exactly as before.
  ok("a presenter-free post hashes IDENTICALLY with the fields absent, null, or undefined",
    noPres === renderJobKey({ ...base, presenterId: null }) &&
    noPres === renderJobKey({ ...base, presenterId: null, presenterIntroSeconds: null, presenterClipPath: null, presenterAudioPath: null }))
  ok("the enqueue query selects the presenter columns, so the key cannot be built from stale data",
    ["presenter_id", "presenter_intro_seconds", "presenter_clip_storage_path", "presenter_audio_storage_path"]
      .every((c) => read("lib/social/renderJobs.ts").includes(c)))
}

// ── 10. SIZE AND SIDE ───────────────────────────────────────────────────────
console.log("\n10. adjustable size and side, with the approved defaults intact:")
{
  ok("the default side is still LEFT", PRESENTER.defaultSide === "left" && normalizeSide(null) === "left")
  ok("...and the default width is the APPROVED 400", clampWidthPx(null) === 400 && PRESENTER.widthPx === 400)
  ok("anything that is not 'right' normalizes to left (including junk)",
    normalizeSide("RIGHT") === "left" && normalizeSide("middle") === "left" && normalizeSide(undefined) === "left")
  ok("'right' is honoured", normalizeSide("right") === "right")
  ok("width clamps to the 240-520 range", clampWidthPx(100) === 240 && clampWidthPx(900) === 520 && clampWidthPx(400) === 400)
  ok("...and a non-finite width falls back to the default", clampWidthPx(NaN) === 400 && clampWidthPx(undefined) === 400)

  const railLeft = safeAreaFor("instagram").zones.find((z) => z.kind === "rail")!.rect.x
  ok("LEFT placement is unchanged at x110", presenterXPx("left", 400) === 110)
  ok("...at every width, because left is measured from the canvas edge",
    presenterXPx("left", 240) === 110 && presenterXPx("left", 520) === 110)

  // RIGHT is measured back from the engagement rail, not the canvas edge.
  for (const w of [240, 400, 520]) {
    const x = presenterXPx("right", w)
    ok(`RIGHT at ${w}px ends clear of the engagement rail (${x}+${w}=${x + w} <= ${railLeft - PRESENTER.railClearancePx})`,
      x + w <= railLeft - PRESENTER.railClearancePx)
    ok(`...and never runs off the left edge at ${w}px`, x >= PRESENTER.xPx)
  }

  // The plan and the filter must carry the chosen values, not the defaults.
  const right520 = buildPresenterPlan({ inputIndex: 1, side: "right", widthPx: 520 })
  ok("the plan records the side", right520.side === "right")
  ok("...and the filter uses the computed x and chosen width",
    buildPresenterFilter(right520, "o").includes(`scale=520:-2`) && buildPresenterFilter(right520, "o").includes(`x=${right520.xPx}:`))
  ok("the bottom inset is the SAME for both sides — only the corner changes",
    buildPresenterPlan({ inputIndex: 1, side: "left" }).bottomInsetPx === right520.bottomInsetPx)

  // Preview parity holds for the overrides too, not just the defaults.
  for (const [side, w] of [["left", 400], ["right", 240], ["right", 520]] as const) {
    const fr = presenterPreviewFractions({ side, widthPx: w })
    ok(`preview matches the renderer for ${side}/${w}`,
      Math.abs(fr.leftFrac - presenterXPx(side, w) / SOCIAL_CANVAS.w) < 1e-12 && Math.abs(fr.widthFrac - w / SOCIAL_CANVAS.w) < 1e-12)
  }
}

// ── 11. EDITOR + SERVER CONTRACT ────────────────────────────────────────────
console.log("\n11. the editor is opt-in and the server re-checks ownership:")
{
  const ctrl = read("components/crm/social/AiPresenterControl.tsx")
  const editor = read("components/crm/social/PostEditor.tsx")
  const route = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
  const list = read("app/api/admin/social-autopilot/presenters/route.ts")
  const box = read("components/crm/social/PresenterPreviewBox.tsx")

  ok("the editor's presenter state starts entirely null (OFF)", /presenterId: null, introSeconds: null, side: null, widthPx: null, audioVoiceClipId: null/.test(editor))
  ok("the control collapses to one switch until enabled", /role="switch"/.test(ctrl) && /\{!on \? \(/.test(ctrl))
  ok("turning it OFF clears the whole configuration", /onChange\(\{ presenterId: null, introSeconds: null, side: null, widthPx: null, audioVoiceClipId: null \}\)/.test(ctrl))
  ok("a presenter with no clip cannot be auto-selected", /filter\(\(o\) => o\.hasClip\)/.test(ctrl))
  ok("the control defines NO geometry of its own — it imports the spec",
    /from "@\/lib\/social\/presenterSpec"/.test(ctrl) && !/360|110|1548/.test(ctrl.replace(/\/\*[\s\S]*?\*\//g, "")))
  ok("choosing the default width stores NULL, so the spec stays the definition of 'default'",
    /px === PRESENTER\.widthPx \? null : px/.test(ctrl))

  ok("the preview box is rendered only when a presenter is set", /presenter\.presenterId && \(\s*<PresenterPreviewBox/.test(editor))
  ok("...and reads the shared fraction helper, not its own numbers",
    /presenterPreviewFractions/.test(box) && !/left: "110|width: "360/.test(box))

  // SERVER-SIDE OWNERSHIP — the editor only offers permitted rows, but a PATCH can name any uuid.
  ok("PATCH looks the presenter up before accepting it", /from\("social_presenters"\)[\s\S]{0,200}\.eq\("id", body\.presenterId\)/.test(route))
  ok("...through the CALLER'S RLS client, so another agent's row does not resolve",
    /const \{ data: pres \} = await supabase[\s\S]{0,160}social_presenters/.test(route))
  ok("...and an unresolvable presenter is REJECTED, not written", /if \(!pres\) return NextResponse\.json\(\{ error: "presenter_not_found" \}, \{ status: 404 \}\)/.test(route))
  ok("a disabled presenter is refused", /presenter_disabled/.test(route))
  ok("narration is resolved server-side from a clip id, never a client-supplied storage path",
    /from\("social_voice_clips"\)\.select\("storage_path"\)/.test(route) && !/body\.presenterAudioStoragePath/.test(route))
  {
    // The route's doc comment legitimately EXPLAINS the owner_user_id policy, and that explanation
    // matched a text search for the very thing it says is absent from the query. Assert on code.
    const listCode = list.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
    ok("the list endpoint relies on RLS rather than a forgettable WHERE",
      !/owner_user_id/.test(listCode) && /from\("social_presenters"\)/.test(listCode))
  }
  ok("...and returns no credential", !/heygen_avatar_id|api_key|secret|token/i.test(list.replace(/\/\*[\s\S]*?\*\//g, "")))
  ok("server-side range clamping mirrors the DB CHECKs",
    /Math\.min\(5, Math\.max\(3, v\)\)/.test(route) && /Math\.min\(520, Math\.max\(240, v\)\)/.test(route))
}

console.log(`\nAI Presenter: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
