/**
 * AI BRIEF TENANCY — every ai_client_briefs upsert must carry workspace_id and
 * owner_user_id, or the AI Client Insights card silently goes blank.
 *
 * THE FAILURE THIS PREVENTS, which cost a long investigation to find:
 *
 * 20260728000008_workspace_rls_enforcement.sql enables RLS on ai_client_briefs
 * with `using (public.is_active_workspace_member(workspace_id))`. syncAiInsights
 * did not write workspace_id, so is_active_workspace_member(NULL) was never true
 * and the row became INVISIBLE TO EVERY BROWSER SESSION — while remaining perfectly
 * readable to the service role. Server-side checks kept reporting the brief present
 * and current while the card rendered "Last Beast Sync: Never" / "Click Sync to
 * check for messages" over a complete row.
 *
 * It is silent by construction: components/crm/LeadInsights.tsx reads with the
 * BROWSER client and uses maybeSingle(), so an RLS-filtered row returns null with
 * NO error — indistinguishable from "no row". There is nothing to log and nothing
 * to catch.
 *
 * The canonical trg_ownership trigger (20260728000007) DOES cover this table but
 * cannot save it: it derives ownership from auth.uid(), which is NULL for a
 * service-role write, and it is BEFORE INSERT only — syncAiInsights upserts on
 * lead_id, so every regeneration takes the UPDATE path and the trigger never fires.
 * Passing the values explicitly is therefore the only defence, and this test is
 * what keeps them there.
 *
 * Locked state: commit dca5896, production deployment dpl_BzydVkgpSNqdkCNRQK1tn4reGFWB.
 *
 * Run: npx tsx scripts/tests/aiBriefTenancy.test.ts
 */
import { readFileSync } from "node:fs"

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

const SYNC = "lib/ai/syncAiInsights.ts"
const src = readFileSync(SYNC, "utf8")
/** Comments DOCUMENT the rule; the contract is about executable code. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

console.log("\nAI BRIEF TENANCY\n")

console.log("The lead query supplies the tenancy")
{
  check(
    "syncAiInsights selects workspace_id from the lead",
    /\.from\("leads"\)[\s\S]{0,160}\.select\([^)]*workspace_id/.test(code),
  )
  check(
    "…and owner_user_id",
    /\.from\("leads"\)[\s\S]{0,160}\.select\([^)]*owner_user_id/.test(code),
  )
}

console.log("\nThe upsert carries it")
{
  // Scope to the ai_client_briefs upsert object specifically.
  const i = code.indexOf('.from("ai_client_briefs")')
  const upsert = i >= 0 ? code.slice(i, i + 1200) : ""
  check("an ai_client_briefs upsert exists", i >= 0)
  // BOTH upserts (insights and zero-message) carry tenancy via the shared
  // `tenancy` object; its lead-derived definition is asserted separately below.
  const upsertCount = (code.match(/\.from\("ai_client_briefs"\)[\s\S]{0,80}\.upsert\(/g) ?? []).length
  check("there are exactly TWO ai_client_briefs upserts (insights + zero-message)", upsertCount === 2, `found ${upsertCount}`)
  {
    // Scan EACH upsert's own payload rather than counting globally — the
    // preserve-path UPDATE also carries tenancy, so a global count would drift.
    const offenders: number[] = []
    for (const m of code.matchAll(/\.from\("ai_client_briefs"\)[\s\S]{0,80}\.upsert\(/g)) {
      if (!/\.\.\.tenancy/.test(code.slice(m.index!, m.index! + 700))) offenders.push(m.index!)
    }
    check(
      "every ai_client_briefs upsert carries tenancy",
      offenders.length === 0,
      `upsert(s) missing ...tenancy at offset(s): ${offenders.join(", ")}`,
    )
  }
  check(
    "…and tenancy is derived from the lead, not hardcoded or invented",
    /const tenancy = \{[\s\S]{0,240}workspace_id:\s*\(?lead[\s\S]{0,240}owner_user_id:\s*\(?lead/.test(code),
    "both fields must derive from the lead row this function already fetched",
  )
  check(
    "…and still upserts on lead_id (unchanged conflict target)",
    /onConflict:\s*"lead_id"/.test(upsert),
  )
}

console.log("\nThe ZERO-MESSAGE check is persisted, and carries tenancy too")
{
  // A successful check that found nothing must leave a row, or "never checked" and
  // "checked, nothing there" are indistinguishable. That row is subject to the SAME
  // RLS, so it needs the same tenancy — a brief written without it is invisible and
  // the card silently falls back to "Click Sync", losing the record of the check.
  const i = code.indexOf("messageCount === 0")
  const zero = i >= 0 ? code.slice(i, i + 2600) : ""
  check("a zero-message branch exists", i >= 0)
  check("…it UPSERTS instead of throwing", /\.from\("ai_client_briefs"\)[\s\S]{0,80}\.upsert\(/.test(zero))
  check("…writing message_count: 0", /message_count:\s*0/.test(zero))
  check("…insights: []", /insights:\s*\[\]/.test(zero))
  check("…last_conversation: null", /last_conversation:\s*null/.test(zero))
  check("…a real last_synced_at", /last_synced_at:\s*lastSyncedAt/.test(zero))
  check("…AND tenancy (the RLS requirement)", /\.\.\.tenancy/.test(zero))
  check(
    "…on the same lead_id conflict target",
    /onConflict:\s*"lead_id"/.test(zero),
  )
  check(
    "the old pre-upsert throw is gone",
    !/No messages found for lead \$\{leadId\} yet/.test(code),
    "throwing before the upsert is what erased the record of the check",
  )
  check(
    "a FAILED write still throws (never reports a successful check)",
    /if \(emptyErr\) throw new Error/.test(code),
  )
  check(
    "tenancy is derived from the lead for BOTH paths",
    /const tenancy = \{[\s\S]{0,200}workspace_id:\s*\(?lead[\s\S]{0,200}owner_user_id:\s*\(?lead/.test(code),
  )
  check(
    "the function reports a structured success instead of throwing",
    /return \{ status: "no_messages"/.test(code) && /return \{ status: "insights"/.test(code),
  )
}

console.log("\nAn existing non-empty brief CANNOT be clobbered by a zero-message result")
{
  // companion_messages only ever accumulates, so a lead that already has a
  // message-backed brief reading zero NOW is anomalous, not proof the conversation
  // vanished. Overwriting with insights: [] would destroy real client intelligence
  // on the strength of a suspicious read.
  const i = code.indexOf("messageCount === 0")
  const zero = i >= 0 ? code.slice(i, i + 2600) : ""
  check(
    "the zero branch READS the existing brief before writing",
    /\.from\("ai_client_briefs"\)\s*\.select\("message_count, last_synced_at"\)[\s\S]{0,120}\.eq\("lead_id", leadIdNum\)/.test(zero),
  )
  check(
    "…and branches on an existing non-empty brief",
    /if \(existingRow && existingCount > 0\)/.test(zero),
  )
  check(
    "…with existingCount READ from that row, never hardcoded",
    /const existingCount = existingRow\?\.message_count \?\? 0/.test(zero),
    "a constant here would make the guard dead code while the shape still looks right",
  )
  {
    // The protected path must be a TRUE NO-OP: no write of any kind, so the whole
    // row survives — including last_synced_at, which must keep representing the last
    // check that actually BACKS the insights on screen. Stamping it would make stale
    // intelligence look freshly validated.
    const j = zero.indexOf("if (existingRow && existingCount > 0)")
    const brace = zero.indexOf("\n    }", j)
    const preserve = j >= 0 && brace > j ? zero.slice(j, brace) : ""
    check("the protected branch body was located", preserve.length > 0)
    check("…performs NO update", !/\.update\(/.test(preserve))
    check("…performs NO upsert", !/\.upsert\(/.test(preserve))
    check("…performs NO insert or delete", !/\.(insert|delete)\(/.test(preserve))
    for (const col of ["insights", "last_conversation", "message_count", "last_message_rowid", "last_message_date", "last_synced_at"]) {
      check(`…never writes ${col}`, !new RegExp(`${col}:\\s`).test(preserve))
    }
    check(
      "…returns the EXISTING last_synced_at, not now",
      /lastSyncedAt: existingRow\.last_synced_at \?\? lastSyncedAt/.test(preserve),
      "reporting `now` would imply the stale insights were just re-validated",
    )
    check("…and still reports preservedExistingBrief: true", /preservedExistingBrief: true/.test(preserve))
    check(
      "…it returns BEFORE reaching any write",
      preserve.includes("return {"),
    )
  }
  check(
    "the empty-row write is reachable only when there is no non-empty brief",
    zero.indexOf("if (existing && existingCount > 0)") < zero.indexOf(".upsert("),
    "the guard must come BEFORE the destructive upsert",
  )
  check(
    "the outcome reports whether an existing brief was preserved",
    /preservedExistingBrief: true/.test(code) && /preservedExistingBrief: false/.test(code),
  )
}

console.log("\nThe RLS policy this protects still exists")
{
  const mig = readFileSync("supabase/migrations/20260728000008_workspace_rls_enforcement.sql", "utf8")
  check("ai_client_briefs is covered by workspace RLS enforcement", /ai_client_briefs/.test(mig))
  check(
    "…via is_active_workspace_member(workspace_id)",
    /is_active_workspace_member\(workspace_id\)/.test(mig),
    "if this predicate changes, re-derive what the upsert must carry",
  )
}

console.log("\nThe trigger cannot be relied on instead")
{
  const trig = readFileSync("supabase/migrations/20260728000007_crm_ownership_triggers.sql", "utf8")
  check("trg_ownership derives from auth.uid()", /auth\.uid\(\)/.test(trig))
  check(
    "…and is BEFORE INSERT only (so an upsert's UPDATE path never fires it)",
    /before insert on public\.ai_client_briefs/.test(trig),
  )
  check(
    "…which is why the explicit values above are required",
    /coalesce\(new\.owner_user_id, auth\.uid\(\)\)/.test(trig),
    "the trigger prefers a supplied owner_user_id — passing it explicitly is the sanctioned path",
  )
}

console.log("\nThe known-good display contract is untouched")
{
  const card = readFileSync("components/crm/LeadInsights.tsx", "utf8")
  check("the card still reads with the BROWSER client (RLS applies)", /from "@\/lib\/supabase\/client"/.test(card))
  check("…still queries ai_client_briefs by lead_id", /\.from\("ai_client_briefs"\)[\s\S]{0,120}\.eq\("lead_id", leadId\)/.test(card))
  check("…still renders the Last Beast Sync label", /Last Beast Sync: /.test(card))
  check("…still has a Sync/Refresh control", /lastSynced \? "Refresh" : "Sync"/.test(card))
  check("…and still opens on insights OR last_conversation", /insights && data\.insights\.length > 0/.test(card) && /!!data\?\.last_conversation/.test(card))
}

console.log("\nGeneration itself is unchanged by this guard")
{
  check("syncAiInsights still calls the one generator", /generateAiInsights\(transcript\)/.test(code))
  check("…still prefers the companion transcript", /getCompanionTranscript\(leadIdNum\)/.test(code))
  check("…and still stores the change-detection fields", /message_count/.test(code) && /last_message_date/.test(code))
  const gen = readFileSync("lib/ai/generateAiInsights.ts", "utf8")
  check("the prompt contract is still 0-4 bullets + last_conversation", /array of 0.4 strings/.test(gen) && /"last_conversation"/.test(gen))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
