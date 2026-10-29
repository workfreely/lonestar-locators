/**
 * TIKTOK SCHEDULING — the worker that cannot publish, and the sibling that stands alone.
 *
 *   npx tsx scripts/social/tiktokScheduling.test.ts
 *
 * Two things are being pinned, and the first matters more than the second.
 *
 * ONE: the worker is INERT. It is deployed so it can be reviewed and verified in production while
 * the Content Posting API audit is under review, and it must be impossible for it to publish or
 * to write a single row in that state. Four gates, each failing closed. Most of this file is
 * about proving the gates rather than the publishing.
 *
 * TWO: Instagram is untouched. Not "we were careful" — asserted, by reading the Instagram worker
 * and checking it still contains no TikTok path and that this file imports none of its helpers.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { tiktokAutopublishEnabled } from "@/lib/social/tiktokGate"
import { canCreateTikTokSibling, tiktokSiblingRowFrom } from "@/lib/social/tiktokSibling"
import { DESTINATIONS } from "@/lib/social/destinations"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`)
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const WORKER = read("app/api/cron/social-tiktok-publish/route.ts")
const IG = read("app/api/cron/social-instagram-publish/route.ts")
const SIBLING = read("lib/social/tiktokSibling.ts")

console.log("\n=== 1. THE LAUNCH SWITCH FAILS CLOSED ===")
{
  ok("armed only by the exact string 'true'", tiktokAutopublishEnabled({ SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED: "true" } as NodeJS.ProcessEnv))
  for (const v of ["", "TRUE", "True", "1", "yes", "on", " true ", "false"]) {
    // " true " is trimmed and DOES arm it; everything else must not. Stated explicitly so the
    // trimming is a decision rather than an accident.
    const expected = v.trim() === "true"
    eq(`"${v}" → ${expected ? "armed" : "disarmed"}`, tiktokAutopublishEnabled({ SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED: v } as NodeJS.ProcessEnv), expected)
  }
  ok("a MISSING variable leaves it disarmed", !tiktokAutopublishEnabled({} as NodeJS.ProcessEnv))
}

console.log("\n=== 2. DISARMED MEANS NOT ONE DATABASE WRITE ===")
{
  // The gate must return before any query. A guard further down could still have claimed a row.
  const gateAt = WORKER.indexOf("if (!tiktokAutopublishEnabled())")
  const firstRead = WORKER.indexOf('.from("social_posts")')
  const firstWrite = WORKER.indexOf(".update(")
  ok("the gate precedes every social_posts read", gateAt > 0 && gateAt < firstRead, `gate@${gateAt} read@${firstRead}`)
  ok("…and every write", gateAt < firstWrite, `gate@${gateAt} write@${firstWrite}`)
  ok("it returns rather than falling through", /if \(!tiktokAutopublishEnabled\(\)\) \{\s*\n\s*return NextResponse\.json/.test(WORKER))
  ok("the auth gate precedes the launch gate", WORKER.indexOf("Unauthorized") < gateAt)
  ok("a missing CRON_SECRET locks the route", /if \(!cronSecret \|\| auth !== `Bearer \$\{cronSecret\}`\)/.test(WORKER))
}

console.log("\n=== 3. THE AUDIT GATE REFUSES EVERY ROW TODAY ===")
{
  // This is the gate that does not depend on an env var, and the one TikTok's approval releases.
  eq("tiktok_video is still awaiting approval", DESTINATIONS.tiktok_video.publish, "awaiting_approval")
  ok("…so the per-row check refuses it", /DESTINATIONS\[destination\]\.publish !== "supported"/.test(WORKER))
  ok("a refused row is left completely untouched — no claim, no status change",
    /publish !== "supported"\) \{\s*\n\s*result\.notPublishableDestination\+\+\s*\n\s*continue/.test(WORKER))
  ok("the refusal sits BEFORE claim 1",
    WORKER.indexOf('publish !== "supported"') < WORKER.indexOf('.eq("status", "scheduled")\n        .is("external_post_id", null)'))
  ok("the same gate guards the Instagram worker, so there is one rule",
    /spec\.publish !== "supported"/.test(IG))
  ok("unaudited still forces SELF_ONLY", /const UNAUDITED = true/.test(WORKER))
  // SUPERSEDED, DELIBERATELY. This used to assert that the worker hardcoded SELF_ONLY, which was
  // right while there was nowhere to record the creator's choice. The worker now REPLAYS a saved
  // decision, so a hardcoded privacy would be the defect. SELF_ONLY is still forced while
  // unaudited — by validateAgainstCreatorInfo, which refuses anything else rather than
  // substituting it. Full rules: scripts/social/tiktokPublishSettings.
  ok("the privacy sent is the creator's saved choice, not a constant",
    /privacyLevel: saved\.privacyLevel/.test(WORKER) && !/privacyLevel: "SELF_ONLY", disableComment: true/.test(WORKER))
  ok("…and unaudited still forces SELF_ONLY, by refusal", /unaudited: UNAUDITED/.test(WORKER))
}

console.log("\n=== 4. DUPLICATE SAFETY — TWO CLAIMS, BOTH CONDITIONAL ===")
{
  ok("claim 1 is guarded on status AND no publish id",
    /\.eq\("status", "scheduled"\)\s*\n\s*\.is\("external_post_id", null\)/.test(WORKER))
  ok("…and a loser skips instead of publishing", /if \(!claimed \|\| claimed\.length === 0\) continue/.test(WORKER))
  ok("claim 2 is taken immediately before init",
    WORKER.indexOf('.is("media_publish_claimed_at", null)') < WORKER.indexOf("initTikTokDirectPost("))
  ok("…and is itself conditional", /\.is\("media_publish_claimed_at", null\)\s*\n\s*\.select\("id"\)/.test(WORKER))
  ok("the publish id is persisted BEFORE the upload, so a crash is reconcilable",
    WORKER.indexOf("external_post_id: publishId") < WORKER.indexOf("uploadTikTokVideoSingleChunk("))
  ok("the due query excludes anything already carrying a publish id",
    /\.eq\("status", "scheduled"\)[\s\S]{0,200}\.is\("external_post_id", null\)/.test(WORKER))
  // A stranded row with no publish id is NOT retried — that is how a duplicate would be born.
  ok("a claimed row with no publish id is failed, never re-posted",
    /claimed for TikTok init but no publish_id recorded/.test(WORKER))
  ok("a row WITH a publish id is observed via status fetch, never re-posted",
    /fetchTikTokPostStatus\(token\.accessToken, String\(r\.external_post_id\)\)/.test(WORKER))
}

console.log("\n=== 5. ONLY EXISTING COLUMNS — NO MIGRATION IS REQUIRED ===")
{
  const EXISTING = ["status", "external_post_id", "publish_attempted_at", "media_publish_claimed_at",
    "published_at", "error_message", "updated_at"]
  const written = [...WORKER.matchAll(/\.update\(\{([^}]*)\}/g)]
    .flatMap((m) => [...m[1].matchAll(/(\w+):/g)].map((x) => x[1]))
  const unknown = [...new Set(written)].filter((c) => !EXISTING.includes(c))
  eq("the worker writes only pre-existing columns", unknown, [])
  // TikTok's intermediate states are re-derivable from the publish id, so no column holds them.
  ok("no intermediate-status column is invented", !/provider_publish_status|tiktok_status/.test(WORKER))
  ok("the sibling's unique index is PREPARED, not applied",
    readFileSync(join(process.cwd(), "supabase/prepared/20261103000000_tiktok_sibling_unique.sql"), "utf8").includes("PREPARED, NOT APPLIED"))
}

console.log("\n=== 6. INSTAGRAM IS UNTOUCHED ===")
{
  ok("the Instagram worker still imports no TikTok helper", !/tiktok/i.test(IG.replace(/No TikTok code path[^\n]*/g, "")))
  ok("the TikTok worker imports no Instagram helper",
    !/from "@\/lib\/social\/instagram/.test(WORKER) && !/instagramFinalize|createReelContainer|createStoryContainer/.test(WORKER))
  ok("the two workers select disjoint rows — IG by platform, TikTok by destination",
    /\.eq\("platform", "instagram"\)/.test(IG) && /\.eq\("destination", "tiktok_video"\)/.test(WORKER))
  ok("they share the approval/pause helpers rather than forking them",
    /readAutoPosting|publishHoldDecision/.test(WORKER) && /readAutoPosting|publishHoldDecision/.test(IG))
}

console.log("\n=== 7. THE SIBLING STANDS ALONE ===")
{
  const reel = {
    id: "r1", owner_user_id: "u1", source_content_id: "c1", destination: "instagram_reel",
    post_name: "Mirasol 2BR", caption: "come see it", approved_at: "2026-10-20T00:00:00Z",
    rendered_storage_path: "renders/ig.mp4", render_status: "ready", render_version: 4,
    follows_post_id: null, scheduled_at: "2026-10-21T15:00:00Z", connection_id: "conn-ig",
  }
  ok("an approved Reel may be copied", canCreateTikTokSibling(reel).ok)
  ok("an unapproved one may not", !canCreateTikTokSibling({ ...reel, approved_at: null }).ok)
  ok("a Story companion is not an original", !canCreateTikTokSibling({ ...reel, follows_post_id: "r0" }).ok)
  ok("a TikTok post is not copied again", !canCreateTikTokSibling({ ...reel, destination: "tiktok_video" }).ok)
  ok("a null destination is treated as a Reel, as history requires", canCreateTikTokSibling({ ...reel, destination: null }).ok)

  const sib = tiktokSiblingRowFrom(reel, "r1")
  eq("it targets TikTok", [sib.platform, sib.destination], ["tiktok", "tiktok_video"])
  eq("the creative travels", [sib.source_content_id, sib.caption, sib.post_name], ["c1", "come see it", "Mirasol 2BR"])
  // INDEPENDENCE — each of these would make it act on its own before a human said so.
  eq("it inherits NO schedule", sib.scheduled_at, null)
  eq("…NO approval", sib.approved_at, null)
  eq("…NO connection", sib.connection_id, null)
  eq("…and starts as a draft", sib.status, "draft")
  // THE ONE THAT MATTERS MOST: TikTok geometry differs, so the Instagram artifact is wrong pixels.
  eq("it does NOT reuse the Instagram render", sib.rendered_storage_path, null)
  eq("…and must be rendered for TikTok first", sib.render_status, "none")
  ok("the two destinations genuinely differ in geometry",
    DESTINATIONS.instagram_reel.safeAreaId !== DESTINATIONS.tiktok_video.safeAreaId)
  // NOT a companion: the Story release machinery must never see this row.
  eq("it is not linked as a companion", sib.follows_post_id, null)
  ok("the module never writes to the original", !/\.update\(|\.delete\(/.test(SIBLING))
  ok("a uniqueness violation is treated as success", /code === "23505"/.test(SIBLING))
  // Read RAW, not stripped: the honesty is in a comment, which is exactly where it belongs and
  // exactly what strip() removes.
  ok("…and the file is honest that the index is not applied yet",
    /PREPARED AND NOT APPLIED/.test(readFileSync(join(process.cwd(), "lib/social/tiktokSibling.ts"), "utf8")))
}

console.log("\n=== 8. THE UNRESOLVED REQUIREMENT IS RECORDED, NOT BYPASSED ===")
{
  // An unattended post cannot collect the creator's privacy/disclosure choices. The worker says
  // so in writing rather than inventing them.
  // Also superseded: the gap these described — "the creator's choices have nowhere to live" — is
  // what the three saved-settings columns closed.
  const RAW_WORKER = readFileSync(join(process.cwd(), "app/api/cron/social-tiktok-publish/route.ts"), "utf8")
  ok("the file explains how an unattended post stays compliant",
    /HOW THIS STAYS COMPLIANT WITHOUT A CREATOR PRESENT/.test(RAW_WORKER))
  ok("…including that no decision means no post", /NO DECISION, NO POST/.test(RAW_WORKER))
  ok("…and that a stale decision stops rather than degrades", /STALE DECISIONS STOP, THEY DO NOT DEGRADE/.test(RAW_WORKER))
  ok("the disclosure sent is the creator's saved choice", /saved\.disclosure !== "none"/.test(WORKER))
  ok("the worker is not wired into vercel.json",
    !readFileSync(join(process.cwd(), "vercel.json"), "utf8").includes("social-tiktok-publish"))
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
