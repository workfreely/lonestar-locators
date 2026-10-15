// OPENING A DRAFT MUST NOT CHANGE ITS CAPTION.
//
// ── THE BUG ─────────────────────────────────────────────────────────────────────────────────
// The editor re-synced caption, headline and hashtags to the current metadata ON LOAD whenever
// they looked generator-owned, to repair drift. Because the editor sends all three on EVERY save,
// opening a draft and saving an unrelated field — a District, a Neighborhood — silently rewrote
// them. Caught on a live draft: stored held "✨ 8 Weeks Free" / "Submit the form to get your free
// custom apartment list"; the editor had already replaced it on load with "✨ Up to 8 weeks free!"
// and a "Comment LIST" CTA. There is no history table, so the original wording was unrecoverable.
//
// ── WHAT IS ASSERTED ────────────────────────────────────────────────────────────────────────
// Mostly real VALUES, not source regexes: resolveLoadedCopy is pure, so a test can hand it a
// stored caption and compare what comes back byte for byte — which is what "unchanged" has to
// mean. Source assertions are used only where the behaviour lives inside the component (the save
// payload, the Regenerate control, the fields that must not call syncGenerated).
//
// Every caption used below is produced by the REAL generator, so "generator-owned" cases are
// genuinely generator-owned rather than something a test author guessed at.
//
// Run: npx tsx scripts/social/captionPreservation.test.ts

import { readFileSync } from "node:fs"
import path from "node:path"
import { resolveLoadedCopy } from "@/lib/social/loadedCopy"
import {
  buildCaption, buildTemplateHeadline, isGeneratedCaption,
  DEFAULT_OVERLAY_TEMPLATE, type SourceMeta,
} from "@/lib/social/composePost"
import { buildHashtags } from "@/lib/social/hashtags"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

const editor = read("components/crm/social/PostEditor.tsx")
const SEED = "a1d74b4e-513f-4588-9c73-dac48fed927b"
const TPL = DEFAULT_OVERLAY_TEMPLATE

// The live Atelier Dallas metadata, so the fixtures match a real draft.
const meta: SourceMeta = {
  market: "Dallas", propertyType: "Penthouse", special: null, socialSpecial: null,
  budgetRange: "1495", priceLabelMode: "starting_at",
  amenities: "Floor-to-Ceiling Windows\nWalk-In Closets\nDowntown Views",
}
// The SAME property after someone edited its metadata elsewhere — this is the drift the old load
// silently "repaired", and the reason a stored caption and a freshly built one differ.
//
// Only market and propertyType vary here, DELIBERATELY: isGeneratedCaption recognises a caption by
// trying every market x type while holding the current special/price/amenities fixed. Varying the
// special too would produce a caption that matches no combination, i.e. a caption the code calls
// MANUAL — a different branch, covered separately below. This fixture has to stay generator-OWNED
// to exercise the branch the old load actually rewrote.
const driftedMeta: SourceMeta = { ...meta, market: "Houston", propertyType: "High-Rise" }
// Drift that DOES read as manual: a caption written while a special was set, loaded when it is not.
const specialDriftMeta: SourceMeta = { ...meta, socialSpecial: "8 Weeks Free" }

const load = (over: Partial<Parameters<typeof resolveLoadedCopy>[0]> = {}) =>
  resolveLoadedCopy({
    storedCaption: null, storedHeadline: null, storedHashtags: null,
    meta, seed: SEED, template: TPL,
    generatedHeadline: buildTemplateHeadline(TPL, meta),
    generatedHashtags: buildHashtags(meta.market, 5, meta.propertyType),
    ...over,
  })

// ── 1. LOADING AN EXISTING DRAFT CHANGES NOTHING ────────────────────────────────────────────
console.log("\n1. loading an existing draft, no changes:")

// (a) A GENERATOR-OWNED caption that is STALE — the exact case the old code rewrote.
const staleCaption = buildCaption(driftedMeta, SEED, TPL)
ok("the fixture really is generator-owned UNDER TODAY'S METADATA (the dangerous branch)",
  isGeneratedCaption(staleCaption, meta, SEED))
ok("the fixture really IS stale — it differs from what today's metadata builds",
  staleCaption !== buildCaption(meta, SEED, TPL))
const r1 = load({ storedCaption: staleCaption })
ok("a stale generator-owned caption loads BYTE FOR BYTE as stored", r1.caption === staleCaption)
ok("...and is NOT replaced by the freshly built one", r1.caption !== buildCaption(meta, SEED, TPL))
ok("...while still staying generator-OWNED, so a later metadata edit can re-sync it", r1.captionDirty === false)

// (a2) Drift the code reads as MANUAL — a caption written while a special was advertised, opened
// after the special was cleared. This is the shape of the live case that exposed the bug.
const specialCaption = buildCaption(specialDriftMeta, SEED, TPL)
ok("this second fixture reads as MANUAL under today's metadata", !isGeneratedCaption(specialCaption, meta, SEED))
ok("it mentions the stale special, which today's build would not",
  /8 [Ww]eeks [Ff]ree/.test(specialCaption) && !/8 [Ww]eeks [Ff]ree/.test(buildCaption(meta, SEED, TPL)))
const r1b = load({ storedCaption: specialCaption })
ok("it too loads BYTE FOR BYTE as stored", r1b.caption === specialCaption)
ok("...keeping its stale special wording rather than having it rewritten", /8 [Ww]eeks [Ff]ree/.test(r1b.caption))

// (b) A hand-written caption.
const manual = "Moving to Dallas? This penthouse is the one. DM me for a tour."
const r2 = load({ storedCaption: manual })
ok("a manual caption loads exactly as stored", r2.caption === manual)
ok("...and is flagged dirty so the generator never touches it", r2.captionDirty === true)

// (c) Headline and hashtags follow the same rule.
const staleHead = buildTemplateHeadline(TPL, driftedMeta)
const r3 = load({ storedHeadline: staleHead, storedHashtags: ["#dallasapartments", "#penthouse"] })
ok("a stored headline loads exactly as stored", r3.headline === staleHead)
ok("stored hashtags load exactly as stored", JSON.stringify(r3.hashtags) === JSON.stringify(["#dallasapartments", "#penthouse"]))

// (d) The generation that MUST survive: a draft with nothing stored still gets copy.
const r4 = load({ storedCaption: "", storedHeadline: "", storedHashtags: [] })
ok("an EMPTY caption is still generated — new drafts keep working", r4.caption === buildCaption(meta, SEED, TPL) && r4.caption.length > 0)
ok("an EMPTY headline is still generated", r4.headline === buildTemplateHeadline(TPL, meta) && r4.headline.length > 0)
ok("an EMPTY hashtag list is still generated", r4.hashtags.length > 0)
ok("null (not just empty) is handled the same way", load({ storedCaption: null }).caption.length > 0)

// (e) IDEMPOTENCE — load, then load again from what the first load produced.
const once = load({ storedCaption: staleCaption, storedHeadline: staleHead, storedHashtags: ["#a", "#b"] })
const twice = load({ storedCaption: once.caption, storedHeadline: once.headline, storedHashtags: once.hashtags })
ok("opening and closing a draft repeatedly cannot drift the caption", twice.caption === once.caption)
ok("...nor the headline", twice.headline === once.headline)
ok("...nor the hashtags", JSON.stringify(twice.hashtags) === JSON.stringify(once.hashtags))

// ── 2. SAVING UNRELATED FIELDS ──────────────────────────────────────────────────────────────
// District / Neighborhood / research metadata never enter generation. Two independent guarantees:
// they are absent from SourceMeta, and their controls never call syncGenerated.
console.log("\n2-3. saving District, Neighborhood or research metadata:")
const composer = codeOnly(read("lib/social/composePost.ts"))
ok("composePost cannot read district", !/\bdistrict\b/.test(composer))
ok("composePost cannot read area_neighborhood", !/\barea_neighborhood\b/.test(composer))
ok("...so neither can appear in a generated caption", !/\bdistrict\b/i.test(buildCaption(meta, SEED, TPL)))

// The Neighborhood + District cell: both controls, and no syncGenerated anywhere in it.
const cellStart = editor.search(/Neighborhood <span className="normal-case/)
const cell = codeOnly(editor.slice(cellStart, cellStart + editor.slice(cellStart).indexOf("</label>")))
ok("the geographic cell holds BOTH controls", (cell.match(/<AreaSelect\b/g) ?? []).length === 2)
ok("neither geographic control calls syncGenerated", !/syncGenerated/.test(cell))

// The research panel is read-only and writes through its own route, not the editor's save.
const research = codeOnly(read("components/crm/social/PropertyResearch.tsx"))
ok("the property-research panel never touches the caption", !/setCaption|buildCaption/.test(research))
ok("...and never calls syncGenerated", !/syncGenerated/.test(research))

// ── 4. A DELIBERATE CAPTION EDIT STILL STICKS ───────────────────────────────────────────────
console.log("\n4. an intentionally edited caption:")
const edited = "Hand-written. Keep this exactly."
const r5 = load({ storedCaption: edited })
ok("it survives the next load unchanged", r5.caption === edited)
ok("it is dirty, so no metadata edit can overwrite it", r5.captionDirty === true)
ok("typing in the caption box marks it dirty",
  /onChange=\{\(e\) => \{ setCaption\(e\.target\.value\); setCaptionDirty\(true\) \}\}/.test(editor))
ok("syncGenerated refuses to touch a dirty caption", /if \(!captionDirty\) setCaption\(/.test(editor))

// ── 5. EXPLICIT REGENERATION ────────────────────────────────────────────────────────────────
console.log("\n5. explicitly regenerating:")
const ed = codeOnly(editor)
ok("a Regenerate handler exists", /const regenerateCaption = \(\) => \{/.test(ed))
ok("it rebuilds from the CURRENT metadata and template", /regenerateCaption = \(\) => \{\s*setCaption\(buildCaption\(metaOf\(\), sourceContentId \?\? undefined, overlayTemplate\)\)/.test(ed))
ok("it hands the caption BACK to the generator by clearing dirty", /regenerateCaption = \(\) => \{[\s\S]{0,180}setCaptionDirty\(false\)/.test(ed))
ok("it is wired to a button beside the caption field", /onClick=\{regenerateCaption\}/.test(ed))
ok("it only ever runs from a click — never on load", !/resolveLoadedCopy[\s\S]{0,400}regenerateCaption/.test(ed))
// The other deliberate regeneration paths must still work.
ok("a metadata edit still re-syncs a generator-owned caption", /setPropertyType\(v\); syncGenerated\(/.test(ed) && /setMarket\(v\); syncGenerated\(/.test(ed))
ok("a template change still moves the caption with it", /if \(!captionDirty\) setCaption\(buildCaption\(meta, sourceContentId \?\? undefined, tpl\)\)/.test(ed))
ok("hashtags keep their own explicit regeneration", /onClick=\{suggestTags\}>Suggest from market</.test(editor))

// ── 6. HASHTAGS AND CTAs ────────────────────────────────────────────────────────────────────
console.log("\n6. hashtags and CTAs preserved:")
const customTags = ["#myowntag", "#anotherone"]
const r6 = load({ storedHashtags: customTags })
ok("custom hashtags are returned unchanged", JSON.stringify(r6.hashtags) === JSON.stringify(customTags))
ok("...and flagged dirty so generation leaves them alone", r6.hashtagsDirty === true)
const genTags = buildHashtags(meta.market, 5, meta.propertyType)
const r7 = load({ storedHashtags: genTags })
ok("generator-owned hashtags also load exactly as stored", JSON.stringify(r7.hashtags) === JSON.stringify(genTags))
// The CTA is the caption's last line. A preserved caption preserves its CTA by construction.
const ctaCaption = staleCaption
ok("the CTA line inside a stored caption is preserved verbatim",
  load({ storedCaption: ctaCaption }).caption.split("\n").slice(-1)[0] === ctaCaption.split("\n").slice(-1)[0])

// ── 7. UNRELATED POST FIELDS ────────────────────────────────────────────────────────────────
console.log("\n7. unrelated fields are not collateral:")
ok("resolveLoadedCopy returns ONLY the three generated fields",
  JSON.stringify(Object.keys(load()).sort()) ===
  JSON.stringify(["caption", "captionDirty", "hashtags", "hashtagsDirty", "headline", "headlineDirty"]))
for (const f of ["cover_thumb_offset_ms", "render_status", "rendered_storage_path", "scheduled_at", "published_at", "status"]) {
  ok(`the load rule cannot touch ${f}`, !new RegExp(f).test(read("lib/social/loadedCopy.ts")))
}
ok("the rule module is pure — no fetch, no React, no clock",
  !/fetch\(|useState|useEffect|Date\.now|new Date/.test(read("lib/social/loadedCopy.ts")))

// ── THE REGRESSION ITSELF ───────────────────────────────────────────────────────────────────
// The precise shape of the old bug, pinned so it cannot come back by either route.
console.log("\nthe old behaviour is gone:")
ok("load no longer branches the DISPLAYED caption on the dirty flag",
  !/setCaption\(cDirty \?/.test(ed) && !/captionDirty \? storedCap/.test(ed))
ok("load no longer branches the DISPLAYED headline on the dirty flag", !/hDirty \? storedHead : genHead/.test(ed))
ok("load no longer branches the DISPLAYED hashtags on the dirty flag", !/tDirty \? storedTags :/.test(ed))
ok("the component defers to the one pure rule", /resolveLoadedCopy\(\{/.test(ed))
ok("the rule is 'stored wins' for all three fields",
  /storedCaption \|\| buildCaption/.test(read("lib/social/loadedCopy.ts")) &&
  /storedHeadline \|\| generatedHeadline/.test(read("lib/social/loadedCopy.ts")) &&
  /storedHashtags\.length > 0 \? storedHashtags : generatedHashtags/.test(read("lib/social/loadedCopy.ts")))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
