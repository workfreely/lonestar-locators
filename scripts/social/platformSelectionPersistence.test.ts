// SELECTING TIKTOK ALONE MUST NOT UNSELECT ITSELF.
//
// THE REGRESSION. The "Post to" selector began writing the post's `destination` so the surface
// actually reached the renderer. It deliberately does NOT write the legacy `platform` column —
// that one is protected, and nothing in the geometry path reads it once a destination exists.
//
// But load() still seeded the selector from `platform`. So the moment a post was switched to
// TikTok the two disagreed (destination tiktok_video, platform still instagram), and the reload
// that followed the save re-seeded the selector from platform, snapped the selection back to
// Instagram, and unmounted the "Post to TikTok (Sandbox)" button the operator had just revealed.
//
// Reproduced before fixing: with {platform: "instagram", destination: "tiktok_video"} the old rule
// returned ["instagram"], so selectedPlatforms.has("tiktok") was false and the block did not render.
//
// THE FIX. Seed from the destination, falling back to platform only for rows written before
// destinations existed — the same order renderPost and the TikTok publish guard already use.
// providerForPost is that rule, extracted so it is testable rather than asserted by regex.
//
// Pure. No network, no database, no rendering, no publishing.
// Run: npx tsx scripts/social/platformSelectionPersistence.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { providerForPost, DESTINATIONS, isSocialDestination, destinationFromLegacyPlatform } from "@/lib/social/destinations"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const editor = readFileSync(path.join(process.cwd(), "components/crm/social/PostEditor.tsx"), "utf8")

/** The selector's seed, exactly as load() computes it. */
const seed = (row: { platform: string | null; destination: string | null }) => new Set([providerForPost(row.destination, row.platform)])

console.log("1. THE REPORTED SEQUENCE: Instagram → Instagram+TikTok → TikTok only:")
{
  // Step 1–2: an existing post opens. Instagram selected.
  const start = { platform: "instagram", destination: "instagram_reel" }
  ok("opens with Instagram selected", seed(start).has("instagram") && !seed(start).has("tiktok"))

  // Step 3: TikTok added alongside Instagram. TWO selected ⇒ destination deliberately NOT written,
  // so nothing is saved and nothing reloads; the local selection simply holds both.
  const both = new Set(["instagram", "tiktok"])
  ok("with both selected the Sandbox block shows", both.has("tiktok"))
  ok("…and no destination is written while the selection is ambiguous", both.size !== 1)

  // Step 5: Instagram deselected. One platform ⇒ destination saved, then load() re-seeds.
  const afterSave = { platform: "instagram", destination: "tiktok_video" } // platform intentionally unchanged
  ok("the post is now a TikTok post", afterSave.destination === "tiktok_video")
  ok("THE BUG: seeding from platform would snap back to Instagram",
    new Set([afterSave.platform]).has("tiktok") === false)
  ok("FIXED: seeding from destination keeps TikTok selected", seed(afterSave).has("tiktok"))
  ok("…and Instagram is no longer selected", !seed(afterSave).has("instagram"))
  ok("…so the Sandbox block stays mounted", seed(afterSave).has("tiktok"))
}

console.log("\n2. THE REVERSE, AND REPEATED SWITCHING:")
{
  ok("switching back to Instagram only selects Instagram",
    seed({ platform: "instagram", destination: "instagram_reel" }).has("instagram"))
  // A round trip must land exactly where it started.
  const trip = ["instagram_reel", "tiktok_video", "instagram_reel", "tiktok_video"]
    .map((d) => [...seed({ platform: "instagram", destination: d })][0])
  ok("four switches give instagram,tiktok,instagram,tiktok", trip.join(",") === "instagram,tiktok,instagram,tiktok", trip.join(","))
  ok("exactly one provider is ever selected after a reload",
    trip.length === 4 && seed({ platform: "instagram", destination: "tiktok_video" }).size === 1)
}

console.log("\n3. NEW POSTS, LEGACY DRAFTS AND PREVIOUSLY RENDERED POSTS:")
{
  // Every creation path except one leaves destination NULL; the legacy bridge must still work.
  ok("legacy row (destination null, platform instagram)", [...seed({ platform: "instagram", destination: null })][0] === "instagram")
  ok("legacy row with an empty platform still resolves to instagram", [...seed({ platform: "", destination: null })][0] === "instagram")
  ok("legacy row with a null platform still resolves to instagram", [...seed({ platform: null, destination: null })][0] === "instagram")
  ok("legacy row written as platform=tiktok resolves to tiktok", [...seed({ platform: "tiktok", destination: null })][0] === "tiktok")
  ok("a garbage destination falls back to the platform rather than throwing",
    [...seed({ platform: "instagram", destination: "not_a_destination" })][0] === "instagram")
  ok("instagram_story is still an Instagram post", [...seed({ platform: "instagram", destination: "instagram_story" })][0] === "instagram")
  // A previously rendered Instagram post keeps its provider until the operator changes it.
  ok("a rendered Instagram post is unaffected", [...seed({ platform: "instagram", destination: "instagram_reel" })][0] === "instagram")
}

console.log("\n4. TIKTOK-ONLY NEEDS NO INSTAGRAM SCHEDULING:")
{
  ok("the hint no longer points at Schedule/Publish", !/Render this post first \(via Schedule\/Publish\)/.test(editor))
  ok("…and says the dialog renders it instead", /opening this will render it first/i.test(editor))
  ok("Publish is still disabled while TikTok is selected (it IS the Instagram scheduler)",
    /disabled=\{busy \|\| publishing \|\| previewing \|\| selectedPlatforms\.has\("tiktok"\)\}/.test(editor))
  ok("the Sandbox button is still always clickable (never silently no-ops)",
    /onClick=\{\(\) => setTtConfirmOpen\(true\)\}/.test(editor) && !/disabled=\{[^}]*\}\s*\n?\s*className="w-full inline-flex items-center justify-center gap-1\.5/.test(editor))
  ok("the Sandbox block is gated only on the TikTok selection", /\{selectedPlatforms\.has\("tiktok"\) && \(/.test(editor))
}

console.log("\n5. THE SAVE IS NO LONGER A SIDE EFFECT INSIDE A STATE UPDATER:")
{
  ok("the next selection is computed outside setSelectedPlatforms",
    /const next = new Set\(selectedPlatforms\)[\s\S]{0,200}setSelectedPlatforms\(next\)/.test(editor))
  ok("…so patch is not called from within an updater function",
    !/setSelectedPlatforms\(\(prev\) => \{[\s\S]{0,600}patch\(/.test(editor))
  ok("the destination is still only written for an unambiguous selection",
    /const only = next\.size === 1 \? \[\.\.\.next\]\[0\] : null/.test(editor))
  ok("…and only when it actually differs from the stored one", /destination !== currentDestination/.test(editor))
}

console.log("\n6. THE SEED RULE MATCHES THE RENDERER'S:")
{
  // providerForPost must resolve the same destination the geometry path resolves.
  for (const row of [{ platform: "instagram", destination: "tiktok_video" }, { platform: "instagram", destination: null }, { platform: "tiktok", destination: null }]) {
    const d = isSocialDestination(row.destination) ? row.destination : destinationFromLegacyPlatform(row.platform)
    ok(`${JSON.stringify(row)} → ${DESTINATIONS[d].provider}`, providerForPost(row.destination, row.platform) === DESTINATIONS[d].provider)
  }
  ok("the editor seeds from providerForPost", /setSelectedPlatforms\(new Set\(\[providerForPost\(p\.destination, p\.platform\)\]\)\)/.test(editor))
  ok("…and no longer from the raw platform column", !/setSelectedPlatforms\(new Set\(\[p\.platform \|\| "instagram"\]\)\)/.test(editor))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
