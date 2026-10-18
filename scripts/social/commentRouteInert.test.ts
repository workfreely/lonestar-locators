// Comments — THE DEPLOYED ROUTES ARE INERT WHEN AUTOMATION IS DISABLED.
//
// The other suites test functions. This one calls the ACTUAL exported route handlers — the same
// code Vercel will invoke — and proves that with SOCIAL_COMMENT_AUTOMATION_ENABLED unset they
// authenticate, answer, and do nothing else.
//
// ── WHY ONE TRIPWIRE PROVES BOTH CLAIMS ─────────────────────────────────────────────────────
// globalThis.fetch is replaced BEFORE the routes are imported, so the Supabase client picks up the
// recorder too. supabase-js issues every query over fetch. Therefore "zero fetch calls" is a
// single observation that proves BOTH no Meta request AND no database query — not two separate
// arguments, and not a reading of the code.
// Run: npx tsx scripts/social/commentRouteInert.test.ts
import crypto from "node:crypto"
import fs from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

// Supabase's admin client reads these at module load, so they must exist before the import below.
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

// Test-only values for the two secrets that live in Vercel and not on disk. They are invented here
// so the handshake and signature paths can be exercised at all; neither reaches a real service.
const APP_SECRET = "test-only-app-secret"
const CRON_SECRET = "test-only-cron-secret"
process.env.INSTAGRAM_APP_SECRET = APP_SECRET
process.env.CRON_SECRET = CRON_SECRET
process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "test-only-verify-token"
// THE CONDITION UNDER TEST: the kill switch is absent, exactly as it will be on the first deploy.
delete process.env.SOCIAL_COMMENT_AUTOMATION_ENABLED
delete process.env.SOCIAL_COMMENT_SEND_ENABLED

// ── THE TRIPWIRE, INSTALLED BEFORE ANY ROUTE OR CLIENT IS CONSTRUCTED ───────────────────────
const attempted: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: unknown, init?: unknown) => {
  const url = String(typeof input === "object" && input !== null && "url" in input ? (input as { url: string }).url : input)
  attempted.push(url)
  void init
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
}) as typeof fetch

const sign = (body: string) => `sha256=${crypto.createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")}`

const PAYLOAD = JSON.stringify({
  object: "instagram",
  entry: [{
    id: "17841436885324014", time: Math.floor(Date.now() / 1000),
    changes: [{ field: "comments", value: { id: "c-inert-1", text: "LIST please!", from: { id: "u1", username: "renter.jane" }, media: { id: "m1" } } }],
  }],
})

async function main() {
  const webhook = await import("@/app/api/webhooks/instagram/route")
  const poll = await import("@/app/api/cron/social-comment-poll/route")

  console.log("1. THE WEBHOOK REFUSES WHAT IT SHOULD, BEFORE DOING ANYTHING:")
  {
    attempted.length = 0
    const unsigned = await webhook.POST(new Request("https://x/api/webhooks/instagram", { method: "POST", body: PAYLOAD }))
    ok("an UNSIGNED delivery is refused 403", unsigned.status === 403)

    const wrong = await webhook.POST(new Request("https://x/api/webhooks/instagram", {
      method: "POST", body: PAYLOAD, headers: { "x-hub-signature-256": `sha256=${"0".repeat(64)}` },
    }))
    ok("a WRONGLY SIGNED delivery is refused 403", wrong.status === 403)

    const tampered = await webhook.POST(new Request("https://x/api/webhooks/instagram", {
      method: "POST", body: JSON.stringify({ object: "instagram", entry: [{ id: "evil" }] }),
      headers: { "x-hub-signature-256": sign(PAYLOAD) },
    }))
    ok("a TAMPERED body is refused 403", tampered.status === 403)

    ok("none of the three refusals touched the network or the database", attempted.length === 0, attempted.join(", "))
    ok("…and no refusal leaks the reason to the caller",
      !(await unsigned.clone().text()).toLowerCase().includes("configured"))
  }

  console.log("\n2. A VALID DELIVERY IS ACCEPTED AND DOES NOTHING (the inert state):")
  {
    attempted.length = 0
    const res = await webhook.POST(new Request("https://x/api/webhooks/instagram", {
      method: "POST", body: PAYLOAD, headers: { "x-hub-signature-256": sign(PAYLOAD) },
    }))
    const body = await res.json() as { ok: boolean; inert?: boolean; reason?: string; processed: number }
    ok("a correctly signed delivery returns 200", res.status === 200)
    ok("…and reports itself inert, so Meta does not retry a decision", body.inert === true)
    ok("…with the reason automation_disabled", body.reason === "automation_disabled")
    ok("…and processed 0 comments", body.processed === 0)
    // THE CLAIM, OBSERVED: supabase-js queries over fetch, so zero calls means zero DB reads too.
    ok("ZERO network AND ZERO database activity — one tripwire, both claims",
      attempted.length === 0, attempted.join(", "))
  }

  console.log("\n3. THE HANDSHAKE STILL WORKS WHILE INERT (so the subscription can be created):")
  {
    attempted.length = 0
    const good = await webhook.GET(new Request("https://x/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=test-only-verify-token&hub.challenge=12345"))
    ok("a correct handshake echoes the bare challenge", good.status === 200 && (await good.text()) === "12345")
    const bad = await webhook.GET(new Request("https://x/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"))
    ok("a wrong verify token is refused 403", bad.status === 403)
    ok("the handshake touches nothing", attempted.length === 0)
  }

  console.log("\n4. THE CRON ROUTE:")
  {
    attempted.length = 0
    const noauth = await poll.GET(new Request("https://x/api/cron/social-comment-poll") as never)
    ok("no bearer token is refused 401", noauth.status === 401)

    const wrongauth = await poll.GET(new Request("https://x/api/cron/social-comment-poll", {
      headers: { authorization: "Bearer nope" },
    }) as never)
    ok("a wrong bearer token is refused 401", wrongauth.status === 401)

    const authed = await poll.GET(new Request("https://x/api/cron/social-comment-poll", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }) as never)
    const body = await authed.json() as { ok: boolean; inert?: boolean; reason?: string; calls: number; processed: number }
    ok("the correct bearer token is accepted 200", authed.status === 200)
    ok("…and the run reports itself inert", body.inert === true && body.reason === "automation_disabled")
    ok("…having spent ZERO Meta calls", body.calls === 0)
    ok("…and processed ZERO comments", body.processed === 0)
    ok("ZERO network AND ZERO database activity for the whole cron run",
      attempted.length === 0, attempted.join(", "))

    // POST is wired to the same handler, so Vercel's invocation method cannot change the outcome.
    const posted = await poll.POST(new Request("https://x/api/cron/social-comment-poll", {
      method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` },
    }) as never)
    ok("POST behaves identically to GET", posted.status === 200 && attempted.length === 0)
  }

  console.log("\n5. THE CONTROL — the tripwire genuinely catches activity:")
  {
    // Without this, every "zero requests" assertion above could be passing because the harness is
    // broken rather than because the routes are inert.
    attempted.length = 0
    await fetch("https://example.invalid/control")
    ok("a deliberate request IS recorded by the tripwire", attempted.length === 1)
  }
}

main().then(() => {
  globalThis.fetch = realFetch
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1) })
