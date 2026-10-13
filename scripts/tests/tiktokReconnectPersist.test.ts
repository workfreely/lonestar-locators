// TIKTOK RECONNECT — the Vault secret name must be unique per connect, not per account.
//
// THE DEFECT (reproduced against production before fixing). sa_connect_tiktok built the Vault
// secret name deterministically from the account identity:
//
//     'social:tiktok:' || v_uid || ':' || coalesce(p_open_id, '')
//
// and called vault.create_secret BEFORE deleting the previous secret. vault.secrets.name carries
// a UNIQUE index (secrets_name_idx), so the FIRST connect succeeded and every RECONNECT of the
// same account raised:
//
//     23505 duplicate key value violates unique constraint "secrets_name_idx"
//
// The exception propagated out of the RPC, the callback's `if (error)` branch fired, and the user
// saw "Connected but couldn't save the connection." The tokens had already been exchanged
// successfully — only persistence failed, and it failed every time, permanently.
//
// Two things are covered here, both pure and offline:
//   1. The name SHAPE is unique per mint (the fix), and the old shape was not (the defect).
//   2. sanitizeDbError keeps the error code — the part that identifies the fault — while
//      redacting the Vault secret name a uniqueness error quotes back, which embeds the admin
//      user id and the TikTok open_id. No token, refresh token or authorization code is ever
//      logged, which is why the defect left no diagnosable trace in the first place.
//
// No network, no database, no TikTok API, no tokens. The live-database assertions for this fix
// were run separately and are recorded in the checkpoint report.
// Run: npx tsx scripts/tests/tiktokReconnectPersist.test.ts
import { sanitizeDbError } from "../../lib/social/tiktok"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const UID = "c567c077-d3f4-4532-8807-a54795f753f5"
const OPEN_ID = "-000z8ExampleOpenIdValue"

/** The name the DEFECTIVE function minted — identity only, therefore constant per account. */
const oldName = (uid: string, openId: string) => `social:tiktok:${uid}:${openId}`

/**
 * The name the FIXED function mints. Mirrors the SQL exactly:
 *   … || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
 * i.e. the identity, then a microsecond-resolution stamp.
 */
const newName = (uid: string, openId: string, at: Date, micros: number) => {
  const p = (n: number, w: number) => String(n).padStart(w, "0")
  const stamp =
    `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1, 2)}${p(at.getUTCDate(), 2)}` +
    `${p(at.getUTCHours(), 2)}${p(at.getUTCMinutes(), 2)}${p(at.getUTCSeconds(), 2)}` +
    `${p(micros, 6)}`
  return `social:tiktok:${uid}:${openId}:${stamp}`
}

function main() {
  // ── 1. THE DEFECT: the old shape is constant, so a reconnect must collide ───
  console.log("1. the old name shape collides on reconnect (this is the defect):")
  {
    const first = oldName(UID, OPEN_ID)
    const second = oldName(UID, OPEN_ID)
    ok("two connects of the same account mint the SAME name", first === second, `${first} vs ${second}`)
    ok("…which a UNIQUE index on vault.secrets.name must reject", first === second)
  }

  // ── 2. THE FIX: unique per mint, including inside the same second ───────────
  console.log("\n2. the fixed shape is unique per connect:")
  {
    const at = new Date(Date.UTC(2026, 9, 13, 3, 45, 12))
    const a = newName(UID, OPEN_ID, at, 123456)
    const b = newName(UID, OPEN_ID, at, 123457)
    ok("two mints in the SAME second differ (microsecond precision)", a !== b, `${a} vs ${b}`)

    const later = newName(UID, OPEN_ID, new Date(at.getTime() + 1000), 1)
    ok("a mint one second later also differs", later !== a)

    const names = new Set<string>()
    for (let i = 0; i < 1000; i++) names.add(newName(UID, OPEN_ID, at, i))
    ok("1,000 distinct microsecond stamps give 1,000 distinct names", names.size === 1000, String(names.size))

    ok("the identity prefix is preserved, so secrets stay greppable per account",
      a.startsWith(`social:tiktok:${UID}:${OPEN_ID}:`))
    ok("the stamp is exactly 20 digits (YYYYMMDDHH24MISSUS)",
      /:\d{20}$/.test(a), a.slice(-24))
    ok("a different account still gets a different prefix",
      !newName("11111111-1111-1111-1111-111111111111", OPEN_ID, at, 1).startsWith(`social:tiktok:${UID}:`))
  }

  // ── 3. THE REAL ERROR IS NOW LOGGED, AND SANITIZED ─────────────────────────
  console.log("\n3. sanitizeDbError keeps the code and redacts the identifiers:")
  {
    // The verbatim shape Postgres produced for this defect.
    const real = {
      code: "23505",
      message: `duplicate key value violates unique constraint "secrets_name_idx" DETAIL: Key (name)=(social:tiktok:${UID}:${OPEN_ID}) already exists.`,
    }
    const out = sanitizeDbError(real)
    ok("the error CODE survives", out.startsWith("23505"), out)
    ok("the constraint name survives (it names the fault)", out.includes("secrets_name_idx"))
    ok("the admin user id is NOT present", !out.includes(UID), out)
    ok("the TikTok open_id is NOT present", !out.includes(OPEN_ID), out)
    ok("the secret name is reduced to a shape", out.includes("social:<provider>:<redacted>"), out)
  }

  // ── 4. NOTHING TOKEN-SHAPED SURVIVES SANITIZING ────────────────────────────
  console.log("\n4. token-shaped material never reaches a log:")
  {
    const accessToken = "act.ZvB7mKq3nR8sT1uY6wX0aC4eG9hJ2lN5pQ7rS3tV6xZ8bD1fH4kM7oP0qT3wY6zA"
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpheSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    const code = "Qk9GTlpNVEl6TkRVMk56ZzVNQ1hYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhY"

    for (const [label, secret] of [["access token", accessToken], ["JWT", jwt], ["auth code", code]] as const) {
      const out = sanitizeDbError({ code: "22001", message: `value too long: ${secret}` })
      ok(`${label} is redacted`, !out.includes(secret), out)
    }
    ok("a long DETAIL is truncated", sanitizeDbError({ code: "23505", message: "x".repeat(900) }).length < 330)
  }

  // ── 5. DEGENERATE INPUTS ───────────────────────────────────────────────────
  console.log("\n5. degenerate inputs:")
  {
    ok("null error", sanitizeDbError(null) === "unknown")
    ok("empty error", sanitizeDbError({}) === "no_code")
    ok("code only", sanitizeDbError({ code: "42501" }) === "42501")
    ok("message only", sanitizeDbError({ message: "permission denied" }) === "no_code permission denied")
    ok("ordinary message passes through",
      sanitizeDbError({ code: "42501", message: "permission denied for function sa_connect_tiktok" }) ===
        "42501 permission denied for function sa_connect_tiktok")
  }

  console.log(`\n${pass} checks passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
