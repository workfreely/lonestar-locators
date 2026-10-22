// VOICEMAIL SCRIPTS — an agent-only reading aid.
//
// Two things decide whether this is safe: it must never claim something the data cannot support,
// and it must never reach a client. Most of what follows is about those.
import {
  renderVoicemail, chooseTemplate, pickPreferences, availabilityTimeframe, moveMonthName,
  daysUntilMove, VOICEMAIL_SPECIALS_PARAGRAPH, VOICEMAIL_TEMPLATE_LABELS, SAVEABLE_VOICEMAIL_KEYS,
  PREFERENCE_PLACEHOLDERS, mustHaveAmenityLabel, TOUR_PLACEHOLDERS, VOICEMAIL_TEMPLATE_KEYS,
} from "@bc/companion-shared"
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { c ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`)) }
const NOW = new Date("2026-10-22T12:00:00Z")
const prefs: [string, string] = ["Washer/Dryer", "High Ceilings"]

console.log("\n1. TEMPLATE SELECTION FOLLOWS THE MOVE DATE:")
ok("87 days out → 30–90", chooseTemplate("2027-01-17", NOW).key === "list_sent_30_90")
ok("exactly 30 → 30–90", chooseTemplate("2026-11-21", NOW).key === "list_sent_30_90")
ok("exactly 90 → 30–90 (the boundary belongs to the shorter window)",
  chooseTemplate("2027-01-20", NOW).key === "list_sent_30_90")
ok("91 days → over 90", chooseTemplate("2027-01-21", NOW).key === "list_sent_over_90")
{
  const soon = chooseTemplate("2026-11-01", NOW)
  ok("UNDER 30 days → no automatic choice", soon.key === null && soon.automatic === false)
  ok("…and says why", soon.automatic === false && soon.reason === "under_30_days")
  const none = chooseTemplate(null, NOW)
  ok("MISSING move date → no automatic choice", none.key === null)
  ok("…and says why", none.automatic === false && none.reason === "no_move_date")
}
ok("days are counted from LOCAL date parts, not a UTC parse",
  daysUntilMove("2027-01-17", NOW) === 87, String(daysUntilMove("2027-01-17", NOW)))

console.log("\n2. THE APPROVED WORDING IS INTACT:")
{
  const a = renderVoicemail("list_sent_30_90", { firstName: "Reagan", preferences: prefs })
  for (const line of [
    "Hey Reagan, it's Jay! Hope you're doing well!",
    "I just sent your list over! I narrowed it down to your best options, and I think you're going to love the ones I found.",
    "I added notes explaining why I chose each property for you, so take a look when you get a chance and let me know your favorites.",
    "If anything changes or you'd like me to tweak the list, just let me know, and we'll get some tours set up.",
    "Talk to you soon!",
  ]) ok(`verbatim: "${line.slice(0, 44)}…"`, a.includes(line))
  ok("paragraphs are separated for reading aloud", a.includes("\n\n"))
}
{
  const b = renderVoicemail("list_sent_over_90", { firstName: "Reagan", moveDate: "2027-01-17", preferences: prefs })
  ok("Template 2 carries the move-month sentence",
    b.includes("Since you're moving in January, we should have a better idea of pricing, availability, and specials for your move date by"))
  ok("…and ends with the same approved close", b.trim().endsWith("Talk to you soon!"))
  ok("Template 1 does NOT carry it",
    !renderVoicemail("list_sent_30_90", { firstName: "R", preferences: prefs }).includes("Since you're moving in"))
}

console.log("\n3. NO UNVERIFIED CLAIM IS EVER MADE:")
{
  const a = renderVoicemail("list_sent_30_90", { firstName: "Reagan", preferences: prefs })
  ok("the amenity sentence is about what the CLIENT asked for",
    a.includes("I focused on the features you mentioned, especially Washer/Dryer and High Ceilings."))
  ok("…and never asserts the communities HAVE them",
    !/these communities (check|offer)/i.test(a) && !a.includes("check your boxes"))
  ok("SPECIALS are absent unless explicitly enabled", !a.includes(VOICEMAIL_SPECIALS_PARAGRAPH))
  const withSpecials = renderVoicemail("list_sent_30_90", { firstName: "R", preferences: prefs, includeSpecials: true })
  ok("…and verbatim when they are", withSpecials.includes(VOICEMAIL_SPECIALS_PARAGRAPH))
}

console.log("\n4. PREFERENCES ARE GROUNDED, OR LEFT AS PLACEHOLDERS:")
{
  const form = pickPreferences({ mustHaveAmenities: ["washer_dryer", "high_ceilings", "fitness_center"], amenityLabel: mustHaveAmenityLabel })
  ok("the FORM comes first", form.values[0] === "Washer/Dryer" && form.values[1] === "High Ceilings")
  ok("…labelled for humans, not slugs", !form.values.join(" ").includes("_"))
  ok("…and both are marked grounded", form.grounded[0] && form.grounded[1])
  const insight = pickPreferences({ mustHaveAmenities: [], aiInsights: ["Client toured Willows and liked the yards and kitchens but found rooms too small."] })
  ok("INSIGHTS are used when the form is empty", insight.grounded[0], JSON.stringify(insight.values))
  const circumstantial = pickPreferences({ aiInsights: ["Client is currently deployed with the 5th Fleet and return timing is uncertain."] })
  ok("a circumstantial insight is NOT mistaken for a preference",
    circumstantial.values[0] === PREFERENCE_PLACEHOLDERS[0], JSON.stringify(circumstantial.values))
  const none = pickPreferences({})
  ok("nothing known → editable placeholders, never a guess",
    none.values[0] === "[Preference 1]" && none.values[1] === "[Preference 2]")
  ok("…and they are reported as ungrounded", !none.grounded[0] && !none.grounded[1])
  const one = pickPreferences({ mustHaveAmenities: ["pool"], amenityLabel: mustHaveAmenityLabel })
  ok("one known → the second stays a placeholder", one.grounded[0] && !one.grounded[1] && one.values[1] === "[Preference 2]")
}

console.log("\n5. PERSONALISATION THAT CANNOT RESOLVE STAYS VISIBLE:")
{
  const r = renderVoicemail("list_sent_over_90", { firstName: null, moveDate: null, preferences: PREFERENCE_PLACEHOLDERS as unknown as [string, string] })
  ok("no name → [First Name]", r.includes("Hey [First Name], it's Jay!"))
  ok("no move date → [Move-In Month]", r.includes("moving in [Move-In Month]"))
  ok("no timeframe → [Availability Timeframe]", r.includes("by [Availability Timeframe]"))
  ok("month name is natural language", moveMonthName("2027-01-17") === "January")
  const tf = availabilityTimeframe("2027-01-17")
  ok(`timeframe reads naturally ("${tf}")`, /^(early|mid|late) [A-Z][a-z]+$/.test(String(tf)))
  ok("…and lands 60–90 days before the move", (() => {
    const d = daysUntilMove("2027-01-17", new Date("2026-11-03T12:00:00Z"))
    return d !== null && d >= 60 && d <= 90
  })())
  ok("a manual override wins over the estimate",
    renderVoicemail("list_sent_over_90", { moveDate: "2027-01-17", preferences: prefs, availabilityOverride: "mid December" }).includes("by mid December"))
}

console.log("\n6. THE MIGRATION — ownership, validation, and no client exposure:")
{
  const m = readFileSync("supabase/migrations/20261103000000_lead_voicemail_script.sql", "utf8")
  ok("the column is nullable and added idempotently", /add column if not exists voicemail_script jsonb/.test(m))
  ok("save is workspace-scoped", /v_ws\s+uuid := public\.current_workspace_id\(\)/.test(m))
  ok("…and ownership is enforced in the WHERE clause", /where id = p_lead_id\s*\n\s*and workspace_id = v_ws/.test(m))
  ok("…with a miss raised, not silently written", /if not found then raise exception 'not_found'/.test(m))
  ok("editedAt/editedBy are DERIVED server-side, never taken from the client",
    /'editedAt',\s*v_now/.test(m) && /'editedBy',\s*v_uid/.test(m) && /v_uid\s+uuid := auth\.uid\(\)/.test(m))
  ok("only approved template keys are accepted",
    /not in \('list_sent_30_90', 'list_sent_over_90'\)/.test(m))
  ok("…so the unwritten third template cannot be saved", !/\bpre_tour\b/.test(m.replace(/--.*$/gm, "")))
  ok("an empty body is refused", /btrim\(p_body\) = ''/.test(m) && /raise exception 'empty_body'/.test(m))
  ok("…and an unreasonable one is capped", /length\(p_body\) > 4000/.test(m))
  // PERMISSIONS. Postgres grants EXECUTE to PUBLIC by default and anon inherits PUBLIC, so a
  // grant to `authenticated` excludes nobody on its own. The revoke is the part that does.
  ok("EXECUTE is REVOKED from public and anon first",
    (m.match(/revoke execute on function[^;]*from public, anon;/g) ?? []).length === 2)
  ok("…and the revokes come BEFORE the grants", m.indexOf("revoke execute") < m.indexOf("grant execute"))
  ok("both functions are then granted to authenticated ONLY",
    (m.match(/grant execute on function[^;]*to authenticated;/g) ?? []).length === 2 && !/to anon;/.test(m))
  ok("every function in the file is covered by a revoke", (() => {
    const fns = [...m.matchAll(/create or replace function public\.(\w+)\(/g)].map((x) => x[1])
    return fns.length === 2 && fns.every((f) => new RegExp(`revoke execute on function public\\.${f}\\(`).test(m))
  })())

  // ADDITIVE ONLY — a migration that rewrote existing rows would be a different kind of change.
  ok("the only schema change is one nullable column", (() => {
    const alters = m.match(/^alter table .*/gm) ?? []
    return alters.length === 1 && /add column if not exists voicemail_script jsonb/.test(m)
  })())
  ok("no backfill, no NOT NULL, no DEFAULT, no drop, no truncate",
    !/\bnot null\b/i.test(m) && !/\balter column\b/i.test(m) && !/\bdrop \b/i.test(m) && !/\btruncate\b/i.test(m))
  ok("neither UPDATE can run without both a lead id AND a workspace",
    (m.match(/where id = p_lead_id\s*\n?\s*and workspace_id = v_ws/g) ?? []).length === 2)
  ok("both functions write ONLY voicemail_script (+ updated_at)", (() => {
    const sets = [...m.matchAll(/^\s+set ([\s\S]*?);/gm)].map((x) => x[1])
    const cols = sets.join(" ").match(/^\s*(\w+) =/gm) ?? []
    const named = sets.join("\n").split("\n").map((l) => /^\s*(\w+) =/.exec(l)?.[1]).filter(Boolean)
    return named.every((c) => c === "voicemail_script" || c === "updated_at") && cols.length >= 0
  })())
  // Comments stripped: the migration EXPLAINS itself by naming the sibling columns it is modelled
  // on (locator_notes, ooo_held_at), and an assertion that cannot tell prose from SQL would fail
  // on correct code — or, worse, pass on incorrect code that happened to mention them.
  const mSql = m.replace(/--.*$/gm, "")
  ok("(the stripper works — the comment naming those columns is still in the raw file)",
    /locator_notes/.test(m) && !/locator_notes/.test(mSql))
  for (const forbidden of ["locator_notes", "crm_status", "next_action_date", "followup_opt_in", "sms_opt_in", "held_at", "first_name", "phone"]) {
    ok(`the SQL never writes ${forbidden}`, !mSql.includes(forbidden))
  }
  ok("reset CLEARS the column, so the panel falls back to the template", /set voicemail_script = null/.test(m))
  // The public path must not widen.
  const share = readFileSync("supabase/migrations/20261028000000_special_freshness_source.sql", "utf8")
  ok("the client share RPC still returns an explicit column list",
    /returns table\(status text, agent_name text/.test(share) && !/voicemail/.test(share))
}

console.log("\n6b. THE VERIFICATION QUERY IS VALID AND READ-ONLY:")
{
  const q = readFileSync("docs/VOICEMAIL_MIGRATION_VERIFY.sql", "utf8")
  const sql = q.replace(/--.*$/gm, "")
  // CHECK is a fully RESERVED Postgres keyword; `as check` is a syntax error, and an SQL editor
  // that cannot parse the statement may report something misleading instead.
  ok("no RESERVED keyword is used as a bare alias",
    !/\bas\s+(check|order|group|table|column|user|all|limit|grant|select|from|where|and|or|not|null|default|unique|primary|references)\b/i.test(sql))
  ok("it is one statement", (sql.match(/;/g) ?? []).length === 1)
  ok("…and contains no DDL or DML", !/^\s*(create|alter|drop|insert|update|delete|grant|revoke|truncate)\b/im.test(sql))
  ok("it still asserts the anon revoke, which is the point of it",
    /has_function_privilege\('anon'/.test(sql))
  ok("…and that the renter share RPC excludes the column", /lb_resolve_client_recommendations/.test(sql))
}

console.log("\n7. THE PANEL IS INERT — it reads and copies, nothing else:")
{
  const v = readFileSync("apps/beast-companion/src/sidepanel/lead/VoicemailScriptView.tsx", "utf8")
  for (const forbidden of ["tel:", "sms:", "window.open", "dialUrl", "openSMS", "complete-", "enroll", "fetch("]) {
    ok(`never ${forbidden}`, !v.includes(forbidden))
  }
  ok("the only verbs it can post are save and reset", (() => {
    const panel = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
    const block = /const postVoicemailVerb[\s\S]*?onResetVoicemail = \(\) => postVoicemailVerb\(\{ verb: "reset-voicemail" \}\);/.exec(panel)?.[0] ?? ""
    return /verb: "save-voicemail"/.test(block) && /verb: "reset-voicemail"/.test(block)
  })())
  ok("specials start OFF", /useState\(saved\?\.specialsEnabled === true\)/.test(v))
  ok("…and the checkbox warns it needs verifying", /only if you've verified current specials/.test(v))
  ok("a SAVED script is shown verbatim, not re-rendered from changed client data",
    /isSavedForThisTemplate \? saved!\.body : rendered/.test(v))
  // INVERTED when the Pre-Tour wording was approved. These three asserted the opposite while the
  // template was a placeholder: that it was labelled "Coming later", was not saveable, and
  // rendered nothing. All three are now the wrong expectation, so they state the new contract —
  // and section 6e covers what the script actually says.
  ok("the third template is now a real choice", SAVEABLE_VOICEMAIL_KEYS.includes("pre_tour"))
  ok("…no longer labelled Coming later", !VOICEMAIL_TEMPLATE_LABELS.pre_tour.includes("Coming later"))
  ok("…and renders a script", renderVoicemail("pre_tour", { preferences: prefs, upcomingTourCount: 1 }).length > 0)
  ok("the view surfaces a warning when nothing is confirmed",
    /templateKey === "pre_tour" && \(lead\.upcomingTourCount \?\? 0\) === 0/.test(v))
  // THE ACTIVE CLIENT. Opening or closing is a preference flip and a render branch — nothing in
  // either path selects, clears or navigates a client.
  for (const forbidden of ["setSelectedLeadId", "setActiveLead", "router.", "location.href"]) {
    ok(`opening/closing never ${forbidden}`, !v.includes(forbidden))
  }
  ok("the panel is keyed by lead, so switching client re-mounts it cleanly", (() => {
    const app = readFileSync("apps/beast-companion/src/sidepanel/PanelApp.tsx", "utf8")
    return /<VoicemailScriptView[\s\S]{0,120}key=\{String\(lead\.id\)\}/.test(app)
  })())
  ok("closing only writes the preference key", (() => {
    const panel = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
    const close = /const closeVoicemail = \(\) => \{[\s\S]*?\};/.exec(panel)?.[0] ?? ""
    return /PREF_VOICE_SCRIPT_KEY/.test(close) && !/leadId|verb:/.test(close)
  })())
  // RESET sends no body, so an unsaved draft cannot be persisted by it.
  ok("Reset posts no script body — an unsaved edit cannot leak into storage", (() => {
    const panel = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
    return /postVoicemailVerb\(\{ verb: "reset-voicemail" \}\)/.test(panel)
  })())
  ok("…and Reset is only offered once something is saved", /\{saved && <button[^>]*onClick=\{onReset\}/.test(v))
}

console.log("\n6e. PRE-TOUR — the wording follows CONFIRMED appointments:")
{
  const base = { firstName: "Reagan", preferences: prefs }
  const one = renderVoicemail("pre_tour", { ...base, upcomingTourCount: 1 })
  const many = renderVoicemail("pre_tour", { ...base, upcomingTourCount: 3 })
  const none = renderVoicemail("pre_tour", { ...base, upcomingTourCount: 0 })

  ok("one appointment → singular", one.includes("you're all set for your tour!") && one.includes("After your tour,"))
  ok("…with the singular praise", one.includes("because this is such a great option!"))
  ok("three → plural", many.includes("you're all set for your tours!") && many.includes("After your tours,"))
  ok("…with the plural praise", many.includes("because these are all great options!"))

  // THE ONE THAT MATTERS: nothing confirmed must not read as a booking.
  ok("ZERO → the tour noun stays a placeholder", none.includes(TOUR_PLACEHOLDERS.noun))
  ok("…and so does the praise", none.includes(TOUR_PLACEHOLDERS.praise))
  ok("…so it never claims a tour that is not booked",
    !none.includes("your tour!") && !none.includes("your tours!"))
  ok("an absent count is treated as zero, not as one",
    renderVoicemail("pre_tour", base).includes(TOUR_PLACEHOLDERS.noun))

  ok("the approved wording is verbatim", (() => {
    for (const line of [
      "I'm really excited for you because",
      "let me know what you think.",
      "If you need anything at all, just let me know.",
      "Alright, talk to you soon. Bye-bye!",
    ]) if (!one.includes(line)) return false
    return one.startsWith("Hey Reagan, you're all set for your tour!")
  })())
  ok("the first name is inserted", one.startsWith("Hey Reagan,"))
  ok("…and falls back to a placeholder with no name",
    renderVoicemail("pre_tour", { preferences: prefs, upcomingTourCount: 1 }).startsWith("Hey [First Name],"))
  ok("it is now selectable", SAVEABLE_VOICEMAIL_KEYS.includes("pre_tour"))
  ok("…and no longer labelled Coming later", !VOICEMAIL_TEMPLATE_LABELS.pre_tour.includes("Coming later"))
  ok("the two List Sent scripts are untouched by this", (() => {
    const a = renderVoicemail("list_sent_30_90", { firstName: "Reagan", preferences: prefs })
    return a.startsWith("Hey Reagan, it's Jay!") && a.includes("I just sent your list over!") && !a.includes("all set")
  })())
  ok("all three keys exist", VOICEMAIL_TEMPLATE_KEYS.length === 3)
}

console.log("\n6f. THE COUNT ITSELF — against real production tour shapes:")
{
  // Mirrors leadToDto's derivation so the rule can be exercised directly.
  const count = (tours: Array<Record<string, unknown>>, leadId: number, now = Date.now()) => {
    const seen = new Set<string>()
    for (const t of tours) {
      if (String(t.lead_id ?? "") !== String(leadId)) continue
      if (String(t.status ?? "") !== "scheduled") continue
      const at = new Date(t.scheduled_at as string).getTime()
      if (!Number.isFinite(at) || at <= now) continue
      seen.add(`${t.property_id ?? "none"}|${at}`)
    }
    return seen.size
  }
  const NOW = new Date("2026-10-22T12:00:00Z").getTime()
  // The five rows that actually exist in production today.
  const prod = [
    { id: 13, lead_id: 90, scheduled_at: "2026-10-17T14:00:00+00:00", status: "scheduled", property_id: 68 },
    { id: 12, lead_id: 90, scheduled_at: "2026-10-17T14:00:00+00:00", status: "completed", property_id: 68 },
    { id: 14, lead_id: 84, scheduled_at: "2026-10-23T14:00:00+00:00", status: "scheduled", property_id: 62 },
    { id: 15, lead_id: 84, scheduled_at: "2026-10-23T14:00:00+00:00", status: "scheduled", property_id: 62 },
    { id: 16, lead_id: 94, scheduled_at: "2026-11-10T15:00:00+00:00", status: "canceled", property_id: null },
  ]
  ok("duplicate rows for ONE appointment count once (lead 84: 2 rows → 1)", count(prod, 84, NOW) === 1, String(count(prod, 84, NOW)))
  ok("a PAST 'scheduled' tour is not upcoming (lead 90 → 0)", count(prod, 90, NOW) === 0, String(count(prod, 90, NOW)))
  ok("a CANCELED tour is not confirmed (Reagan → 0)", count(prod, 94, NOW) === 0, String(count(prod, 94, NOW)))
  ok("a COMPLETED tour is not upcoming", count([prod[1]], 90, NOW) === 0)
  ok("another lead's tours never count", count(prod, 1, NOW) === 0)
  // The safeguard asked for explicitly.
  ok("a MISSING scheduled_at is not confirmed",
    count([{ lead_id: 7, scheduled_at: null, status: "scheduled", property_id: 1 }], 7, NOW) === 0)
  ok("…and nor is an INVALID one",
    count([{ lead_id: 7, scheduled_at: "not-a-date", status: "scheduled", property_id: 1 }], 7, NOW) === 0)
  ok("two genuinely different appointments count twice", count([
    { lead_id: 7, scheduled_at: "2026-11-01T15:00:00+00:00", status: "scheduled", property_id: 1 },
    { lead_id: 7, scheduled_at: "2026-11-02T15:00:00+00:00", status: "scheduled", property_id: 2 },
  ], 7, NOW) === 2)
  ok("same property at DIFFERENT times is two appointments", count([
    { lead_id: 7, scheduled_at: "2026-11-01T15:00:00+00:00", status: "scheduled", property_id: 1 },
    { lead_id: 7, scheduled_at: "2026-11-02T15:00:00+00:00", status: "scheduled", property_id: 1 },
  ], 7, NOW) === 2)

  const dto = readFileSync("lib/companion/leadToDto.ts", "utf8")
  ok("the DTO derives it the same way", /upcomingTourCount: \(\(\) => \{[\s\S]*?Number\.isFinite\(at\) \|\| at <= now/.test(dto))
  ok("…deduplicating by property and time", /seen\.add\(`\$\{t\.property_id \?\? "none"\}\|\$\{at\}`\)/.test(dto))
  ok("…and it is declared in the schema, or zod would strip it",
    /upcomingTourCount: z\.number\(\)\.nullish\(\)/.test(readFileSync("packages/companion-shared/src/leads/contract.ts", "utf8")))
  ok("no tour record is written anywhere in this change",
    !/from\("lead_tours"\)[\s\S]{0,80}\.(insert|update|delete)/.test(dto))
}

console.log("\n6g. THE pre_tour KEY MIGRATION:")
{
  const m = readFileSync("supabase/migrations/20261104000000_voicemail_pre_tour_key.sql", "utf8")
  const sql = m.replace(/--.*$/gm, "")
  ok("exactly ONE function is replaced", (sql.match(/create or replace function/g) ?? []).length === 1)
  ok("no table or column is altered", !/\b(alter table|drop|truncate)\b/i.test(sql))
  ok("pre_tour joins the allowlist", /not in \('list_sent_30_90', 'list_sent_over_90', 'pre_tour'\)/.test(sql))
  ok("the other guards are reproduced unchanged",
    /current_workspace_id\(\)/.test(sql) && /workspace_id = v_ws/.test(sql) &&
    /'editedBy',        v_uid/.test(sql) && /empty_body/.test(sql) && /body_too_long/.test(sql))
  ok("updated_at is NOT reintroduced", !sql.includes("updated_at"))
  ok("permissions are re-asserted, revoke before grant",
    /revoke execute on function[^;]*from public, anon;/.test(sql) &&
    sql.indexOf("revoke execute") < sql.indexOf("grant  execute"))
  const q = readFileSync("docs/VOICEMAIL_PRE_TOUR_VERIFY.sql", "utf8").replace(/--.*$/gm, "")
  ok("the verification query is read-only and one statement",
    (q.match(/;/g) ?? []).length === 1 && !/^\s*(create|alter|drop|insert|update|delete|grant|revoke)/im.test(q))
  ok("…and checks pre_tour, the old keys, updated_at and anon",
    /pre_tour/.test(q) && /list_sent_over_90/.test(q) && /updated_at/.test(q) && /has_function_privilege\('anon'/.test(q))
  // The updated_at row once matched the function's OWN comment — which names the column
  // deliberately, to stop anyone adding it back — and so failed on correct code. It must strip
  // comments before matching, the same lesson as the TS assertions that read source text.
  // Asserted against the RAW file, not `q`: the line being matched contains `--` inside a string
  // literal, so this test's own comment-stripper would mangle it. A stripper that eats the thing
  // it is checking is exactly the bug this assertion exists to catch.
  ok("the updated_at check strips SQL comments before matching",
    /regexp_replace\(pg_get_functiondef\(oid\)/.test(readFileSync("docs/VOICEMAIL_PRE_TOUR_VERIFY.sql", "utf8")))
  ok("…and the migration still carries that warning comment, which is why stripping is needed",
    /NO updated_at: public\.leads has no such column/.test(
      readFileSync("supabase/migrations/20261104000000_voicemail_pre_tour_key.sql", "utf8")))
}

console.log("\n7b. FULL-HEIGHT LAYOUT — the panel chrome steps aside:")
{
  const app = readFileSync("apps/beast-companion/src/sidepanel/PanelApp.tsx", "utf8")
  const css = readFileSync("apps/beast-companion/src/sidepanel/lead/voicemail.css", "utf8")

  ok("one derived flag drives every guard, so the chrome cannot drift from the view",
    /const voicemailOpen = isLoaded && aiVoiceScriptOn && !!lead;/.test(app))
  ok("the Client/Properties tabs are hidden", /\{isLoaded && !voicemailOpen &&\s*\n\s*\(tourMode \?/.test(app))
  ok("the client identity header + Call/Text buttons are hidden",
    /\{isLoaded && !tourMode && !voicemailOpen && \(\s*\n\s*<LeadIdentityHeader/.test(app))
  ok("the Search Mode banner is hidden too", /!tourMode && !voicemailOpen && isExternalPropertyActive/.test(app))
  ok("…but the outer toolbar (the menu this opened from) stays",
    /<header className="bc-toolbar">/.test(app) && !/voicemailOpen[^\n]*bc-toolbar/.test(app))
  ok("the view renders from the same flag", /voicemailOpen \? \(/.test(app))

  ok("the view fills the panel height", /\.vm-wrap \{[^}]*height: 100%/.test(css))
  ok("…with min-height:0, or a flex child cannot shrink to scroll", /\.vm-wrap \{[^}]*min-height: 0/.test(css))
  ok("the SCRIPT BODY is the scrolling region, not the sidebar",
    /\.vm-body \{[^}]*flex: 1[^}]*overflow-y: auto/.test(css))
  ok("…and no longer caps itself at a fraction of the viewport", !/max-height: 46vh/.test(css))
  for (const sel of ["vm-head", "vm-client", "vm-select", "vm-rowhead", "vm-actions", "vm-foot"]) {
    ok(`${sel} does not steal the body's space (flex:none)`, new RegExp(`\\.${sel} \\{[^}]*flex: none`).test(css))
  }
}

console.log("\n7c. THE CLIENT'S NUMBER, BESIDE THEIR NAME:")
{
  const v = readFileSync("apps/beast-companion/src/sidepanel/lead/VoicemailScriptView.tsx", "utf8")
  const css = readFileSync("apps/beast-companion/src/sidepanel/lead/voicemail.css", "utf8")
  ok("it uses the shared formatter, not a local one", /formatPhone\(lead\.phone\)/.test(v))
  // Both inside the SAME .vm-client block — pinned structurally rather than by proximity, since
  // the comment explaining the shared handler sits between them.
  ok("it sits in the same row as the name", (() => {
    const row = /<div className="vm-client">([\s\S]*?)<\/div>/.exec(v)?.[1] ?? ""
    return /className="vm-name"/.test(row) && /className="vm-phone"/.test(row)
  })())
  ok("clicking it reuses the EXISTING call handler", /onClick=\{\(\) => onContact\("call"\)\}/.test(v))
  ok("…the same one the Call Client button uses", (() => {
    const lpv = readFileSync("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx", "utf8")
    return /onContact\("call"\)/.test(lpv) && /onContact\?: \(method: "call" \| "text"\) => void;/.test(v)
  })())
  ok("no second calling mechanism is introduced",
    !/tel:/.test(v) && !/window\.open/.test(v) && !/dialUrl/.test(v))
  ok("nothing dials on open — the handler only runs onClick", !/useEffect\([^)]*onContact/.test(v))
  ok("no number → no call action rendered", /\{phoneDisplay && onContact && \(/.test(v))
  ok("…and a number with no handler renders as plain text, not a dead button",
    /\{phoneDisplay && !onContact && <span className="vm-phone-plain">/.test(v))
  ok("it is styled with the panel's accent blue", /\.vm-phone \{[^}]*color: var\(--lb-accent\)/.test(css))
  ok("…wraps rather than truncating in a narrow sidebar", /\.vm-client \{[^}]*flex-wrap: wrap/.test(css))
  ok("…and stays pinned while the script scrolls", /\.vm-client \{[^}]*flex: none/.test(css))
  ok("it is a real button with a visible focus ring", /\.vm-phone:focus-visible/.test(css))
}

console.log("\n7d. CLOSING, AND UNSAVED EDITS:")
{
  const v = readFileSync("apps/beast-companion/src/sidepanel/lead/VoicemailScriptView.tsx", "utf8")
  ok("closing routes through a guard", /onClick=\{requestClose\}/.test(v))
  ok("…which only asks when there is actually something to lose",
    /if \(editing && draft\.trim\(\) && draft !== \(isSavedForThisTemplate \? saved!\.body : rendered\)\)/.test(v))
  ok("…and does not close when the locator cancels", /if \(!keep\) return;/.test(v))
  ok("an unedited view closes with no prompt at all", /function requestClose\(\) \{[\s\S]{0,400}onClose\(\);/.test(v))
}

console.log("\n8. THE CRM SIDE, AND WHAT IT DOES NOT TOUCH:")
{
  const d = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  ok("both verbs are allow-listed (an unlisted verb is dead code)",
    /payload\.verb !== "save-voicemail"/.test(d) && /payload\.verb !== "reset-voicemail"/.test(d))
  const block = /if \(payload\.verb === "save-voicemail" \|\| payload\.verb === "reset-voicemail"\)[\s\S]*?\n      \}\n/.exec(d)?.[0] ?? ""
  ok("it calls the workspace-scoped RPCs", /rpc\("save_lead_voicemail_script"/.test(block) && /rpc\("clear_lead_voicemail_script"/.test(block))
  ok("…and never writes leads directly", !/\.from\("leads"\)/.test(block))
  for (const forbidden of ["crm_status", "followup_opt_in", "lead_next_actions", "lead_tours", "sms"]) {
    ok(`the handler never touches ${forbidden}`, !block.includes(forbidden))
  }
  ok("a failed save surfaces an error rather than looking successful", /could not be saved/.test(block))
}

console.log("\n9. REAGAN — the live case:")
{
  // Her real row: move 2027-01-17, must_have_amenities "washer_dryer, high_ceilings, fitness_center".
  const choice = chooseTemplate("2027-01-17", NOW)
  ok("87 days out selects Template 1 automatically", choice.key === "list_sent_30_90" && choice.automatic)
  const p = pickPreferences({ mustHaveAmenities: ["washer_dryer", "high_ceilings", "fitness_center"], amenityLabel: mustHaveAmenityLabel })
  const script = renderVoicemail(choice.key!, { firstName: "Reagan", moveDate: "2027-01-17", preferences: p.values })
  ok("…personalised with her name", script.startsWith("Hey Reagan, it's Jay!"))
  ok("…and her own two stated features",
    script.includes("especially Washer/Dryer and High Ceilings."), script.split("\n\n")[2])
  ok("…with no specials claim", !script.includes(VOICEMAIL_SPECIALS_PARAGRAPH))
  ok("…and no placeholder left behind", !/\[(First Name|Preference 1|Preference 2|Move-In Month|Availability Timeframe)\]/.test(script))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
