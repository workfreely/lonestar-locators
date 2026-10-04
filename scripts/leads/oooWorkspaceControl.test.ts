/**
 * OUT OF OFFICE — the workspace API and the Companion control.
 *
 * Three things carry real risk here, and they are what this file is about:
 *
 *   1. TENANCY. The route decides which workspace to write from the SESSION. If a
 *      username, slug or workspace id from the request could ever steer it, one
 *      locator could mark another away. The slug must travel outward only.
 *   2. THE PRESERVED RETURN DATE. "Turn it off without losing my date" is an
 *      explicit product requirement, and the failure mode is silent: the date is
 *      simply gone next time. The route must distinguish an OMITTED `until` from
 *      an explicit null.
 *   3. BLAST RADIUS. Being away must affect ONLY the opening pair for leads
 *      created afterwards. Nothing in this feature may read or write a run, an
 *      intent, a share, a recommendation, Beast Sync or criteria state.
 *
 * The extension half is asserted by reading the source rather than by rendering:
 * the panel runs inside a Chrome side panel against chrome.storage, which has no
 * meaningful test double here. What IS checkable — and what actually broke things
 * before — is whether the message type is registered, validated, and relayed by
 * the one path that is allowed to reach the authenticated API.
 *
 * Run: npx tsx scripts/leads/oooWorkspaceControl.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

async function main() {
  console.log("\nOUT OF OFFICE — WORKSPACE API + COMPANION CONTROL\n")

  const ROUTE = "app/api/admin/workspace/out-of-office/route.ts"
  const route = strip(read(ROUTE))

  console.log("TENANCY — the workspace comes from the session, never the request:")
  {
    ok("the route is authenticated", /requireWorkspaceMember\(\)/.test(route))
    ok("…and returns the guard's own response on failure",
      /if \(!guard\.ok\) return guard\.response/.test(route))
    // Every read and write must be keyed on guard.workspaceId.
    const eqIds = route.match(/\.eq\("id",\s*([A-Za-z0-9_.]+)\)/g) ?? []
    ok("every workspace lookup is keyed on guard.workspaceId",
      eqIds.length > 0 && eqIds.every((m) => m.includes("guard.workspaceId")),
      `found ${JSON.stringify(eqIds)}`)
    ok("…and there is more than one such lookup (read + write both scoped)", eqIds.length >= 2)

    // The decisive negative: nothing from the body may name a workspace.
    ok("the body is never read for a workspace id",
      !/body\.(workspaceId|workspace_id|slug|username)/.test(route))
    ok("the slug is SELECTED but never used as a filter",
      /select\("slug/.test(route) && !/\.eq\("slug"/.test(route))
    // This pair originally asserted the OPPOSITE — that the write used the
    // caller's RLS client and no service role. That shipped, and failed silently
    // in production: public.workspaces has only a SELECT policy, so the update
    // matched zero rows, PostgREST reported no error, and the route returned 200
    // having changed nothing. The guard is the tenancy gate here, not RLS.
    ok("the WRITE uses the service role (workspaces has no UPDATE policy)",
      /supabaseAdmin[\s\S]{0,80}\.update\(/.test(route))
    ok("…but the workspace is still the session's, never the body's",
      /\.update\(update\)[\s\S]{0,60}\.eq\("id", guard\.workspaceId\)/.test(route))
    ok("the READ still goes through the caller's RLS client",
      /guard\.supabase[\s\S]{0,120}\.select\("slug/.test(route))

    // The structural lesson: a write that affects nothing must not read as success.
    ok("the update asks for its affected row back",
      /\.update\(update\)[\s\S]{0,120}\.select\("id"\)/.test(route))
    ok("…and a zero-row write is a 500, not a silent 200",
      /written\.length !== 1[\s\S]{0,320}status: 500/.test(route))
  }

  console.log("\nTHE PRESERVED RETURN DATE:")
  {
    // The whole requirement lives in one conditional. If the update object were
    // built unconditionally, toggling off would null the date.
    ok("`until` is written ONLY when the key is present", /if \("until" in body\)/.test(route))
    ok("…so the update object starts with enabled alone",
      /const update[^=]*=\s*\{\s*out_of_office_enabled: body\.enabled\s*\}/.test(route))
    ok("an explicit null DOES clear it",
      /raw === null \|\| raw === ""[\s\S]{0,80}out_of_office_until = null/.test(route))
    ok("a date is validated as YYYY-MM-DD before it reaches Postgres",
      /DATE_ONLY\.test\(raw\)/.test(route))
    ok("…and an impossible date (2026-02-31) is a 400, not a 500",
      /not a real date/.test(route) && /getUTCDate\(\)/.test(route))
    ok("a bad type is rejected rather than coerced",
      /until must be YYYY-MM-DD or null/.test(route))
    ok("enabled must be a real boolean", /typeof body\.enabled !== "boolean"/.test(route))
  }

  console.log("\nTHE ANSWER IS THE STORED STATE, not the request:")
  {
    ok("POST re-reads after writing", (route.match(/readState\(guard\)/g) ?? []).length >= 2)
    ok("…and the re-read happens AFTER the update",
      route.indexOf(".update(update)") < route.lastIndexOf("readState(guard)"))
    ok("the URLs are built server-side, not in the extension",
      /previewUrl: `\$\{SITE_ORIGIN\}\/admin\/out-of-office\/preview`/.test(route))
    ok("…and the public slug is URL-encoded", /encodeURIComponent\(slug\)/.test(route))
  }

  console.log("\nUX POLISH — calendar, banner, preview:")
  {
    const control = strip(read("apps/beast-companion/src/sidepanel/menu/OutOfOfficeControl.tsx"))
    const cal = strip(read("apps/beast-companion/src/sidepanel/menu/DateField.tsx"))
    const pub = strip(read("app/locator-beast/[username]/out-of-office/page.tsx"))
    const view = strip(read("app/locator-beast/[username]/out-of-office/OutOfOfficeView.tsx"))
    const prev = strip(read("app/admin/out-of-office/preview/page.tsx"))

    // (1) THE CALENDAR — the CRM picker's grid, ported, date-only.
    ok("the Return date uses the calendar, not a native date input",
      /<DateField/.test(control) && !/type="date"/.test(control))
    ok("the whole field is the trigger (a click anywhere opens it)",
      /className=\{`bc-cal-trigger[\s\S]{0,400}onClick=\{\(e\) => \{[\s\S]{0,80}setOpen\(\(o\) => !o\)/.test(cal))
    ok("it mirrors the CRM grid's leading-blank cell math",
      /const firstWeekday = new Date\(year, month, 1\)\.getDay\(\)/.test(cal) &&
      /for \(let i = 0; i < firstWeekday; i\+\+\) out\.push\(null\)/.test(cal))
    ok("selecting a day updates the OOO date state",
      /onChange=\{\(next\) => ooo\.save\(\{ enabled: ooo\.enabled, until: next \}\)\}/.test(control))
    // DATE-ONLY + NO TIMEZONE CONVERSION — the whole point.
    ok("values are composed from LOCAL parts, never toISOString()",
      /getFullYear\(\)\}-\$\{pad\(d\.getMonth\(\) \+ 1\)\}-\$\{pad\(d\.getDate\(\)\)\}/.test(cal) &&
      !/toISOString/.test(cal))
    ok("…and parsed by parts, never new Date(iso)",
      /new Date\(Number\(m\[1\]\), Number\(m\[2\]\) - 1, Number\(m\[3\]\)\)/.test(cal))
    ok("it emits a bare YYYY-MM-DD (no time component)",
      !/T\$\{/.test(cal) && !/:00/.test(cal))
    ok("Clear sends an explicit null, not an omission", /onChange\(null\)/.test(cal))
    ok("Escape closes only the calendar, not the whole menu",
      /e\.stopPropagation\(\)[\s\S]{0,60}setOpen\(false\)/.test(cal))
    ok("the API/schema are untouched by the picker swap",
      /until: next/.test(control) && !/out_of_office/.test(cal))

    // (2) THE BANNER — one line, no date.
    ok("the ON banner says just 'away' with no date",
      /You’re <strong>away<\/strong>/.test(control) && !/until \{formatDateDisplay/.test(control))
    ok("…and the date is not repeated there", !/formatDateDisplay/.test(control))
    ok("the OFF banner is unchanged", /You’re <strong>in the office<\/strong>/.test(control))

    // (3) PREVIEW — authenticated, and the public gate NOT weakened.
    ok("the public route still renders the same component", /OutOfOfficeView/.test(pub))
    // Directly: the public route renders the view with ONLY a username. The
    // earlier version of this assertion was an or-chain that could pass without
    // proving anything.
    ok("…and renders it with username ALONE — no preview prop",
      /<OutOfOfficeView username=\{username\} \/>/.test(pub) && !/preview/.test(pub))
    ok("the gate still 404s a locator who is not away",
      /if \(!preview && !ooo\?\.out_of_office_enabled\) notFound\(\)/.test(view))
    ok("…and an unknown username 404s in BOTH modes",
      /if \(!agent\) notFound\(\)/.test(view))
    ok("there is NO query-parameter bypass anywhere",
      !/searchParams/.test(view) && !/searchParams/.test(pub) && !/preview=1/.test(view))
    ok("the preview route is authenticated", /requireWorkspaceMember\(\)/.test(prev))
    ok("…and 404s rather than leaking a 401/403 JSON", /if \(!guard\.ok\) notFound\(\)/.test(prev))
    ok("…and resolves the username from the SESSION, never a param",
      /\.eq\("id", guard\.workspaceId\)/.test(prev) && !/params/.test(prev))
    ok("the preview WRITES nothing", !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(prev))
    ok("…and never sets out_of_office_enabled", !/out_of_office_enabled/.test(prev))
    ok("the Companion Preview button targets the authenticated route",
      /previewUrl: `\$\{SITE_ORIGIN\}\/admin\/out-of-office\/preview`/.test(strip(read(ROUTE))))
    ok("the preview renders the identical view component",
      /<OutOfOfficeView username=\{slug\} preview \/>/.test(prev))
  }

  console.log("\nBLAST RADIUS — the route touches nothing else:")
  {
    for (const forbidden of [
      "lead_followup_runs", "followup_intents", "leads", "client_shares",
      "lead_favorites", "companion_messages", "criteria", "share", "resume",
      "ooo_held_at", "ooo_released_at",
    ]) {
      ok(`the route never references ${forbidden}`, !new RegExp(forbidden).test(route))
    }
    ok("…it writes exactly the two OOO columns and nothing else",
      (route.match(/out_of_office_(enabled|until)/g) ?? []).length > 0 &&
      !/\bupdate\(\{[^}]*(?<!out_of_office)_at\b/.test(route))
  }

  console.log("\nTHE CRM RELAY — the only path to the authenticated API:")
  {
    const dash = strip(read("components/crm/DashboardClient.tsx"))
    ok("the CRM listens for the request", /d\.type !== "out-of-office-request"/.test(dash))
    ok("…only from its own window and origin",
      /e\.source !== window \|\| e\.origin !== window\.location\.origin[\s\S]{0,400}out-of-office-request/.test(dash))
    ok("…and only for the Companion's source tag",
      /d\.source !== COMPANION_MSG_SOURCE[\s\S]{0,60}out-of-office-request/.test(dash))
    ok("an unknown op is dropped (read|write only)",
      /payload\.op === "write" \? "write" : payload\.op === "read" \? "read" : null/.test(dash))
    ok("a request with no nonce is dropped", /if \(!nonce \|\| !op\) return/.test(dash))
    ok("a read is a GET", /method: "GET"/.test(dash))
    ok("a write forwards `until` ONLY when the panel sent it",
      /"until" in payload \? \{ until: payload\.until \} : \{\}/.test(dash))
    ok("the result is posted back to its own origin",
      /out-of-office-result"[\s\S]{0,80}window\.location\.origin/.test(dash))
    ok("a failed call reports an error rather than a fabricated state",
      /error: "ooo_failed"/.test(dash))
    ok("…and a successful one is only trusted when the server said enabled",
      /res\.ok && typeof json\?\.enabled === "boolean"/.test(dash))

    // It must be a SEPARATE listener from the per-lead verb channel: that one
    // returns early when it cannot find a lead, and OOO has no lead.
    ok("it is NOT routed through the per-lead workflow-verb handler",
      !/payload\.verb !== "out-of-office/.test(dash) && !/verb === "out-of-office/.test(dash))
    ok("…and it never looks up a lead",
      !/out-of-office-request[\s\S]{0,2000}localLeadsRef\.current\.find/.test(dash))
  }

  console.log("\nTHE EXTENSION — registered, validated, relayed:")
  {
    const validate = read("apps/beast-companion/src/utils/validate.ts")
    const bridge = strip(read("apps/beast-companion/src/content/outOfOfficeBridge.ts"))
    const index = strip(read("apps/beast-companion/src/content/index.ts"))
    const hook = strip(read("apps/beast-companion/src/sidepanel/menu/useOutOfOffice.ts"))
    const menu = strip(read("apps/beast-companion/src/sidepanel/menu/CompanionMenu.tsx"))
    const control = strip(read("apps/beast-companion/src/sidepanel/menu/OutOfOfficeControl.tsx"))
    const cal2 = strip(read("apps/beast-companion/src/sidepanel/menu/DateField.tsx"))

    // An unregistered type is dropped by isKnownEnvelope — the classic way a new
    // message silently never arrives.
    ok("the result type is registered in INBOUND_TYPES",
      /INBOUND_TYPES = \[[^\]]*"out-of-office-result"/.test(validate))
    ok("the bridge is registered in the content entry",
      /startOutOfOfficeBridge\(\)/.test(index) && /from "\.\/outOfOfficeBridge"/.test(index))
    ok("the bridge is self-gated to the CRM admin pages",
      /isCrmPage\(\)/.test(bridge) && /pathname\.startsWith\("\/admin"\)/.test(bridge))
    ok("…and localhost only under __LB_DEV__", /__LB_DEV__ &&/.test(bridge))
    ok("the result passes the trust checks BEFORE its payload is inspected",
      bridge.indexOf("isTrustedMessageEvent") < bridge.indexOf("isValidOooResultPayload"))
    ok("…and a schema check gates the storage write",
      /if \(!isValidOooResultPayload\(d\.payload\)\) return/.test(bridge))

    // The validator is what stops a forged page script driving the panel.
    ok("the validator rejects a non-date `until`",
      /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(validate.slice(validate.indexOf("isValidOooResultPayload"))))
    ok("…and restricts previewUrl to http(s) (it reaches an anchor/window.open)",
      /previewUrl[\s\S]{0,200}\^https\?:\\\/\\\//.test(validate.slice(validate.indexOf("isValidOooResultPayload"))))

    // Freshness: the requirement is "reads current state on open".
    ok("the panel re-reads on EVERY open", /useEffect\([\s\S]{0,200}if \(!open\)[\s\S]{0,160}refresh\(\)/.test(hook))
    ok("…and nothing is persisted locally (no chrome.storage pref key for state)",
      !/lb-pref-ooo|PREF_OOO/.test(hook) && !/lb-pref/.test(control))
    ok("every request carries a fresh nonce", /nonce = `\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\}`/.test(hook))
    ok("…and a result is applied only when its nonce matches the one in flight",
      /r\.nonce !== pending\.current\) return/.test(hook))
    ok("an unanswered request becomes 'unreachable', not a stuck spinner",
      /setStatus\("unreachable"\)/.test(hook) && /TIMEOUT_MS/.test(hook))

    // The On/Off flip must not carry a date, or it would overwrite the stored one.
    // (The control is now live-commit: the calendar commits on selection, so the
    // old draft/dirty assertions were retired with the draft state itself.)
    ok("an On/Off flip sends NO `until` key",
      /ooo\.save\(\{ enabled: !ooo\.enabled \}\)/.test(control))
    ok("…and the toggle has no date branch left to get wrong",
      !/dirty/.test(control) && !/draft/.test(control))
    ok("a date selection commits on its own, carrying the current enabled state",
      /onChange=\{\(next\) => ooo\.save\(\{ enabled: ooo\.enabled, until: next \}\)\}/.test(control))
    ok("clearing sends an explicit null (from the calendar's Clear)",
      /onChange\(null\)/.test(cal2))
    ok("the date is rendered with the shared formatter, not new Date()",
      /formatDateDisplay\(value\)/.test(cal2) && !/new Date\(value/.test(cal2))
    ok("…and the input's min is built from LOCAL parts, not toISOString()",
      /todayLocalIso/.test(control) && !/toISOString\(\)/.test(control))

    // Menu placement, exactly as specified.
    const iVoice = menu.indexOf("Voicemail Script")
    const iOoo = menu.indexOf("Out of Office")
    const iTheme = menu.indexOf("<ThemeSelect")
    ok("the menu order is Voicemail Script → Out of Office → Theme",
      iVoice >= 0 && iOoo > iVoice && iTheme > iOoo,
      `voice=${iVoice} ooo=${iOoo} theme=${iTheme}`)
    ok("Out of Office opens the control instead of toggling inline",
      /setView\("ooo"\)/.test(menu) && !/PrefToggle[^\n]*Out of Office/.test(menu))
    ok("the preview link opens in a new tab, safely",
      /target="_blank"/.test(control) && /rel="noopener noreferrer"/.test(control))
  }

  console.log("\nUNTOUCHED SYSTEMS:")
  {
    // ISOLATION BY IMPORT, not by prose. An earlier version of this check grepped
    // the files for words like "share" and "lead", which failed on the module
    // name "@bc/companion-shared" and on the control's own user-facing copy
    // ("new leads can still submit your form") — both correct. What actually
    // establishes isolation is the dependency list: a file that imports nothing
    // from another system cannot touch it.
    const NEW_FILES = {
      "content/outOfOfficeBridge.ts": "apps/beast-companion/src/content/outOfOfficeBridge.ts",
      "menu/OutOfOfficeControl.tsx": "apps/beast-companion/src/sidepanel/menu/OutOfOfficeControl.tsx",
      "menu/useOutOfOffice.ts": "apps/beast-companion/src/sidepanel/menu/useOutOfOffice.ts",
      "menu/DateField.tsx": "apps/beast-companion/src/sidepanel/menu/DateField.tsx",
    } as const
    const ALLOWED_IMPORTS = new Set([
      "react", "@bc/companion-shared", "@/utils/log", "@/utils/validate",
      "./useOutOfOffice", "./DateField",
    ])
    for (const [label, file] of Object.entries(NEW_FILES)) {
      const src = strip(read(file))
      const specs = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!)
      const rogue = specs.filter((s) => !ALLOWED_IMPORTS.has(s))
      ok(`${label} imports only its own dependencies`, rogue.length === 0,
        `unexpected: ${JSON.stringify(rogue)}`)
      // And no storage key belonging to another bridge.
      const keys = [...src.matchAll(/"(lb-[a-z0-9-]+)"/g)].map((m) => m[1]!)
      const foreign = keys.filter((k) => k !== "lb-ooo-request" && k !== "lb-ooo-result" && k !== "lb-companion")
      ok(`…and touches no other bridge's storage keys`, foreign.length === 0,
        `unexpected: ${JSON.stringify(foreign)}`)
    }
    // The control must not reach any API itself — that is the CRM's job.
    const control = strip(read("apps/beast-companion/src/sidepanel/menu/OutOfOfficeControl.tsx"))
    const hook = strip(read("apps/beast-companion/src/sidepanel/menu/useOutOfOffice.ts"))
    ok("the extension performs no fetch of its own",
      !/fetch\(/.test(control) && !/fetch\(/.test(hook))
    ok("…and names no locatorbeast URL (the preview URL comes from the server)",
      !/locatorbeast/.test(control) && !/locatorbeast/.test(hook))
    // The migration already applied to production must not have been edited.
    const mig = read("supabase/manual/20261003_workspace_out_of_office.sql")
    ok("the applied migration still declares exactly the two columns",
      /out_of_office_enabled boolean not null default false/.test(mig) &&
      /out_of_office_until   date/.test(mig))
    ok("…and its public resolver is still read-only SQL",
      /language sql/.test(mig) && /stable/.test(mig) && !/insert|update|delete/i.test(
        mig.slice(mig.indexOf("create or replace function"))))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
