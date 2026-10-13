// TIKTOK GETS ITS OWN TOP ANCHOR; INSTAGRAM DOES NOT MOVE.
//
// THE DEFECT. Social Beast already had per-platform safe areas, destination-aware rendering and
// safe-area-suffixed artifact paths — and none of it was reachable. The editor's "Post to" selector
// was local state that reset to Instagram on every mount and was never written back, so every post
// stayed instagram_reel, every render used Instagram's geometry, and the TikTok publisher uploaded
// that Instagram-laid-out MP4. The first Sandbox post went out that way.
//
// THE CHANGE, in three parts:
//   1. The three TOP-ANCHORED templates — T1 market_type, T4 special_feature, T16
//      what_mo_gets_you_top — resolve their shared anchor per platform. Instagram keeps exactly
//      427; TikTok gets 300, measured from two real published screenshots and authorised as a TEST
//      value only, pending a phone inspection.
//   2. The selector writes the post's destination, so the surface actually reaches the renderer,
//      and the preview resolves its geometry the same way the renderer does (destination ->
//      safeAreaId) rather than off the raw platform column.
//   3. `destination` becomes render-affecting, and the TikTok publish route refuses a post whose
//      destination is not TikTok.
//
// INSTAGRAM IS FROZEN AGAINST A SNAPSHOT TAKEN FROM COMMIT acafc4d — the full layout of all 24
// templates on instagram AND instagram_story, captured before the change and diffed byte-for-byte
// (identical sha256). These tests re-assert that snapshot, so any future drift fails here.
//
// No network, no database, no rendering. Run: npx tsx scripts/social/tiktokOverlayPosition.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { OVERLAY_TEMPLATES, buildTemplateHeadline, buildTemplateDetail } from "@/lib/social/composePost"
import { computeOverlayLayout, OVERLAY_SPEC, OVERLAY_CANVAS } from "@/lib/social/overlaySpec"
import { safeAreaFor, PLATFORM_SAFE_AREAS } from "@/lib/social/platformSafeArea"
import { DESTINATIONS, isSocialDestination, destinationFromLegacyPlatform } from "@/lib/social/destinations"
import { RENDER_AFFECTING_COLUMNS, renderAffectingChanges } from "@/lib/social/renderInvalidation"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

const TOP_ANCHORED = ["market_type", "special_feature", "what_mo_gets_you_top"] as const
const src = { market: "San Antonio", propertyType: "Apartment", special: "6 Weeks Free", socialSpecial: null, budgetRange: "$1,200 – $1,800", amenities: "yard, garage, pool" } as never
const copy = (t: string) => {
  let head = "", det = ""
  try { head = buildTemplateHeadline(t as never, src) ?? "" } catch {}
  try { det = buildTemplateDetail(t as never, src) ?? "" } catch {}
  return { head, det }
}
const layout = (t: string, plat: string) => { const { head, det } = copy(t); return computeOverlayLayout(t, head, det, plat) }

/** Key-order-independent serialisation: the frozen snapshot is stored sorted, and object key
 *  order is not part of the layout. Comparing raw JSON.stringify would report drift for a
 *  reordering that changes no pixel. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val)

console.log("1. INSTAGRAM IS BYTE-FOR-BYTE FROZEN (snapshot from commit acafc4d, pre-change):")
{
  const frozen = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/social/tiktokOverlayPosition.frozen.json"), "utf8")) as Record<string, unknown>
  let drift = 0
  for (const t of OVERLAY_TEMPLATES as readonly string[]) {
    for (const plat of ["instagram", "instagram_story"]) {
      const L = layout(t, plat)
      const got = {
        h: { lines: L.headline.lines, fontPx: L.headline.fontPx, topPx: L.headline.topPx, side: L.headline.sideMarginPx, ls: L.headline.lineSpacing, uc: L.headline.uppercase, linePx: L.headline.linePx ?? null, lineTopPx: L.headline.lineTopPx ?? null },
        d: L.detail ? { lines: L.detail.lines, fontPx: L.detail.fontPx, topPx: L.detail.topPx, side: L.detail.sideMarginPx } : null,
      }
      if (canon(got) !== canon(frozen[`${t}|${plat}`])) { drift++; if (drift <= 3) console.log(`      drift: ${t} | ${plat}`) }
    }
  }
  ok(`all ${(OVERLAY_TEMPLATES as readonly string[]).length} templates × 2 Instagram surfaces match the pre-change snapshot`, drift === 0, `${drift} differ`)
  ok("the snapshot really covers every template", Object.keys(frozen).length === (OVERLAY_TEMPLATES as readonly string[]).length * 2)
  ok("Instagram's approved top anchor is still exactly 427",
    TOP_ANCHORED.every((t) => layout(t, "instagram").headline.topPx === 427))
  ok("…and it is still the historic yFrac expression, not a restated literal",
    OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h === 427)
  ok("Instagram Story shares Instagram's anchor, unchanged",
    TOP_ANCHORED.every((t) => layout(t, "instagram_story").headline.topPx === 427))
}

console.log("\n2. TIKTOK'S TOP-ANCHORED FAMILY MOVES TO 300 — and only that family:")
{
  for (const t of TOP_ANCHORED) {
    ok(`${t}: TikTok 300, Instagram 427`,
      layout(t, "tiktok").headline.topPx === 300 && layout(t, "instagram").headline.topPx === 427,
      `tt=${layout(t, "tiktok").headline.topPx} ig=${layout(t, "instagram").headline.topPx}`)
  }
  ok("the three move together (one shared anchor, not three)",
    new Set(TOP_ANCHORED.map((t) => layout(t, "tiktok").headline.topPx)).size === 1)

  const centred = (OVERLAY_TEMPLATES as readonly string[]).filter((t) => !TOP_ANCHORED.includes(t as never))
  let moved = 0
  for (const t of centred) {
    const ig = layout(t, "instagram").headline.topPx, tt = layout(t, "tiktok").headline.topPx
    // Centred templates may differ by a few px because TikTok's narrower box changes the FIT, and
    // therefore the block height the centring divides. They must never pick up the top anchor.
    if (Math.abs(ig - tt) > 12) { moved++; if (moved <= 3) console.log(`      ${t}: ig=${ig} tt=${tt}`) }
    if (tt === 300) { moved++; console.log(`      ${t} wrongly took the top anchor`) }
  }
  ok(`none of the ${centred.length} centred templates moved to the top anchor`, moved === 0, `${moved} did`)
}

console.log("\n3. THE 300 POSITION FITS THE MEASURED TIKTOK INTERFACE:")
{
  const TT = { topChrome: 83, safeFloor: 160, railX: 970, capExpanded: 831 }
  for (const t of TOP_ANCHORED) {
    const L = layout(t, "tiktok")
    const bottom = L.detail ? L.detail.topPx + L.detail.fontPx : L.headline.topPx + L.headline.fontPx
    ok(`${t}: clears the measured top chrome (${TT.topChrome})`, L.headline.topPx > TT.topChrome)
    ok(`${t}: clears the conservative For You floor (${TT.safeFloor})`, L.headline.topPx >= TT.safeFloor)
    ok(`${t}: whole lockup sits above an EXPANDED caption (${TT.capExpanded})`, bottom < TT.capExpanded, `bottom=${bottom}`)
  }
  ok("TikTok's text box is still narrower than Instagram's", safeAreaFor("tiktok").text.w < safeAreaFor("instagram").text.w)
  ok("every safe-area box is still canvas-symmetric",
    Object.values(PLATFORM_SAFE_AREAS).every((a) => OVERLAY_CANVAS.w - (a.text.x + a.text.w) === a.text.x))
}

console.log("\n4. DESTINATION RESOLVES GEOMETRY — the preview must agree with the renderer:")
{
  ok("tiktok_video resolves to the tiktok safe area", DESTINATIONS.tiktok_video.safeAreaId === "tiktok")
  ok("instagram_reel and instagram_story both resolve to instagram",
    DESTINATIONS.instagram_reel.safeAreaId === "instagram" && DESTINATIONS.instagram_story.safeAreaId === "instagram")
  // The trap this guards: a destination id is NOT a safe-area id, and safeAreaFor() falls back to
  // Instagram silently rather than throwing. Passing one where the other belongs looks like it works.
  ok("a destination id passed as a platform silently yields Instagram (hence the DESTINATIONS lookup)",
    safeAreaFor("tiktok_video").id === "instagram")
  ok("resolving through DESTINATIONS gives TikTok geometry",
    computeOverlayLayout("market_type", "San Antonio Apartments", "", DESTINATIONS.tiktok_video.safeAreaId).headline.topPx === 300)
  ok("a legacy row with no destination still resolves", destinationFromLegacyPlatform(null) === "instagram_reel")
  ok("a legacy tiktok platform resolves to tiktok_video", destinationFromLegacyPlatform("tiktok") === "tiktok_video")
  ok("isSocialDestination rejects a bare platform string", !isSocialDestination("tiktok") && isSocialDestination("tiktok_video"))
}

console.log("\n5. CHANGING THE SURFACE INVALIDATES THE RENDER:")
{
  ok("destination is render-affecting", (RENDER_AFFECTING_COLUMNS as readonly string[]).includes("destination"))
  ok("switching instagram_reel → tiktok_video invalidates",
    renderAffectingChanges({ destination: "instagram_reel" }, { destination: "tiktok_video" }).length > 0)
  ok("re-saving the SAME destination does NOT invalidate",
    renderAffectingChanges({ destination: "tiktok_video" }, { destination: "tiktok_video" }).length === 0)
  ok("a caption-only edit still does not invalidate",
    renderAffectingChanges({ destination: "instagram_reel" }, { destination: "instagram_reel", caption: "new" }).length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
