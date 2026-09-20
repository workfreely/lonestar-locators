// Focused unit tests for the pure TikTok Direct Post logic (no network): selection validation
// against Creator Info + the unaudited SELF_ONLY restriction, and single-chunk planning.
// Run: `npx tsx scripts/social/tiktok-publish.test.ts`
import {
  resolveDirectPostSelection,
  planSingleChunk,
  type TikTokCreatorInfo,
} from "@/lib/social/tiktokPublish"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const throws = (l: string, fn: () => unknown) => { try { fn(); fail++; console.log(`  ✗ ${l} (expected throw)`) } catch { pass++; console.log(`  ✓ ${l}`) } }

const info = (over: Partial<TikTokCreatorInfo> = {}): TikTokCreatorInfo => ({
  creator_username: "realestatepro_tx",
  creator_nickname: "Jay | TX Apartment Locator",
  creator_avatar_url: "https://cdn/x.jpg",
  privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR"],
  comment_disabled: false,
  duet_disabled: false,
  stitch_disabled: false,
  max_video_post_duration_sec: 600,
  ...over,
})

console.log("Unaudited client → SELF_ONLY only:")
{
  const sel = resolveDirectPostSelection(info(), { privacyLevel: "SELF_ONLY" }, { unaudited: true })
  ok("SELF_ONLY passes for unaudited", sel.privacyLevel === "SELF_ONLY")
  throws("PUBLIC rejected for unaudited (would be unaudited_client_can_only_post_to_private_accounts)", () =>
    resolveDirectPostSelection(info(), { privacyLevel: "PUBLIC_TO_EVERYONE" }, { unaudited: true }))
  // Audited path would allow PUBLIC (guards the flip-to-audited later).
  ok("PUBLIC allowed when audited", resolveDirectPostSelection(info(), { privacyLevel: "PUBLIC_TO_EVERYONE" }, { unaudited: false }).privacyLevel === "PUBLIC_TO_EVERYONE")
}

console.log("\nPrivacy must be offered by Creator Info:")
throws("privacy not in options is rejected", () =>
  resolveDirectPostSelection(info({ privacy_level_options: ["SELF_ONLY"] }), { privacyLevel: "PUBLIC_TO_EVERYONE" }, { unaudited: false }))

console.log("\nInteraction toggles respect creator capabilities (can disable, cannot force-enable):")
{
  // Creator allows all → requested disables are honored as-is.
  const s1 = resolveDirectPostSelection(info(), { privacyLevel: "SELF_ONLY", disableComment: true, disableDuet: false, disableStitch: true }, { unaudited: true })
  ok("requested disables honored when creator allows", s1.disableComment === true && s1.disableDuet === false && s1.disableStitch === true)
  // Creator has comment/duet/stitch OFF → always disabled regardless of request.
  const s2 = resolveDirectPostSelection(
    info({ comment_disabled: true, duet_disabled: true, stitch_disabled: true }),
    { privacyLevel: "SELF_ONLY", disableComment: false, disableDuet: false, disableStitch: false },
    { unaudited: true },
  )
  ok("creator-disabled interactions stay disabled (cannot force-enable)", s2.disableComment && s2.disableDuet && s2.disableStitch)
}

console.log("\nSingle-chunk planning:")
{
  const plan = planSingleChunk(3_000_000)
  ok("small video → 1 chunk sized to the whole file", plan.chunkSize === 3_000_000 && plan.totalChunkCount === 1)
  throws("zero/invalid size rejected", () => planSingleChunk(0))
  throws("> 64MB rejected (MVP single-chunk limit, fails loudly)", () => planSingleChunk(64 * 1024 * 1024 + 1))
  ok("exactly 64MB allowed as single chunk", planSingleChunk(64 * 1024 * 1024).totalChunkCount === 1)
}

console.log(`\nTikTok publish unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
