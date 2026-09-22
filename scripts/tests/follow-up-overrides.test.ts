/**
 * CP2: workspace-level follow-up template OVERRIDES — validation, merge, and the
 * SQL↔code char-limit mirror. Pure; no DB. Proves the read/write data shape:
 * store only customized keys, missing key → default, invalid input rejected.
 *
 *   npx tsx scripts/tests/follow-up-overrides.test.ts
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import {
  sanitizeFollowUpOverrides,
  mergeFollowUpTemplates,
  FOLLOW_UP_TEMPLATE_KEYS,
  isFollowUpTemplateKey,
  DEFAULT_FOLLOW_UP_TEMPLATES,
  TEMPLATE_CHAR_LIMITS,
} from "@bc/companion-shared"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.error("✗", name, `\n   got:  ${JSON.stringify(a)}\n   want: ${JSON.stringify(b)}`) }
}
const ok = (c: boolean, name: string) => { if (c) pass++; else { fail++; console.error("✗", name) } }

// ── Content keys ─────────────────────────────────────────────────────────────
eq([...FOLLOW_UP_TEMPLATE_KEYS].sort(), [
  "application_status", "contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3",
  "ds_availability_submitted", "ds_needs_availability", "ds_tour_now_or_wait",
  "final_follow_up", "follow_up_1", "follow_up_2", "follow_up_3",
  "future_move_reactivate", "future_move_wait_ack", "intro", "list_final",
  "list_fu3_favorites", "list_fu3_no_favorites", "new_lead_text1", "new_lead_text2",
  "post_tour", "text_top_3",
], "21 content keys (legacy + Follow-Up Agent Phase-1)")
ok(isFollowUpTemplateKey("intro") && !isFollowUpTemplateKey("follow_up_4"), "isFollowUpTemplateKey guards the set")

// ── sanitize: keeps only genuine, valid, in-range customizations ─────────────
{
  const r = sanitizeFollowUpOverrides({ follow_up_1: "Custom FU1 text" })
  eq(r.overrides, { follow_up_1: "Custom FU1 text" }, "valid override kept")
  eq(r.rejected, [], "valid override → no rejections")
}
{
  const r = sanitizeFollowUpOverrides({ not_a_key: "x" })
  eq(r.overrides, {}, "unknown key not stored")
  eq(r.rejected, [{ key: "not_a_key", reason: "unknown_key" }], "unknown key reported")
}
{
  const tooLong = "x".repeat(TEMPLATE_CHAR_LIMITS.follow_up_1 + 1)
  const r = sanitizeFollowUpOverrides({ follow_up_1: tooLong })
  eq(r.overrides, {}, "over-length not stored")
  eq(r.rejected, [{ key: "follow_up_1", reason: "too_long" }], "over-length reported")
}
{
  const atLimit = "x".repeat(TEMPLATE_CHAR_LIMITS.follow_up_1)
  const r = sanitizeFollowUpOverrides({ follow_up_1: atLimit })
  eq(r.overrides, { follow_up_1: atLimit }, "exactly-at-limit is allowed")
}
{
  const r = sanitizeFollowUpOverrides({ intro: 123 as unknown as string })
  eq(r.rejected, [{ key: "intro", reason: "not_a_string" }], "non-string reported")
}
{
  eq(sanitizeFollowUpOverrides({ follow_up_2: "" }).overrides, {}, "empty string dropped (→ default)")
  eq(sanitizeFollowUpOverrides({ follow_up_2: "   " }).overrides, {}, "whitespace-only dropped (→ default)")
}
{
  // Typing back the exact default is not a customization → dropped.
  const r = sanitizeFollowUpOverrides({ follow_up_1: DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_1 })
  eq(r.overrides, {}, "value equal to default is dropped")
}
{
  const r = sanitizeFollowUpOverrides({ intro: "Hi {first_name}, it's {agent_first_name}!", bogus: "x", follow_up_3: "" })
  eq(r.overrides, { intro: "Hi {first_name}, it's {agent_first_name}!" }, "mixed input keeps only the valid customization")
  eq(r.rejected, [{ key: "bogus", reason: "unknown_key" }], "mixed input reports the unknown key")
}
eq(sanitizeFollowUpOverrides(null).overrides, {}, "null input → {}")
eq(sanitizeFollowUpOverrides("nope").overrides, {}, "non-object input → {}")

// ── merge: override else default ─────────────────────────────────────────────
{
  const merged = mergeFollowUpTemplates({ follow_up_1: "Custom FU1" })
  eq(merged.follow_up_1, "Custom FU1", "merge applies the override")
  eq(merged.follow_up_2, DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_2, "merge falls back to default for unset key")
  eq(merged.intro, DEFAULT_FOLLOW_UP_TEMPLATES.intro, "merge default for intro when unset")
}
eq(mergeFollowUpTemplates(), DEFAULT_FOLLOW_UP_TEMPLATES, "no overrides → all defaults")
eq(mergeFollowUpTemplates({}), DEFAULT_FOLLOW_UP_TEMPLATES, "empty overrides → all defaults")
eq(mergeFollowUpTemplates({ follow_up_1: "  " }).follow_up_1, DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_1, "blank override → default at merge")

// ── SQL ↔ code char-limit mirror (drift guard) ───────────────────────────────
// The RPC hardcodes per-key limits; they MUST equal the in-code TEMPLATE_CHAR_LIMITS.
{
  const here = dirname(fileURLToPath(import.meta.url))
  // The authoritative RPC is the LATEST migration that re-declares it.
  const sql = readFileSync(join(here, "../../supabase/migrations/20260922000004_follow_up_templates_keys.sql"), "utf8")
  for (const key of FOLLOW_UP_TEMPLATE_KEYS) {
    const m = sql.match(new RegExp(`when '${key}'\\s+then\\s+(\\d+)`))
    ok(!!m, `SQL declares a limit for '${key}'`)
    if (m) eq(Number(m[1]), TEMPLATE_CHAR_LIMITS[key], `SQL limit for '${key}' matches code (${TEMPLATE_CHAR_LIMITS[key]})`)
  }
  // And the RPC allows EXACTLY the content-key set (no stray key, no missing key).
  const declaredInSql = Array.from(sql.matchAll(/when '(\w+)'\s+then\s+\d+/g)).map((m) => m[1]).sort()
  eq(declaredInSql, [...FOLLOW_UP_TEMPLATE_KEYS].sort(), "SQL allows exactly the content-key set")
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
