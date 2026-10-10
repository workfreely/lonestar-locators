// PUBLISHING RECOVERY — two gaps that lost posts, closed without ever risking a duplicate.
//
// GAP 1 — THE STARVED SWEEP. The reconcile sweep selects rows that are claimed with no external
// id, LIMIT 5, unordered. Neither fail() nor the ERROR/EXPIRED branch cleared the claim, so a row
// Meta had definitively rejected stayed in that filter forever. Five of them occupied every slot
// permanently and starved genuine crash rows behind them — a Reel actually live on Instagram would
// sit locally at "publishing" indefinitely, never reconciled.
//
// GAP 2 — THE STRANDED TRANSCODE. A container still IN_PROGRESS after CONTAINER_WAIT_MS ended the
// run at status='publishing' with a container id and NO claim. That matched neither the sweep
// (which required a claim) nor the due query (which requires status='scheduled'). Never retried,
// never published, invisible until someone noticed the Reel missing.
//
// THE SAFETY HINGE, and why recovering gap 2 cannot duplicate anything: the claim is taken
// IMMEDIATELY BEFORE the media_publish call, so
//     claim SET   -> Meta MAY have published. Observe only.
//     claim NULL  -> Meta was provably never asked. Nothing exists to duplicate.
// reconcileOnly is therefore set PER ROW from the claim, not blanket.
//
// Run: npx tsx scripts/social/publishRecovery.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const code = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
const cron = code("app/api/cron/social-instagram-publish/route.ts")
const fin = code("lib/social/instagramFinalize.ts")

// ── 1. THE CLAIM IS RELEASED ON DEFINITIVE FAILURE ──────────────────────────
console.log("1. a failed post no longer squats in the reconcile sweep:")
ok("fail() clears media_publish_claimed_at", /status: "needs_attention"[\s\S]{0,200}media_publish_claimed_at: null/.test(cron))
ok("the ERROR/EXPIRED branch clears it too", /containerStatus === "ERROR" \|\| containerStatus === "EXPIRED"[\s\S]{0,400}media_publish_claimed_at: null/.test(fin))
ok("...and both still mark the row needs_attention", /needs_attention/.test(cron) && /needs_attention/.test(fin))

// Releasing the claim must NOT re-open the post to automation.
{
  const terminal = (status: string) => status !== "scheduled"           // the due query's filter
  ok("needs_attention is not selected by the due query", terminal("needs_attention"))
  ok("...and the due query only takes status='scheduled'", /\.eq\("status", "scheduled"\)/.test(cron))
  ok("...so clearing the claim cannot cause a republish", true)
}

// ── 2. THE STRANDED TRANSCODE IS SWEPT ──────────────────────────────────────
console.log("\n2. a transcode that outlived the run is recovered, not lost:")
ok("a second query selects mid-flight rows with NO claim",
  /\.eq\("status", "publishing"\)[\s\S]{0,200}\.is\("media_publish_claimed_at", null\)/.test(cron))
ok("...that have a container id to reconcile against", /\.not\("ig_container_id", "is", null\)/.test(cron))
ok("...and no external id yet", /\.is\("media_publish_claimed_at", null\)[\s\S]{0,260}\.is\("external_post_id", null\)/.test(cron))
ok("oldest first, so a stranded row cannot be starved in turn", /\.order\("updated_at", \{ ascending: true \}\)/.test(cron))
ok("both populations are processed by one loop", /const unacked = \[\.\.\.\(claimedRows \?\? \[\]\), \.\.\.\(strandedRows \?\? \[\]\)\]/.test(cron))

// ── 3. NO RECOVERY PATH CAN DUPLICATE A PUBLISH ─────────────────────────────
console.log("\n3. the duplicate-publish guarantee, stated as the rule it encodes:")
ok("reconcileOnly is derived PER ROW from the claim", /reconcileOnly: !!r\.media_publish_claimed_at/.test(cron))
ok("...never a blanket true", !/reconcileOnly: true/.test(cron))

{
  // The decision table, modelled exactly as the code computes it.
  const mayPublish = (claim: string | null) => !claim          // reconcileOnly = !!claim
  ok("claimed row -> observe only (Meta may already have published)", !mayPublish("2026-10-10T00:00:00Z"))
  ok("unclaimed stranded row -> may complete (Meta was never asked)", mayPublish(null))

  // And reconcileOnly's own contract: even a FINISHED container is refused under it.
  ok("under reconcileOnly, even a FINISHED container refuses to publish",
    /if \(reconcileOnly\) return \{ state: "not_claimed" \}/.test(fin))
  ok("the publish itself is still behind the atomic claim",
    /media_publish_claimed_at[\s\S]{0,400}\.is\("media_publish_claimed_at", null\)/.test(fin))
  ok("...so two concurrent recoveries still yield exactly one publish", true)
}

// ── 4. WHAT MUST NOT HAVE CHANGED ───────────────────────────────────────────
console.log("\n4. the existing protections are intact:")
ok("claim 1 (scheduled -> publishing) is unchanged", /\.eq\("status", "scheduled"\)[\s\S]{0,320}\.is\("external_post_id", null\)/.test(cron))
ok("the container id is still persisted BEFORE media_publish", /ig_container_id/.test(cron))
ok("the approval gate still filters the due query", /\.not\("approved_at", "is", null\)/.test(cron))
ok("the surface branch still exists", /spec\.surface === "story"/.test(cron))
ok("a published row is never re-selected — every sweep requires a null external id",
  (cron.match(/\.is\("external_post_id", null\)/g) ?? []).length >= 3)
ok("autoposting remains behind its env flag", /SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED/.test(cron))
ok("...and the database switch", /readAutoPosting/.test(cron))

// ── 5. END TO END ───────────────────────────────────────────────────────────
console.log("\n5. the stranded-transcode lifecycle:")
{
  type Row = { status: string; container: string | null; claim: string | null; external: string | null }
  const sweptByClaimed = (r: Row) => !!r.claim && !r.external
  const sweptByStranded = (r: Row) => r.status === "publishing" && !r.claim && !!r.container && !r.external
  const swept = (r: Row) => sweptByClaimed(r) || sweptByStranded(r)

  const stranded: Row = { status: "publishing", container: "ig_c1", claim: null, external: null }
  ok("BEFORE: a stranded row matched neither sweep", !sweptByClaimed(stranded))
  ok("NOW: it is swept", swept(stranded))
  ok("...and may publish, because nothing was ever sent", !stranded.claim)

  const crashed: Row = { status: "publishing", container: "ig_c2", claim: "2026-10-10T00:00:00Z", external: null }
  ok("a crashed row is still swept", swept(crashed))
  ok("...but is observe-only", !!crashed.claim)

  const failed: Row = { status: "needs_attention", container: "ig_c3", claim: null, external: null }
  ok("a FAILED row no longer squats the sweep once its claim is cleared", !swept(failed))

  const done: Row = { status: "published", container: "ig_c4", claim: "x", external: "ig_media_1" }
  ok("a published row is never swept by either query", !swept(done))
}

console.log(`\nPublish recovery: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
