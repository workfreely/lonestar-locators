/**
 * SOCIAL BEAST — the master Auto Posting switch and the two-gate publishing rule.
 *
 * Two properties matter here, and both are about NOT doing something:
 *
 *   1. Publishing requires BOTH gates affirmative. Env flag off, setting paused, setting
 *      unreadable, setting missing, setting garbage — every one of those publishes nothing.
 *   2. Resuming after a pause does not fire the backlog. Pausing two days at 9am/7pm leaves four
 *      due posts; a worker that only asks "is it due?" publishes all four in a row. That is the
 *      bug this file is for.
 *
 * Run: npx tsx scripts/social/autoPosting.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  readAutoPosting, normalizeAutoPosting, isEligibleAfterResume, isWithinLatenessWindow,
  AUTO_POSTING_FALLBACK, MAX_LATENESS_MS, type AutoPostingSettings,
} from "@/lib/social/autoPosting"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const WORKER = "app/api/cron/social-instagram-publish/route.ts"
const MIG = "supabase/manual/20261004_social_settings_auto_posting.sql"
const API = "app/api/admin/social-autopilot/auto-posting/route.ts"
const UI = "components/crm/social/AutoPostingControl.tsx"

/** A db stub whose maybeSingle() can return a row, no row, or an error. */
const db = (res: { data?: unknown; error?: unknown } | "throw") => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (res === "throw") throw new Error("connection reset")
          return res
        },
      }),
    }),
  }),
})

const ISO = (ms: number) => new Date(ms).toISOString()

async function main() {
  console.log("\nAUTO POSTING — MASTER SWITCH + BACKLOG SAFETY\n")

  const worker = strip(read(WORKER))
  const mig = read(MIG)

  console.log("THE SCHEMA FAILS CLOSED BY DEFAULT:")
  {
    ok("the column defaults to 'paused'", /auto_posting\s+text not null default 'paused'/.test(mig))
    ok("…and only the two real states are storable",
      /check \(auto_posting in \('on','paused'\)\)/.test(mig))
    ok("there is a resume stamp (the backlog rule depends on it)",
      /auto_posting_resumed_at\s+timestamptz/.test(mig))
    ok("RLS is enabled with an actual policy (not enabled-and-empty)",
      /alter table public\.social_settings enable row level security/.test(mig) &&
      /create policy "platform admin owns social settings"/.test(mig))
    // The state change and the stamp must be inseparable.
    ok("one SECURITY DEFINER writer owns the transition",
      /create or replace function public\.sa_set_auto_posting/.test(mig) && /security definer/.test(mig))
    ok("…and it re-stamps ONLY on a transition into 'on'",
      /when excluded\.auto_posting = 'on' and s\.auto_posting <> 'on' then now\(\)/.test(mig))
    ok("…so re-saving 'on' while already on keeps the original stamp",
      /when excluded\.auto_posting = 'on' then s\.auto_posting_resumed_at/.test(mig))
    ok("no backfill — the table is created empty", !/\binsert into public\.social_settings\b[\s\S]{0,200}select/i.test(mig.split("create or replace function")[0] ?? ""))
  }

  console.log("\n(5) A SETTING THAT CANNOT BE READ IS PAUSED:")
  {
    ok("the shared fallback is paused", AUTO_POSTING_FALLBACK.state === "paused")
    const err = await readAutoPosting(db({ data: null, error: { message: "boom" } }) as never, "u1")
    ok("a query ERROR → paused", err.state === "paused")
    ok("…and is reported as unreadable, not as a confident 'you paused it'", err.unreadable === true)
    const thrown = await readAutoPosting(db("throw") as never, "u1")
    ok("a THROWN error → paused + unreadable", thrown.state === "paused" && thrown.unreadable === true)
    const missing = await readAutoPosting(db({ data: null }) as never, "u1")
    ok("a MISSING row → paused", missing.state === "paused")
    ok("…and is NOT flagged unreadable (absent is a known answer)", !missing.unreadable)
    const garbage = await readAutoPosting(db({ data: { auto_posting: "ON", auto_posting_resumed_at: null } }) as never, "u1")
    ok("an unrecognised value ('ON', wrong case) → paused", garbage.state === "paused")
    ok("only the exact string 'on' is on",
      normalizeAutoPosting("on") === "on" &&
      ["ON", "On", "true", 1, null, undefined, {}, ""].every((v) => normalizeAutoPosting(v) === "paused"))
    const good = await readAutoPosting(db({ data: { auto_posting: "on", auto_posting_resumed_at: "2026-10-04T12:00:00Z" } }) as never, "u1")
    ok("a real 'on' row reads as on, with its stamp", good.state === "on" && good.resumedAt === "2026-10-04T12:00:00Z")
  }

  console.log("\n(1)(2)(3)(4) BOTH GATES ARE REQUIRED:")
  {
    // Gate 1 — the env flag.
    ok("(1) a MISSING env flag reads as off",
      /\(process\.env\.SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED \?\? ""\)\.trim\(\) === "true"/.test(worker))
    ok("(2) 'false' reads as off too — only the exact 'true' arms it",
      !/!== "false"/.test(worker) && !/toLowerCase\(\)[\s\S]{0,30}=== "true"/.test(worker))
    // Gate 2 — the setting. Must be checked server-side in the worker, not just the UI.
    ok("(3) the worker itself reads the setting", /readAutoPosting\(|readAutoPostingForSoleOwner\(/.test(worker))
    ok("…and returns unless it is exactly 'on'", /if \(settings\.state !== "on"\)/.test(worker))
    ok("(4) only with both affirmative does the worker reach the due query",
      worker.indexOf('if (settings.state !== "on")') < worker.indexOf('.eq("status", "scheduled")'))

    // Ordering: BOTH gates precede every read and write. A gate after a claim is not a gate.
    const envAt = worker.indexOf("if (!autopublishEnabled())")
    const setAt = worker.indexOf('if (settings.state !== "on")')
    const claimAt = worker.indexOf('status: "publishing"')
    const metaAt = worker.indexOf("createReelContainer(")
    const dueAt = worker.indexOf('.eq("status", "scheduled")')
    const reconcileAt = worker.indexOf("reconcileOnly: true")
    ok("env gate precedes the setting gate", envAt > 0 && envAt < setAt)
    ok("both gates precede the due query", Math.max(envAt, setAt) < dueAt)
    ok("both gates precede the reconcile sweep", Math.max(envAt, setAt) < reconcileAt)
    ok("both gates precede any claim", Math.max(envAt, setAt) < claimAt)
    ok("both gates precede any Meta call", Math.max(envAt, setAt) < metaAt)
    ok("CRON_SECRET auth still runs before both", worker.indexOf("Unauthorized") < envAt)
    ok("a gated run says WHICH gate stopped it", /Auto Posting is PAUSED/.test(worker) && /disarmed/.test(worker))
    ok("…and distinguishes 'paused' from 'could not be read'", /could not be read/.test(worker))
  }

  console.log("\n(7) RESUMING DOES NOT BLAST THE BACKLOG — the 9am/7pm two-day pause:")
  {
    const resumedAt = Date.parse("2026-10-04T10:00:00Z")
    const on: AutoPostingSettings = { state: "on", resumedAt: ISO(resumedAt) }

    // Four posts whose time passed DURING the pause.
    const missed = [
      "2026-10-02T14:00:00Z", // day 1, 9am
      "2026-10-03T00:00:00Z", // day 1, 7pm
      "2026-10-03T14:00:00Z", // day 2, 9am
      "2026-10-04T00:00:00Z", // day 2, 7pm
    ]
    ok("all four missed posts are INELIGIBLE after resume",
      missed.every((s) => !isEligibleAfterResume(s, on)), JSON.stringify(missed.map((s) => isEligibleAfterResume(s, on))))

    // (8) The next genuinely-future post still works.
    ok("(8) a post scheduled AFTER the resume is eligible",
      isEligibleAfterResume(ISO(resumedAt + 60 * 60 * 1000), on))
    ok("…and one exactly AT the resume instant is eligible (boundary is inclusive)",
      isEligibleAfterResume(ISO(resumedAt), on))
    ok("…while one a second BEFORE is not", !isEligibleAfterResume(ISO(resumedAt - 1000), on))

    // Paused state never publishes regardless of timing.
    ok("nothing is eligible while paused",
      !isEligibleAfterResume(ISO(resumedAt + 9e6), { state: "paused", resumedAt: ISO(resumedAt) }))
    // Anomalies fail closed rather than being guessed in the publishing direction.
    ok("'on' with NO resume stamp is not eligible (anomaly fails closed)",
      !isEligibleAfterResume(ISO(resumedAt + 9e6), { state: "on", resumedAt: null }))
    ok("an unparseable scheduled_at is not eligible", !isEligibleAfterResume("not-a-date", on))
    ok("a null scheduled_at is not eligible", !isEligibleAfterResume(null, on))

    // The same hazard arriving without a pause (cron outage / deploy gap).
    const now = Date.parse("2026-10-04T12:00:00Z")
    ok("a post 10 minutes late is still within the lateness window",
      isWithinLatenessWindow(ISO(now - 10 * 60 * 1000), now))
    ok("a post 3 hours late is NOT", !isWithinLatenessWindow(ISO(now - 3 * 60 * 60 * 1000), now))
    ok("the window is 2 hours", MAX_LATENESS_MS === 2 * 60 * 60 * 1000)
    ok("…and the worker applies it as a separate skip", /isWithinLatenessWindow\(/.test(worker) && /tooLate\+\+/.test(worker))
  }

  console.log("\n(6) PAUSING PRESERVES SCHEDULED POSTS:")
  {
    // The strongest form of this claim: no code path in the switch or the worker can remove or
    // reschedule a post.
    const api = strip(read(API))
    ok("the switch API never touches social_posts", !/social_posts/.test(api))
    ok("…and writes ONLY through the state-transition RPC",
      /rpc\("sa_set_auto_posting"/.test(api) && !/\.from\("social_settings"\)[\s\S]{0,120}\.(update|insert|upsert)\(/.test(api))
    ok("the worker never deletes a post", !/\.delete\(\)/.test(worker))
    ok("…and never rewrites scheduled_at", !/scheduled_at:/.test(worker))
    // A skipped post is COUNTED, not mutated.
    ok("a missed post is counted and left alone", /missedWhilePaused\+\+;?\s*\n\s*continue/.test(worker))
    ok("…and surfaced in the worker's result", /missedWhilePaused: 0/.test(worker) && /tooLate: 0/.test(worker))
  }

  console.log("\n(9) TIKTOK IS UNTOUCHED:")
  {
    // Stripped of comments: the header prose legitimately EXPLAINS that TikTok is separate.
    ok("the switch API has no TikTok code path", !/tiktok/i.test(strip(read(API))))
    ok("the settings lib has no TikTok code path", !/tiktok/i.test(strip(read("lib/social/autoPosting.ts"))))
    ok("the worker still mentions no TikTok", !/tiktok/i.test(worker))
    ok("the migration touches no TikTok table", !/tiktok/i.test(mig))
    // The master switch governs the IG worker only; TikTok's own path is unchanged.
    const tt = read("app/api/integrations/tiktok/publish/route.ts")
    ok("the TikTok publish route does NOT read the master switch",
      !/auto_posting|readAutoPosting|social_settings/.test(tt))
    ok("…so turning Auto Posting ON cannot start a TikTok post", !/sa_set_auto_posting/.test(tt))
    ok("…and no import of the settings lib leaks into it", !/autoPosting/.test(tt))
  }

  console.log("\nPRESERVATION — the switch changes nothing else:")
  {
    const api = read(API)
    const lib = read("lib/social/autoPosting.ts")
    for (const [label, pattern] of [
      ["drafts/captions/hashtags", /social_content|caption|hashtags/],
      ["renders", /render_status|rendered_storage_path/],
      ["Property Research", /social_property_observations|social_floorplan_observations/],
      ["Property Intelligence", /property_catalog|property_floor_plans|property_attributes|property_specials/],
    ] as const) {
      ok(`the switch never touches ${label}`, !pattern.test(api) && !pattern.test(lib))
    }
    ok("the migration creates ONE table and nothing else",
      (mig.match(/create table/gi) ?? []).length === 1 &&
      !/alter table public\.social_posts|alter table public\.social_content/.test(mig))
  }

  console.log("\nTHE UI IS A CONTROL, NOT A GUARD:")
  {
    const ui = strip(read(UI))
    ok("PAUSED is styled as a warning, not a neutral chip", /amber/.test(ui))
    ok("…and ON reads as healthy", /emerald/.test(ui))
    ok("the status pill is read-only (no toggle in that mode)",
      /mode === "status"/.test(ui) && !/mode === "status"[\s\S]{0,400}onClick=\{toggle\}/.test(ui))
    ok("an unknown state renders as PAUSED, matching the server", /setState\("paused"\)/.test(ui))
    ok("the stored value is trusted over the requested one",
      /j\.autoPosting === "on" \? "on" : "paused"/.test(ui))
    ok("the backlog rule is explained where the decision is made", /missed while paused/i.test(ui))
    // The real enforcement is server-side; the component must not be mistaken for the gate.
    ok("the control never calls the publish routes", !/\/publish/.test(ui))
    ok("it is wired into Accounts (authoritative) and the Queue (status)",
      /<AutoPostingControl \/>/.test(read("app/admin/social-autopilot/accounts/page.tsx")) &&
      /<AutoPostingControl mode="status" \/>/.test(read("components/crm/social/QueueClient.tsx")))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
