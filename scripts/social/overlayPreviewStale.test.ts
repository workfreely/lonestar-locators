// Focused unit tests for isOverlayPreviewStale (no network, no React): the rule that decides
// whether the Post Editor's previously-rendered MP4 still represents the current overlay
// configuration, or whether the editor should fall back to the live CSS overlay preview instead.
// Run: `npx tsx scripts/social/overlayPreviewStale.test.ts`
import { isOverlayPreviewStale, type OverlayPreviewBaseline } from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const baseline = (over: Partial<OverlayPreviewBaseline> = {}): OverlayPreviewBaseline => ({
  mode: "generate",
  template: "market_type",
  headline: "SAN ANTONIO APARTMENTS",
  ...over,
})

console.log("Untouched rendered post — no baseline yet, or current matches baseline exactly:")
{
  ok("no baseline (nothing loaded yet) -> never stale", isOverlayPreviewStale(null, baseline()) === false)
  ok("current identical to baseline -> not stale", isOverlayPreviewStale(baseline(), baseline()) === false)
}

console.log("\nChanging an overlay-affecting field marks the preview stale:")
{
  ok("template changed -> stale", isOverlayPreviewStale(baseline(), baseline({ template: "affordable_luxury" })) === true)
  ok("headline changed -> stale", isOverlayPreviewStale(baseline(), baseline({ headline: "Luxury doesn't have to be expensive" })) === true)
  ok("mode changed generate -> existing -> stale", isOverlayPreviewStale(baseline(), baseline({ mode: "existing" })) === true)
  ok("mode changed existing -> generate -> stale", isOverlayPreviewStale(baseline({ mode: "existing" }), baseline({ mode: "generate" })) === true)
}

console.log("\nUnrelated re-renders with the same overlay fields stay non-stale:")
{
  const b = baseline()
  ok("same object shape, new reference -> not stale", isOverlayPreviewStale(b, { mode: b.mode, template: b.template, headline: b.headline }) === false)
}

console.log(`\nOverlay preview staleness unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
