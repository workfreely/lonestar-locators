/**
 * THE CTA PRESENTER WINDOW — the rules, not the pixels.
 *
 *   npx tsx scripts/social/presenterCta.test.ts
 *
 * The pixels are proven by presenterCtaDemo.ts, which renders real footage with real recordings and
 * measures the finished MP4. This file covers what a render cannot show cheaply: that the
 * single-window graph is UNCHANGED, that a CTA window is refused in every case where showing one
 * would be a lie, and that the recommendation never hardens into a rule.
 */
import { readFileSync } from "node:fs"
import {
  PRESENTER, buildPresenterPlan, buildPresenterFilter, clampIntroSeconds,
} from "@/lib/social/presenterSpec"
import { computeVoiceWindows } from "@/lib/social/voiceFit"
import { recommendLook, presenterForLook, LOOK_LABEL, PRESENTER_LOOKS } from "@/lib/social/presenterLook"
import { effectiveIntroVoiceClipId, clipForRender, willShowAvatar } from "@/lib/social/presenterClipCache"

let pass = 0, fail = 0
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

// ── 1. THE HOOK BEHAVIOUR IS NOT MERELY SIMILAR, IT IS THE SAME STRING ──────────────────────
// Requirement 1 is the one that cannot be verified by looking at a video: a graph that renders
// correctly today and differs from the approved one has silently become a new graph to re-approve.
console.log("\n1. a presenter with no CTA renders the pre-existing graph, character for character:")
{
  const plan = buildPresenterPlan({ inputIndex: 3, introSeconds: 4 })
  const f = buildPresenterFilter(plan, "withpres")
  const expected =
    "[3:v]scale=400:-2,format=yuva420p,fade=t=out:st=3.400:d=0.600:alpha=1,setpts=PTS-STARTPTS[pres];" +
    "[bg][pres]overlay=x=110:y=H-h-312:enable='lt(t,4.000)':eof_action=pass:shortest=0[withpres]"
  ok("the exact filter string the approved release emitted", f === expected)
  ok("one window, and it is the hook's", plan.windows.length === 1 && plan.windows[0].kind === "hook")
  ok("the window is [0, intro]", plan.windows[0].startSeconds === 0 && plan.windows[0].endSeconds === 4)
  ok("the plan still reports its input index the way the renderer reads it", plan.inputIndex === 3)
}

// ── 2. REAL DURATIONS, NOT THE SLIDER ───────────────────────────────────────────────────────
console.log("\n2. the window is the recording's own length (requirement 3):")
{
  // Help_Client_Amazing_Deal.m4a is 4.42s. The slider cannot express that at all: its step is 0.5
  // and its ceiling is 5, so the old behaviour cut the figure off 0.42s into a sentence.
  const withVoice = buildPresenterPlan({ inputIndex: 1, introSeconds: 4, voiceHookSeconds: 4.42 })
  ok("a 4.42s hook gets a 4.42s window, not the slider's 4", withVoice.introSeconds === 4.42)
  ok("…and the fade still lands on its last 0.6s",
    buildPresenterFilter(withVoice, "o").includes("st=3.820"))
  const long = buildPresenterPlan({ inputIndex: 1, introSeconds: 4, voiceHookSeconds: 6.8 })
  ok("a 6.8s hook is NOT clamped to the old 5s ceiling", long.introSeconds === 6.8)

  ok("with no recording the slider still rules, clamped exactly as before",
    buildPresenterPlan({ inputIndex: 1, introSeconds: 9 }).introSeconds === 5 &&
    buildPresenterPlan({ inputIndex: 1, introSeconds: 2 }).introSeconds === 3 &&
    buildPresenterPlan({ inputIndex: 1 }).introSeconds === PRESENTER.defaultIntroSeconds)
  ok("…and clampIntroSeconds itself is untouched",
    clampIntroSeconds(9) === 5 && clampIntroSeconds(2) === 3 && clampIntroSeconds(3.5) === 3.5)
  ok("a nonsense duration falls back to the slider rather than producing a zero-length window",
    buildPresenterPlan({ inputIndex: 1, introSeconds: 4, voiceHookSeconds: 0 }).introSeconds === 4 &&
    buildPresenterPlan({ inputIndex: 1, introSeconds: 4, voiceHookSeconds: -3 }).introSeconds === 4 &&
    buildPresenterPlan({ inputIndex: 1, introSeconds: 4, voiceHookSeconds: NaN }).introSeconds === 4)
}

// ── 3. WHEN A CTA WINDOW IS REFUSED ─────────────────────────────────────────────────────────
// Every refusal below is a case where a window would render fine and mean something false.
console.log("\n3. a CTA window is only added when it is honest:")
{
  const w = computeVoiceWindows(14.07, 4.42, 5.53)
  const base = { inputIndex: 3, voiceHookSeconds: 4.42 }

  ok("no clip of its own ⇒ no window (the hook's mouth would say the CTA's words)",
    buildPresenterPlan({ ...base, ctaWindow: w.cta, ctaInputIndex: null }).windows.length === 1)
  ok("no window ⇒ no window, however a clip is supplied",
    buildPresenterPlan({ ...base, ctaWindow: null, ctaInputIndex: 4 }).windows.length === 1)
  ok("both present ⇒ two windows",
    buildPresenterPlan({ ...base, ctaWindow: w.cta, ctaInputIndex: 4 }).windows.length === 2)

  // The renderer cannot reach this — voiceClipsFit refuses an overlapping pair before the plan is
  // built — but the editor preview and these tests call the module directly.
  ok("a CTA window starting BEFORE the hook window ends is dropped, not overlapped",
    buildPresenterPlan({ ...base, ctaWindow: { startSeconds: 2, endSeconds: 9 }, ctaInputIndex: 4 }).windows.length === 1)
  ok("a zero-length or inverted window is dropped",
    buildPresenterPlan({ ...base, ctaWindow: { startSeconds: 9, endSeconds: 9 }, ctaInputIndex: 4 }).windows.length === 1 &&
    buildPresenterPlan({ ...base, ctaWindow: { startSeconds: 9, endSeconds: 8 }, ctaInputIndex: 4 }).windows.length === 1)
  ok("a non-finite window is dropped",
    buildPresenterPlan({ ...base, ctaWindow: { startSeconds: NaN, endSeconds: 14 }, ctaInputIndex: 4 }).windows.length === 1)

  // A pair that exactly fills the video is a FIT (voiceFit allows it deliberately), so the two
  // windows meet rather than overlap and the avatar never leaves. That is correct, not a bug.
  const exact = computeVoiceWindows(10, 4, 6)
  ok("a pair that exactly fills the video gives two touching windows",
    (() => {
      const p = buildPresenterPlan({ inputIndex: 3, voiceHookSeconds: 4, ctaWindow: exact.cta, ctaInputIndex: 4 })
      return p.windows.length === 2 && p.windows[0].endSeconds === 4 && p.windows[1].startSeconds === 4
    })())
}

// ── 4. THE TWO-WINDOW GRAPH ─────────────────────────────────────────────────────────────────
console.log("\n4. the filter details that fail silently when wrong:")
{
  const w = computeVoiceWindows(14.07, 4.42, 5.53)
  const plan = buildPresenterPlan({ inputIndex: 3, voiceHookSeconds: 4.42, ctaWindow: w.cta, ctaInputIndex: 4 })
  const f = buildPresenterFilter(plan, "withpres")

  ok("the CTA chain is shifted to its window's start", f.includes("setpts=PTS-STARTPTS+8.540/TB"))
  ok("…and the hook chain is NOT shifted", f.includes("setpts=PTS-STARTPTS[pres_hook]"))
  // The fade is computed on the clip's own timeline, so it is the WINDOW'S length minus the fade —
  // 5.53 - 0.6 — not the window's absolute end minus the fade.
  ok("the CTA fade lands on the window's last 0.6s, not at an absolute 13.47s",
    f.includes("st=4.930") && !f.includes("st=13.470"))
  ok("the CTA overlay is gated to its window at both ends", f.includes("enable='between(t,8.540,14.070)'"))
  ok("the hook overlay keeps the gate it always had", f.includes("enable='lt(t,4.420)'"))
  ok("both chains keep alpha=1 — without it the avatar fades to a BLACK BOX",
    (f.match(/fade=t=out:[^,\]]*:alpha=1/g) ?? []).length === 2)
  ok("both are formatted yuva420p", (f.match(/format=yuva420p/g) ?? []).length === 2)
  ok("both overlays pass EOF, so a short avatar cannot end the video",
    (f.match(/eof_action=pass/g) ?? []).length === 2 && (f.match(/shortest=0/g) ?? []).length === 2)
  ok("both stand at the SAME x and footing — the CTA avatar does not move",
    (f.match(new RegExp(`x=${plan.xPx}:y=H-h-${plan.bottomInsetPx}`, "g")) ?? []).length === 2)
  ok("both are scaled to the same width", (f.match(/scale=400:-2/g) ?? []).length === 2)
  ok("the overlays are chained, so the second composites onto the first's output",
    f.includes("[bg][pres_hook]") && f.includes("[pres_stage0][pres_cta]") && f.includes("[withpres]"))
  ok("each input pad is consumed exactly once (ffmpeg rejects a second read)",
    (f.match(/\[3:v\]/g) ?? []).length === 1 && (f.match(/\[4:v\]/g) ?? []).length === 1)
}

// ── 5. ONE CLIP IN BOTH WINDOWS ─────────────────────────────────────────────────────────────
// Unreachable from renderPost — the two windows are two separate HeyGen generations and therefore
// two separate files — but a plan naming one input twice must still produce a VALID graph rather
// than one that reads the same pad twice, which ffmpeg refuses outright.
console.log("\n5. a plan that names one clip for both windows still produces a valid graph:")
{
  const w = computeVoiceWindows(14.07, 4.42, 5.53)
  const plan = buildPresenterPlan({ inputIndex: 3, voiceHookSeconds: 4.42, ctaWindow: w.cta, ctaInputIndex: 3 })
  const f = buildPresenterFilter(plan, "withpres")
  ok("the input is read once and split, not read twice",
    (f.match(/\[3:v\]/g) ?? []).length === 1 && f.includes("split=2[psrc0][psrc1]"))
  ok("…and each half is faded for its own window",
    f.includes("[psrc0]fade=t=out:st=3.820") && f.includes("[psrc1]fade=t=out:st=4.930"))
  ok("…and scaled once rather than twice", (f.match(/scale=400:-2/g) ?? []).length === 1)
}

// ── 6. THE LOOK IS A RECOMMENDATION ─────────────────────────────────────────────────────────
console.log("\n6. the Look recommendation, and the fact that it only recommends:")
{
  ok("two Looks, both labelled for a human", PRESENTER_LOOKS.length === 2 &&
    LOOK_LABEL.everyday.includes("gray") && LOOK_LABEL.luxury.includes("black"))

  ok("a luxury-lifestyle recording ⇒ black button-up",
    recommendLook({ category: "luxury_lifestyle" }).look === "luxury")
  ok("a RISE (high-rise) CTA ⇒ black button-up", recommendLook({ ctaKeyword: "RISE" }).look === "luxury")
  ok("a KEY (penthouse) CTA ⇒ black button-up", recommendLook({ ctaKeyword: "KEY" }).look === "luxury")
  ok("a high-rise video ⇒ black button-up", recommendLook({ propertyType: "High-Rise" }).look === "luxury")
  ok("a penthouse video ⇒ black button-up", recommendLook({ propertyType: "Penthouse" }).look === "luxury")

  ok("an ordinary apartment CTA ⇒ gray cutoff", recommendLook({ ctaKeyword: "LIST", propertyType: "Apartment" }).look === "everyday")
  ok("a townhome ⇒ gray cutoff", recommendLook({ ctaKeyword: "TOWN", propertyType: "Townhome" }).look === "everyday")
  // The library's loft recordings are budget-led and conversational, not luxury.
  ok("an industrial loft ⇒ gray cutoff", recommendLook({ ctaKeyword: "LOFT", propertyType: "Loft" }).look === "everyday")
  ok("a price hook ⇒ gray cutoff", recommendLook({ category: "price_hook" }).look === "everyday")
  ok("nothing known ⇒ gray cutoff, the larger half of the library", recommendLook({}).look === "everyday")

  // THE RECORDING OUTRANKS THE PROPERTY. The avatar is lip-syncing the recording, so its register
  // is what the figure has to match.
  ok("a luxury recording over an ordinary apartment still recommends luxury",
    recommendLook({ category: "luxury_lifestyle", propertyType: "Apartment" }).look === "luxury")
  ok("every recommendation says why", recommendLook({ ctaKeyword: "KEY" }).why.length > 0 && recommendLook({}).why.length > 0)

  ok("a Look with no presenter row returns null rather than a substitute",
    presenterForLook([{ id: "a", lookKind: "everyday", hasClip: true }], "luxury") === null)
  ok("…and a clipless row is never offered", presenterForLook([{ id: "a", lookKind: "luxury", hasClip: false }], "luxury") === null)
  ok("the matching row is returned", presenterForLook([{ id: "a", lookKind: "luxury", hasClip: true }], "luxury")?.id === "a")

  const look = strip(read("lib/social/presenterLook.ts"))
  ok("the Look module writes nothing and reads no database", !/supabase|from\(|insert|update|delete/i.test(look))
}

// ── 7. THE WIRING ───────────────────────────────────────────────────────────────────────────
console.log("\n7. the renderer reads the voice windows rather than computing its own:")
{
  const rv = strip(read("lib/social/renderVideo.ts"))
  ok("the presenter plan is built from the voice windows", /voiceHookSeconds:\s*voiceWindows/.test(rv) && /ctaWindow:\s*voiceWindows\?\.cta/.test(rv))
  ok("computeVoiceWindows is called ONCE, so the audio and the avatar cannot disagree",
    (rv.match(/computeVoiceWindows\(/g) ?? []).length === 1)
  ok("…and the plan is built AFTER them", rv.indexOf("computeVoiceWindows(") < rv.indexOf("buildPresenterPlan("))
  ok("still exactly one composition path", (rv.match(/buildPresenterFilter\(/g) ?? []).length === 1)
  // THE TWO WINDOWS ARE INDEPENDENT. A verified CTA avatar must not be withheld because the
  // intro's clip is missing — that is the normal state while a library is being built up, and
  // suppressing it would punish the half that is correct.
  ok("a CTA avatar does NOT require an intro avatar",
    /let presenterCtaLocal = input\.presenterCtaPath \?\? null/.test(rv) &&
    !/presenterLocal\s*&&\s*input\.presenterCtaPath/.test(rv))
  ok("a plan is built whenever EITHER clip is present", /\(presenterLocal \|\| presenterCtaLocal\)\s*\?\s*buildPresenterPlan/.test(rv))
  ok("the avatar indices follow the actual input list",
    /const introInputIndex = presenterLocal \? 1 \+ voiceCount : null/.test(rv) &&
    /const ctaInputIndex = presenterCtaLocal \? \(presenterLocal \? 2 : 1\) \+ voiceCount : null/.test(rv))

  // Requirement 5, structurally: the output's audio is named, never inherited.
  ok("the only audio ever mapped is the mix, the source, or nothing",
    /"-map", "\[aout\]"/.test(rv) && /"-an"/.test(rv) && /"-map", "0:a\?"/.test(rv) &&
    // `0:a?` is the SOURCE's audio and is allowed; any higher index would be a voice clip or an
    // avatar, and mapping one of those is the failure this asserts against.
    !/-map",\s*"[1-9]\d*:a/.test(rv))

  const rp = strip(read("lib/social/renderPost.ts"))
  // Phase A: the spec names both avatars by STORAGE path and renderFromSpec resolves them to the
  // downloaded files. Both halves asserted — carrying a clip and passing it on are separate.
  ok("renderPost supplies both clips to the renderer",
    /presenter:\s*presenterStorage/.test(rp) && /presenterCta:\s*presenterCtaStorage/.test(rp)
    && /presenterPath:\s*at\(spec\.media\.presenter\)/.test(rp) && /presenterCtaPath:\s*at\(spec\.media\.presenterCta\)/.test(rp))
}

// ── 8. THE RECOMPUTE RULE, AND THE MATCH KEY ────────────────────────────────────────────────
console.log("\n8. the save path recomputes the CTA clip from the right three inputs:")
{
  const route = strip(read("app/api/admin/social-autopilot/posts/[id]/route.ts"))

  // THE BUG THIS GUARDS: the intro clip's recompute rule watches presenterId and the narration.
  // The CTA window has a THIRD input — the selected CTA — and omitting it reproduces the original
  // mismatch one window later: change the CTA alone and the post keeps the previous CTA's mouth.
  ok("the CTA clip is recomputed when the presenter, the CTA Look OR the CTA recording changes",
    /"presenterId" in body \|\| "presenterCtaId" in body \|\| "voiceCtaId" in body/.test(route))
  ok("…and it is written ONLY on a verified match, with no fallback",
    /patch\.presenter_cta_clip_storage_path = ctaResolution \? clipForRender\(ctaResolution\) : null/.test(route))
  ok("both windows pass through the SAME filter, not two expressions that agree",
    (route.match(/clipForRender\(/g) ?? []).length === 2)
  ok("the match key is the recording's STORAGE PATH, resolved server-side from its id",
    /social_voice_clips"\)\.select\("storage_path"\)/.test(route))
  ok("both windows resolve through ONE shared matcher, so they cannot drift",
    /const resolveClipFor = async/.test(route) &&
    (route.match(/await resolveClipFor\(/g) ?? []).length === 2)   // one definition, both windows
  ok("the CTA Look falls back to the intro Look", /\?\?\s*effectivePresenterId/.test(route))
  ok("turning the presenter off clears the CTA half too",
    /patch\.presenter_cta_id = null/.test(route) && /patch\.presenter_cta_clip_storage_path = null/.test(route))
  ok("a supplied CTA presenter id is re-resolved through the caller's own client",
    /presenterCtaId[\s\S]{0,400}?from\("social_presenters"\)/.test(route))

  const inval = strip(read("lib/social/renderInvalidation.ts"))
  ok("both new columns invalidate a finished render",
    /"presenter_cta_id"/.test(inval) && /"presenter_cta_clip_storage_path"/.test(inval))
  ok("…and they are SELECTED on the stored row, so a no-op save stays a no-op",
    /presenter_cta_id, presenter_cta_clip_storage_path/.test(route))

  // REQUIREMENT 7: audio_storage_path stays the match key; voice_clip_id is the library reference.
  const clips = strip(read("app/api/admin/social-autopilot/presenters/clips/route.ts"))
  ok("an association still records voice_clip_id for library lookups", /voice_clip_id: voiceClipId/.test(clips))
  ok("…and still matches on audio_storage_path", /audio_storage_path: resolved\.audioPath/.test(clips))
  const cache = strip(read("lib/social/presenterClipCache.ts"))
  ok("the matcher itself compares paths, never ids", /r\.audioStoragePath === want/.test(cache))
}

// ── 8b. THE HOOK IS AUTHORITATIVE FOR THE INTRO AVATAR ──────────────────────────────────────
// THE DEFECT: renderPost has always played `hookLocal ?? presenterAudioLocal`, so a selected Hook
// is what the viewer HEARS. The clip lookup keyed on the NARRATION alone, so Hook = A with
// Narration = B rendered A's words against B's mouth — cleanly, publishably, and wrongly.
console.log("\n8b. the intro avatar is matched to what will actually be heard:")
{
  ok("a selected Hook wins over a Narration", effectiveIntroVoiceClipId("hook-id", "narration-id") === "hook-id")
  ok("...and the Narration fills in when no Hook is chosen",
    effectiveIntroVoiceClipId(null, "narration-id") === "narration-id" &&
    effectiveIntroVoiceClipId("", "narration-id") === "narration-id")
  ok("neither ⇒ null, which is 'no recording drives the intro', not a mismatch",
    effectiveIntroVoiceClipId(null, null) === null && effectiveIntroVoiceClipId("  ", "") === null)

  // THE SAME RULE THE RENDERER USES. If these two ever disagreed the mismatch would come straight
  // back, so the renderer's own expression is asserted against the rule's behaviour.
  const rp = strip(read("lib/social/renderPost.ts"))
  // Same precedence, now expressed over storage paths rather than temp files: an explicitly
  // chosen Hook still wins over the presenter's own audio, and the operator's selection is never
  // silently replaced.
  ok("renderPost prefers the Hook by the same precedence",
    /const effectiveHook = hookClip\?\.storagePath \?\? presenterAudioStorage/.test(rp))

  // NEVER AN UNVERIFIED MOUTH — and the one case that is not a mismatch at all.
  const res = (state: string, verified: boolean) =>
    clipForRender({ state, clipStoragePath: "own.webm", lipSyncVerified: verified, clipId: null } as never)
  ok("a verified match is served", res("matched", true) === "own.webm")
  ok("no recording at all keeps the presenter's own clip, exactly as before",
    res("no_voice_selected", false) === "own.webm")
  ok("every miss stores NOTHING — audio only, never the wrong mouth",
    res("unmatched", false) === null && res("pending", false) === null &&
    res("failed", false) === null && res("unavailable", false) === null)

  ok("the editor's visibility rule agrees, state for state",
    willShowAvatar("matched") && willShowAvatar("no_voice_selected") &&
    !willShowAvatar("unmatched") && !willShowAvatar("pending") &&
    !willShowAvatar("failed") && !willShowAvatar("unavailable") && !willShowAvatar(null))

  // A PLAN WITH NO INTRO WINDOW. Reachable now that the intro clip can legitimately be absent.
  const w = computeVoiceWindows(14.07, 4.42, 5.53)
  const ctaOnly = buildPresenterPlan({ inputIndex: null, voiceHookSeconds: 4.42, ctaWindow: w.cta, ctaInputIndex: 3 })
  ok("a CTA-only plan has exactly one window, and it is the CTA's",
    ctaOnly.windows.length === 1 && ctaOnly.windows[0].kind === "cta")
  // The legacy single-window string gates with `lt(t, end)`, which for a CTA window would show the
  // avatar from the FIRST FRAME. A lone CTA window must take the general form.
  const f = buildPresenterFilter(ctaOnly, "withpres")
  ok("...gated to its own window, not from t=0",
    f.includes("enable='between(t,8.540,14.070)'") && !f.includes("enable='lt(t,"))
  ok("...and shifted to its window's start", f.includes("setpts=PTS-STARTPTS+8.540/TB"))
  ok("...with no pointless split for a single clip", !f.includes("split="))
  ok("no window at all yields an empty graph rather than a broken one",
    buildPresenterFilter(buildPresenterPlan({ inputIndex: null }), "withpres") === "")
}

console.log("\n9. the editor lets a Look be chosen, per window:")
{
  const ctrl = strip(read("components/crm/social/AiPresenterControl.tsx"))
  const ed = strip(read("components/crm/social/PostEditor.tsx"))

  ok("a Look is chosen by choosing a presenter, and the dropdown says which Look that is",
    /LOOK_LABEL\[o\.lookKind as PresenterLook\]/.test(ctrl))
  ok("the CTA window has its own Look dropdown, defaulting to the intro's",
    /CTA Look/.test(ctrl) && /Same as intro/.test(ctrl))
  ok("…offered only when a CTA recording is actually selected", /voiceCtaId && \(/.test(ctrl) || /\{voiceCtaId &&/.test(ctrl))
  ok("the CTA match is looked up for the CTA pair, not the narration pair",
    /value\.ctaPresenterId \?\? value\.presenterId/.test(ctrl) && /voiceClipId: voiceCtaId/.test(ctrl))
  ok("a stale CTA answer cannot land after a newer one", (ctrl.match(/live = false/g) ?? []).length >= 2)
  ok("the recommendation is shown, and overriding it is kept",
    /recommendLook\(/.test(ctrl) && /that's kept/.test(ctrl))
  ok("no match is reported as audio-only rather than as a wrong mouth",
    /audio only/.test(ctrl))
  ok("turning the presenter off clears the CTA Look", /ctaPresenterId: null/.test(ctrl))
  ok("the intro match follows the Hook, through the shared rule",
    /effectiveIntroVoiceClipId\(voiceHookId, value\.audioVoiceClipId\)/.test(ctrl))
  ok("...and an association records THAT recording, not the narration dropdown",
    /voiceClipId: introVoiceClipId/.test(ctrl) && !/voiceClipId: value\.audioVoiceClipId/.test(ctrl))
  ok("the Narration label says when a Hook overrides it", /Narration \(Hook wins\)/.test(ctrl))
  ok("an unmatched intro is reported as audio-only, not as a caution about a wrong mouth",
    /the intro plays as audio only/.test(ctrl))
  ok("the control reports whether an avatar will actually render",
    /onAvatarVisible\?\.\(avatarVisible\)/.test(ctrl) && /willShowAvatar\(/.test(ctrl))
  ok("the editor passes the Hook in and takes the visibility back",
    /voiceHookId=\{voiceHookId\}/.test(ed) && /onAvatarVisible=\{setAvatarVisible\}/.test(ed))
  ok("the editor sends the CTA Look and passes the SELECTED CTA in",
    /presenterCtaId: presenter\.presenterId \? presenter\.ctaPresenterId : null/.test(ed) && /voiceCtaId=\{voiceCtaId\}/.test(ed))
  ok("…and loads it back, so a saved second Look survives a reload",
    /ctaPresenterId: p\.presenterCtaId \?\? null/.test(ed))
}

console.log(`\nCTA presenter window: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
