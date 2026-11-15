// PHASE A — THE RENDERER TAKES AN EXPLICIT SPEC, AND NOTHING ABOUT THE VIDEO CHANGED.
//
// Two separate claims, tested separately:
//
//   1. EQUIVALENCE. The refactored renderer hands renderReel byte-identical arguments to the one
//      it replaced, for 41 real post shapes taken from production and 15 synthetic ones covering
//      the branches real data does not reach. Same arguments + same ffmpeg = same video, which is
//      why this compares at that seam rather than rendering two MP4s and diffing them.
//
//   2. THE FINGERPRINT IS HONEST. It is computed over the whole spec, so no field can be left out
//      of it, and the renderer cannot read an input the spec does not carry.
//
// The golden file was captured by running the COMMITTED renderer (git show HEAD:...) through the
// same harness before a line of it was changed. It is the record of what Social Beast rendered
// on 2026-11-15 and it should outlive this refactor: any later change that moves these arguments
// has to say so here.
import { readFileSync, writeFileSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { RENDERER_VERSION, renderFingerprint, canonicalRenderSpec, type RenderSpec } from "@/lib/social/renderSpec"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}

const ROOT = process.cwd()
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
/** Comments stripped, so prose in the source can never satisfy a structural assertion. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

// ── 1. EQUIVALENCE WITH THE PRE-REFACTOR RENDERER ─────────────────────────────────────────────
console.log("the refactor changed no render argument, on 56 post shapes:")

const TMP = "lib/social/renderPost.__spectest.tmp.ts"
let after: unknown[] = []
try {
  // The only edit is the import of renderReel/makeWorkDir, redirected to the capturing spy. The
  // renderer's own code is byte-for-byte what ships.
  writeFileSync(
    path.join(ROOT, TMP),
    read("lib/social/renderPost.ts").replace('from "@/lib/social/renderVideo"', 'from "@/scripts/social/_renderReelSpy"'),
  )
  const out = execFileSync("npx", ["tsx", "scripts/social/_captureRenderArgs.ts", "@/lib/social/renderPost.__spectest.tmp"], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  })
  after = JSON.parse(out) as unknown[]
} finally {
  rmSync(path.join(ROOT, TMP), { force: true })
}

const golden = JSON.parse(read("scripts/social/fixtures/renderArgs.golden.json")) as Record<string, unknown>[]
ok("every fixture still runs", after.length === golden.length, `golden ${golden.length}, now ${after.length}`)

const differing: string[] = []
for (let i = 0; i < golden.length; i++) {
  const a = golden[i]
  const b = JSON.parse(JSON.stringify(after[i])) as Record<string, unknown>
  // fingerprint is NEW on the success result and has no counterpart in the golden capture.
  const r = b.result as Record<string, unknown> | null
  if (r && "fingerprint" in r) delete r.fingerprint
  if (JSON.stringify(a) !== JSON.stringify(b)) differing.push(String(a.why))
}
ok("renderReel arguments, signed paths, writes and results are identical",
  differing.length === 0,
  differing.length ? `${differing.length} differ: ${differing.slice(0, 5).join(", ")}` : "")

// The golden file is only evidence if it actually covers the hard paths.
const whys = golden.map((g) => String(g.why))
const covers = (frag: string) => whys.some((w) => w.includes(frag))
ok("…including posts WITH a presenter", covers("presenter"))
ok("…including posts WITH a voice hook and a CTA", covers("voice_hook") && covers("voice_cta"))
ok("…including a post with NEITHER", whys.some((w) => w.startsWith("tpl:")))
ok("…including the presenter's own audio as the hook", covers("presenter_audio_only"))
ok("…including an explicit hook BEATING presenter audio", covers("hook_beats_presenter_audio"))
ok("…including 'existing' overlay mode", covers("existing_overlay"))
ok("…including every destination", covers("instagram_reel") && covers("instagram_story") && covers("tiktok_video"))
ok("…including the two failure paths", covers("no_source") && covers("voice_clip_missing"))
ok("…including all 30 overlay templates", whys.filter((w) => w.includes("tpl:")).length === 30)

// ── 2. THE RENDERER READS NOTHING THE SPEC DOES NOT CARRY ─────────────────────────────────────
// This is the property the whole phase exists for. If renderFromSpec can reach the database, the
// storage API or the network, then an input can affect the video without appearing in the spec —
// and a fingerprint computed from the spec would be a promise the code does not keep.
console.log("\nrenderFromSpec queries nothing:")

const renderPostSrc = code(read("lib/social/renderPost.ts"))
const bodyStart = renderPostSrc.indexOf("export async function renderFromSpec")
const bodyEnd = renderPostSrc.indexOf("export async function renderPostToStorage")
const renderFromSpecBody = renderPostSrc.slice(bodyStart, bodyEnd)

ok("renderFromSpec exists and was found", bodyStart > -1 && bodyEnd > bodyStart)
ok("…no .from(", !renderFromSpecBody.includes(".from("))
ok("…no .select(", !renderFromSpecBody.includes(".select("))
ok("…no supabase", !renderFromSpecBody.includes("supabase"))
ok("…no fetch(", !/\bfetch\(/.test(renderFromSpecBody))
ok("…no createSignedUrl", !renderFromSpecBody.includes("createSignedUrl"))
ok("…no process.env", !renderFromSpecBody.includes("process.env"))
ok("…it calls renderReel", renderFromSpecBody.includes("renderReel("))

// ── 3. THE FINGERPRINT COVERS EVERY FIELD ─────────────────────────────────────────────────────
// Computed over the WHOLE spec, so coverage is structural. These assertions prove it by moving
// each field in turn, and the final one fails if a field is added without a mutation for it.
console.log("\nevery field of the spec changes the fingerprint:")

const BASE: RenderSpec = {
  rendererVersion: RENDERER_VERSION,
  safeAreaId: "instagram",
  template: "market_type",
  headline: "DALLAS APARTMENTS",
  subheadline: "Starting at $1,450/month",
  audioChoice: "original",
  media: {
    source: "o/c/source.mov",
    hook: null,
    cta: null,
    presenter: null,
    presenterCta: null,
  },
  presenterIntroSeconds: null,
  presenterSide: null,
  presenterWidthPx: null,
}
const baseFp = renderFingerprint(BASE)

const mutations: Record<string, RenderSpec> = {
  rendererVersion: { ...BASE, rendererVersion: RENDERER_VERSION + 1 },
  safeAreaId: { ...BASE, safeAreaId: "tiktok" },
  template: { ...BASE, template: "your_sign" },
  headline: { ...BASE, headline: "HOUSTON APARTMENTS" },
  subheadline: { ...BASE, subheadline: "Starting at $1,451/month" },
  audioChoice: { ...BASE, audioChoice: "lb_track" },
  media: { ...BASE, media: { ...BASE.media, source: "o/c/other.mov" } },
  presenterIntroSeconds: { ...BASE, presenterIntroSeconds: 4 },
  presenterSide: { ...BASE, presenterSide: "left" },
  presenterWidthPx: { ...BASE, presenterWidthPx: 400 },
}
for (const [field, mutated] of Object.entries(mutations)) {
  ok(`${field} moves the hash`, renderFingerprint(mutated) !== baseFp)
}

// Each media sub-field separately — a nested object is where a forgotten input hides most easily.
const mediaMutations: Record<string, RenderSpec["media"]> = {
  source: { ...BASE.media, source: "o/c/different.mov" },
  hook: { ...BASE.media, hook: "o/v/hook.m4a" },
  cta: { ...BASE.media, cta: "o/v/cta.m4a" },
  presenter: { ...BASE.media, presenter: "o/p/a.webm" },
  presenterCta: { ...BASE.media, presenterCta: "o/p/a-cta.webm" },
}
for (const [field, media] of Object.entries(mediaMutations)) {
  ok(`media.${field} moves the hash`, renderFingerprint({ ...BASE, media }) !== baseFp)
}

ok("EVERY top-level field has a mutation above",
  Object.keys(BASE).every((k) => k in mutations),
  `missing: ${Object.keys(BASE).filter((k) => !(k in mutations)).join(", ")}`)
ok("EVERY media field has a mutation above",
  Object.keys(BASE.media).every((k) => k in mediaMutations),
  `missing: ${Object.keys(BASE.media).filter((k) => !(k in mediaMutations)).join(", ")}`)

// ── 4. THE FINGERPRINT IS STABLE WHERE IT MUST BE ─────────────────────────────────────────────
// A hash that moves when nothing meaningful changed is as useless for reuse as one that stays
// put when something did: it would simply never match and every render would be fresh.
console.log("\nthe fingerprint is stable across meaningless differences:")

ok("same spec, same hash", renderFingerprint({ ...BASE }) === baseFp)
ok("key order does not matter", renderFingerprint(JSON.parse(JSON.stringify(
  { media: BASE.media, presenterWidthPx: null, audioChoice: "original", subheadline: BASE.subheadline,
    headline: BASE.headline, template: BASE.template, safeAreaId: BASE.safeAreaId,
    rendererVersion: BASE.rendererVersion, presenterSide: null, presenterIntroSeconds: null },
)) as RenderSpec) === baseFp)
ok("undefined and null describe the same video",
  renderFingerprint({ ...BASE, presenterSide: undefined as unknown as null }) === baseFp)
ok("the canonical form sorts keys at every depth",
  canonicalRenderSpec(BASE).indexOf('"audioChoice"') < canonicalRenderSpec(BASE).indexOf('"headline"')
  && canonicalRenderSpec(BASE).indexOf('"cta"') < canonicalRenderSpec(BASE).indexOf('"presenter"'))
ok("it is a sha256 hex digest", /^[0-9a-f]{64}$/.test(baseFp))

// RENDERER_VERSION is in the spec rather than mixed in afterwards, so it cannot be forgotten by
// a future caller that builds a spec by hand.
ok("RENDERER_VERSION is part of the spec itself", "rendererVersion" in BASE && BASE.rendererVersion === RENDERER_VERSION)

console.log(`\nRender spec: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
