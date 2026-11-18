// WHEN META REFUSES THE LONG-LIVED EXCHANGE, SAY WHY — AND LEAK NOTHING SAYING IT.
//
// @locatorbeast authorized successfully three times on 18 Nov 2026 and never connected. The log
// said "ig long-lived exchange failed: 400" and nothing else, because the exchange threw the HTTP
// status and discarded the body — so a refusal that Meta had explained in detail arrived as a bare
// number, and the next step was guesswork.
//
// ── THE HAZARD THIS CODE SITS NEXT TO ───────────────────────────────────────────────────────
// The request URL for that call carries client_secret AND the short-lived access token in its
// query string. That is precisely why the callback logs a MESSAGE rather than the error object:
// a thrown fetch error can carry the request URL, and a stack can carry a cause chain. So the
// bar for this change is not "is the extra detail useful" — it is "can any path through it put a
// secret in a log". Most of what follows is that question.
//
// Reads source and calls the pure describer. Contacts nothing.
// Run: npx tsx scripts/social/instagramExchangeDiagnostics.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { describeGraphError } from "../../lib/social/instagram"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `  — ${d}` : ""}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const IG = code(read("lib/social/instagram.ts"))
const CALLBACK = code(read("app/api/admin/social-autopilot/accounts/instagram/callback/route.ts"))

// The real shape of a Meta Graph refusal.
const META_400 = JSON.stringify({
  error: {
    message: "Invalid platform app",
    type: "OAuthException",
    code: 190,
    error_subcode: 2207026,
    fbtrace_id: "A1bCdEfGhIjK",
  },
})

// ── 1. IT NAMES THE CAUSE ─────────────────────────────────────────────────────────────────────
console.log("the three fields that name a cause survive:")

const described = describeGraphError(META_400)
ok("the error code is reported", /code 190/.test(described), described)
ok("the subcode is reported", /subcode 2207026/.test(described), described)
ok("the type is reported", /OAuthException/.test(described), described)
ok("the message is reported", /Invalid platform app/.test(described), described)

// A subcode of 0 is a real value Meta sends; "" and null are not. String codes appear too.
ok("a zero subcode is still reported, not dropped as falsy",
  /subcode 0/.test(describeGraphError(JSON.stringify({ error: { code: 1, error_subcode: 0 } }))))
ok("a string code is handled", /code 190/.test(describeGraphError(JSON.stringify({ error: { code: "190" } }))))
ok("an empty-string field is omitted rather than printed blank",
  !/type/.test(describeGraphError(JSON.stringify({ error: { code: 1, type: "   " } }))))

// ── 2. NOTHING SECRET CAN COME OUT ────────────────────────────────────────────────────────────
// The describer is handed a body from the network. Everything below is a body an unlucky or
// hostile provider response could plausibly contain.
console.log("\nno credential can reach the log through it:")

const SECRETS = [
  ["an access token in the message", `IGQVJYeHNhbHRlZF9faGVsbG8gd29ybGQgdGhpcyBpcyBsb25n`],
  ["a Facebook token in the message", `EAAGm0PX4ZCpsBAJ8ZBhVZCZCZBZBhelloworldthisislong`],
  ["a client secret in a query echo", `client_secret=9f8e7d6c5b4a39281706f5e4d3c2b1a0`],
  ["an access token in a query echo", `access_token=IGQVJabcdefghijklmnopqrstuvwxyz0123456789`],
  ["an authorization code in a query echo", `code=AQBx7f3kLmNoPqRsTuVwXyZ0123456789abcdefghijkl`],
  ["a JWT", `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27u`],
  ["a bare long opaque run", `Zm9vYmFyYmF6cXV4Y29ycmdlZ3JhdWx0Z2FycGx5d2FsZG9mcmVk`],
]
for (const [what, secret] of SECRETS) {
  const out = describeGraphError(JSON.stringify({ error: { code: 190, message: `Error validating ${secret} now` } }))
  ok(`${what} is redacted`, !out.includes(secret) && out.includes("code 190"), out)
}

// The URL is the worst case: it carries the secret AND the token together.
{
  const url = "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=abc123&access_token=IGQVJsecret"
  const out = describeGraphError(JSON.stringify({ error: { code: 190, message: `Failed calling ${url}` } }))
  ok("a whole request URL is replaced, not merely truncated",
    !out.includes("graph.instagram.com") && !out.includes("abc123") && !out.includes("IGQVJsecret"), out)
}

// A NON-JSON body is never echoed in any form. A proxy's HTML error page can quote the request
// line — which is the full URL, with the secret in it.
{
  const html = `<html><body>502 upstream error for GET /access_token?client_secret=abc123&access_token=IGQVJsecret</body></html>`
  ok("a non-JSON body produces nothing at all", describeGraphError(html) === "", describeGraphError(html))
}
ok("…including an empty body", describeGraphError("") === "")
ok("…and valid JSON with no error object", describeGraphError(JSON.stringify({ data: [] })) === "")
ok("…and a JSON error that is a bare string", describeGraphError(JSON.stringify({ error: "nope" })) === "")

// Bounded, so a huge body cannot flood the log.
{
  const huge = describeGraphError(JSON.stringify({ error: { code: 1, message: "x".repeat(5000) } }))
  ok("the output is length-bounded", huge.length < 400, `len ${huge.length}`)
}
// The 4000-char bound is applied BEFORE parsing. Two consequences, both wanted:
ok("padding past the bound does not break a small valid body",
  describeGraphError(`{"error":{"code":1}}` + " ".repeat(5000)) !== "")
ok("…and a body whose JSON is cut off by the bound yields nothing, never a fragment", (() => {
  const giant = JSON.stringify({ error: { code: 190, message: "x".repeat(6000), secret: "client_secret=abc123" } })
  const out = describeGraphError(giant)
  return out === "" && !out.includes("abc123")
})())

// ── 3. THE OAUTH BEHAVIOUR IS UNCHANGED ───────────────────────────────────────────────────────
// This is a diagnostic. It must not alter a single thing about how a connection is made.
console.log("\nthe flow itself is untouched:")

ok("the exchange still throws on a non-ok response",
  /throw new Error\(`ig long-lived exchange failed: \$\{res\.status\}/.test(IG))
ok("…and still returns the parsed token on success", /return \(await res\.json\(\)\) as LongToken/.test(IG))
ok("the short-token exchange is untouched",
  /if \(!res\.ok\) throw new Error\(`ig short-token exchange failed: \$\{res\.status\}`\)/.test(IG))
ok("reading the body cannot fail the request", /await res\.text\(\)\.catch\(\(\) => ""\)/.test(IG))
ok("the request URL is never passed to the describer", !/describeGraphError\([^)]*params/.test(IG))
ok("the callback still redirects with an opaque code, never the detail",
  /return NextResponse\.redirect\(`\$\{accounts\}\?error=exchange`\)/.test(CALLBACK))
ok("…and still logs the message only, never the error object",
  /console\.error\(`\[instagram\/callback\] exchange failed: \$\{\(e as Error\)\.message\}`\)/.test(CALLBACK))
ok("the scopes are still resolved from what the provider confirms",
  /resolveGrantedScopes\(\{/.test(CALLBACK) && /existing,/.test(CALLBACK))
ok("the connect RPC call is unchanged", /sa_connect_instagram/.test(CALLBACK))
ok("nothing in this change writes a connection", !/\.(insert|update|delete)\(/.test(IG))
ok("…and the module still never reads Auto Posting or a pause flag",
  !/auto_posting|posting_paused/.test(IG))

console.log(`\nInstagram exchange diagnostics: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
