/**
 * AUTOMATIC AI INSIGHT REFRESH — change detection, settle window, and the safety
 * boundary that keeps this path incapable of messaging a client.
 *
 * Part 3 exists so a client's brief refreshes on its own after they text. The risk
 * is not that it fails — it is that it quietly grows a path into the Follow-Up
 * Agent, which lives in the same codebase and DOES send messages. The second half
 * of this suite is therefore a structural contract, not a style check: it asserts
 * the refresh path cannot import, reference, or create anything in that system.
 *
 * Run: npx tsx scripts/tests/insightsRefresh.test.ts
 */
import { readFileSync } from "node:fs"

// insightsRefresh imports supabaseAdmin, which constructs its client at module
// load. Only the PURE decideRefresh is exercised here, so placeholder values are
// enough to let the module load — no client is ever used, and no network call is
// made. (Set before the dynamic import below; a static import would evaluate
// first and throw.)
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-a-real-key"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`)
  }
}

const LIB = "lib/ai/insightsRefresh.ts"
const ROUTE = "app/api/cron/insights-refresh/route.ts"
const lib = readFileSync(LIB, "utf8")
const route = readFileSync(ROUTE, "utf8")

/**
 * Strip block AND line comments before scanning for forbidden references.
 *
 * Both files DOCUMENT the boundary ("never creates lead_followup_runs…"), so a
 * naive scan flags the very prose that explains the rule. The contract is about
 * executable code, so comments are removed first — and the scan stays strict on
 * what remains.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
}
const libCode = code(lib)
const routeCode = code(route)

async function main() {
  const { decideRefresh, SETTLE_WINDOW_MS, MAX_REFRESH_PER_TICK } = await import("../../lib/ai/insightsRefresh")

  const NOW = new Date("2026-10-02T12:00:00.000Z")
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
  const cur = (over: Partial<{ leadId: number; messageCount: number; lastMessageDate: string }> = {}) => ({
    leadId: 84,
    messageCount: 30,
    lastMessageDate: ago(SETTLE_WINDOW_MS + 60_000), // comfortably settled
    ...over,
  })

  console.log("\nAI INSIGHT REFRESH\n")

  console.log("Unchanged conversations cost no model call")
  {
    const c = cur()
    const d = decideRefresh(NOW, c, { messageCount: 30, lastMessageDate: c.lastMessageDate })
    check("identical count + newest message => unchanged", d.status === "unchanged", d.status)
    check(
      "…even when the timestamp is formatted differently (offset vs Z)",
      decideRefresh(NOW, { ...c, lastMessageDate: "2026-10-01T22:08:04.004+00:00" }, {
        messageCount: 30,
        lastMessageDate: "2026-10-01T22:08:04.004Z",
      }).status === "unchanged",
    )
    check(
      "…and an unchanged lead is never 'settled' (no call is made)",
      decideRefresh(NOW, c, { messageCount: 30, lastMessageDate: c.lastMessageDate }).status !== "changed_settled",
    )
  }

  console.log("\nChange detection uses message_count + last_message_date")
  {
    const c = cur()
    check(
      "a NEW message (count differs) => changed",
      decideRefresh(NOW, c, { messageCount: 29, lastMessageDate: c.lastMessageDate }).status === "changed_settled",
    )
    check(
      "a newer message (date differs) => changed",
      decideRefresh(NOW, c, { messageCount: 30, lastMessageDate: ago(SETTLE_WINDOW_MS + 600_000) }).status === "changed_settled",
    )
    check("no brief at all => changed", decideRefresh(NOW, c, null).status === "changed_settled")
    check(
      "a brief with null bookkeeping => changed (never silently 'unchanged')",
      decideRefresh(NOW, c, { messageCount: null, lastMessageDate: null }).status === "changed_settled",
    )
    check(
      "count matches but date missing => changed",
      decideRefresh(NOW, c, { messageCount: 30, lastMessageDate: null }).status === "changed_settled",
    )
    check(
      "last_message_rowid is NOT used (companion transcripts always return null for it)",
      !/last_message_rowid/.test(libCode),
      "using it would make every lead look permanently changed",
    )
  }

  console.log("\nActive conversations are debounced, not summarised mid-exchange")
  {
    check(
      "a message 10s ago => still settling",
      decideRefresh(NOW, cur({ lastMessageDate: ago(10_000) }), null).status === "changed_unsettled",
    )
    check(
      "just inside the window => still settling",
      decideRefresh(NOW, cur({ lastMessageDate: ago(SETTLE_WINDOW_MS - 1_000) }), null).status === "changed_unsettled",
    )
    check(
      "exactly at the window => settled",
      decideRefresh(NOW, cur({ lastMessageDate: ago(SETTLE_WINDOW_MS) }), null).status === "changed_settled",
    )
    check(
      "well past the window => settled",
      decideRefresh(NOW, cur({ lastMessageDate: ago(SETTLE_WINDOW_MS * 10) }), null).status === "changed_settled",
    )
    check("the window is ~150s as designed", SETTLE_WINDOW_MS === 150_000, String(SETTLE_WINDOW_MS))
    check("a fan-out cap exists", MAX_REFRESH_PER_TICK > 0 && MAX_REFRESH_PER_TICK <= 50, String(MAX_REFRESH_PER_TICK))
  }

  console.log("\nIdempotency: regenerate once, then stop")
  {
    // The real cycle: changed -> refresh writes count+date into the brief -> unchanged.
    const c = cur()
    const before = decideRefresh(NOW, c, { messageCount: 29, lastMessageDate: ago(SETTLE_WINDOW_MS + 600_000) })
    const after = decideRefresh(NOW, c, { messageCount: c.messageCount, lastMessageDate: c.lastMessageDate })
    check("first sweep refreshes", before.status === "changed_settled")
    check("second sweep is a no-op", after.status === "unchanged")
    check(
      "…because syncAiInsights stores exactly the two fields we compare",
      /message_count/.test(readFileSync("lib/ai/syncAiInsights.ts", "utf8")) &&
        /last_message_date/.test(readFileSync("lib/ai/syncAiInsights.ts", "utf8")),
    )
    check("no lock / in-progress state was introduced", !/lock|in_progress|claimed|mutex/i.test(libCode))
  }

  console.log("\nFailure is isolated and self-retrying")
  {
    check("each lead is refreshed inside its own try/catch", /try \{[\s\S]{0,200}syncAiInsights\([\s\S]{0,200}\} catch/.test(lib))
    check("…a failure increments `failed` rather than throwing", /summary\.failed\+\+/.test(lib))
    check("…and leaves the brief untouched so the next sweep retries", /retried on the next sweep/.test(lib))
    check("a read error returns an empty summary instead of throwing", /could not read companion messages/.test(lib))
    check("the route reports failure honestly (never ok:true on throw)", /ok: false, error: "refresh_failed"/.test(route))
  }

  console.log("\nLogging distinguishes the five states, without message bodies")
  {
    check("1. nothing to check", /no attributed conversations yet/.test(lib))
    check("2. none need refresh", /none need refresh/.test(lib))
    check("3. changed but still settling", /changed but still active/.test(lib))
    check("4. refresh attempted", /changed and settled[\s\S]{0,40}refreshing/.test(lib))
    check("5. refresh succeeded", /refreshed`\)/.test(lib))
    check("6. refresh failed", /refresh FAILED/.test(lib))
    check(
      "no message body is ever selected",
      !/\bbody\b/.test(lib) && /\.select\("lead_id, sent_at"\)/.test(lib),
      "only lead_id and sent_at are read",
    )
    check("…nor logged", !/console\.(log|error)\([^)]*body/i.test(lib))
  }

  console.log("\nSTRUCTURAL SAFETY BOUNDARY — this path cannot message a client")
  {
    for (const [label, src] of [["lib", libCode], ["route", routeCode]] as const) {
      check(`${label}: no import from lib/followup/`, !/lib\/followup/.test(src))
      check(`${label}: never references lead_followup_runs`, !/lead_followup_runs/.test(src))
      check(`${label}: never references followup_outbound_intents`, !/followup_outbound_intents/.test(src))
      check(`${label}: never touches followup_opt_in`, !/followup_opt_in/.test(src))
      check(`${label}: never touches sms_opt_in`, !/sms_opt_in/.test(src))
      check(`${label}: no send/enroll/evaluate entry points`, !/evaluateSend|enrollLifecycleRuns|insertIntent|runClaim|claimIntent|sendNotification|twilio/i.test(src))
    }

    // The ONLY table this path may write.
    const writes = [...lib.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])
    check(`reads only companion_messages + ai_client_briefs (saw: ${writes.join(", ")})`,
      writes.every((t) => t === "companion_messages" || t === "ai_client_briefs"))
    check("no insert/upsert/delete in the sweeper itself", !/\.(insert|upsert|delete)\(/.test(lib),
      "the only write happens inside the existing syncAiInsights")

    // It must live on its own cron, not inside the dispatcher.
    const tick = readFileSync("app/api/cron/followup-tick/route.ts", "utf8")
    check("followup-tick does NOT call the refresh", !/insightsRefresh|refreshSettledInsights/.test(tick))
    check("…and the refresh route does not call the dispatcher", !/followup-tick|dispatcher|tick\(/.test(routeCode))
    check("the refresh route is its own path", /app\/api\/cron\/insights-refresh/.test(ROUTE))

    // Ingest stays untouched this pass.
    const ingest = readFileSync("app/api/companion/messages/route.ts", "utf8")
    check("/api/companion/messages was NOT modified to trigger refresh",
      !/insightsRefresh|refreshSettledInsights|syncAiInsights/.test(ingest))

    check("the cron route is CRON_SECRET authenticated", /Bearer \$\{cronSecret\}/.test(route))
    check("…and 401s without it", /status: 401/.test(route))

    const vercel = readFileSync("vercel.json", "utf8")
    check("scheduled every 2 minutes", /"\/api\/cron\/insights-refresh"[\s\S]{0,60}"\*\/2 \* \* \* \*"/.test(vercel))
    check("followup-tick's own schedule is unchanged", /"\/api\/cron\/followup-tick"[\s\S]{0,60}"\* \* \* \* \*"/.test(vercel))
  }


}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
