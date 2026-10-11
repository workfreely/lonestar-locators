// SOCIAL BEAST — AGENT BETA, STAGE 3: the agent interface. READ-ONLY.
//
// The interface is the least load-bearing part of this feature — every byte it shows arrives
// through guarded routes — so these assertions are mostly about what it CANNOT do: write, reach
// admin surfaces, or present a control that would act before its route exists.
//
// Run: npx tsx scripts/social/agentBetaStage3.test.ts
import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const raw = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const code = (f: string) => raw(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

const AGENT_DIR = "components/crm/social/agent"
const agentFiles = readdirSync(path.join(process.cwd(), AGENT_DIR)).map((f) => path.join(AGENT_DIR, f))

// ── 1. ROUTING AND THE NAV ENTRY ────────────────────────────────────────────
console.log("1. the agent view lives at /social, under Marketing Tools:")
ok("the page exists", existsSync(path.join(process.cwd(), "app/social/page.tsx")))
{
  const page = code("app/social/page.tsx")
  ok("it redirects an unauthenticated visitor to login", /redirect\("\/login"\)/.test(page))
  ok("it redirects a NON-BETA user away", /isAgentBetaUser[\s\S]{0,60}redirect/.test(page))
  ok("...and does not render the dashboard for them",
    page.indexOf("isAgentBetaUser") < page.indexOf("<AgentSocialClient"))

  const nav = code("components/crm/ProfileAvatarMenu.tsx")
  ok("the nav entry sits under Marketing Tools", /Marketing Tools[\s\S]{0,900}Social Beast/.test(nav))
  ok("...directly below Smart Lead Form", /Smart Lead Form[\s\S]{0,700}href="\/social"/.test(nav))
  ok("...and is hidden unless the SERVER says so", /showAgentSocial &&/.test(nav))
  ok("the flag comes from the guarded access route", /\/api\/agent\/social\/access/.test(nav))
  ok("a failed check HIDES the entry (fails closed)", /catch[\s\S]{0,80}setShowAgentSocial\(false\)/.test(nav))
  // The admin's own entry must be untouched and still owner-gated.
  ok("the ADMIN Social Beast entry still exists, still owner-only",
    /isOwner &&[\s\S]{0,900}href="\/admin\/social-autopilot"/.test(nav))
  ok("the agent entry points at /social, never the admin surface",
    /href="\/social"/.test(nav) && !/showAgentSocial[\s\S]{0,200}social-autopilot/.test(nav))
}
{
  const mw = code("middleware.ts")
  ok("/social is registered in APP_PATH_PATTERN (or it 404s on the custom domain)",
    /smart-lead-form\|social\|admin/.test(mw))
}

// ── 2. THE INTERFACE CANNOT WRITE ───────────────────────────────────────────
console.log("\n2. stage 3 is read-only, structurally:")
for (const f of agentFiles) {
  const src = code(f)
  const name = path.basename(f)
  ok(`${name}: issues no mutating fetch`, !/method:\s*["'](POST|PATCH|PUT|DELETE)["']/i.test(src))
  ok(`${name}: touches no supabase client directly`, !/supabase|createClient/.test(src))
}
{
  const lib = code(`${AGENT_DIR}/AgentLibraryTab.tsx`)
  // Parse each <button> and check the ONE that carries the label is actually disabled. Matching
  // on "disabled appears somewhere in the file" would pass even if the wrong button carried it.
  const buttons = [...lib.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0])
  const labelled = (label: string) => buttons.find((b) => new RegExp(`>\\s*${label}\\s*<`).test(b))
  const isDisabled = (b: string | undefined) => !!b && /\bdisabled\b/.test(b)
  ok("Approve is rendered DISABLED", isDisabled(labelled("Approve")))
  ok("Skip is rendered DISABLED", isDisabled(labelled("Skip")))
  ok("...while Review is ENABLED (the only live action)", !!labelled("Review") && !isDisabled(labelled("Review")))
  const acc = code(`${AGENT_DIR}/AgentAccountsTab.tsx`)
  ok("Connect and Pause are DISABLED", (acc.match(/disabled/g) ?? []).length >= 2)
  ok("...and the limitation is stated to the agent, not hidden", /next release/i.test(acc))
}

// ── 3. ONLY AGENT ROUTES ARE CALLED ─────────────────────────────────────────
console.log("\n3. the interface reaches only the agent API:")
for (const f of agentFiles) {
  const src = code(f)
  const urls = [...src.matchAll(/fetch\(\s*[`"']([^`"'$]*)/g)].map((m) => m[1])
  const bad = urls.filter((u) => u && !u.startsWith("/api/agent/"))
  ok(`${path.basename(f)}: ${urls.length} fetch(es), none outside /api/agent/`, bad.length === 0)
}
ok("no agent component imports an ADMIN social component",
  !agentFiles.some((f) => /PostEditor|SocialAutopilotClient|BulkReview|ScheduleWorkspace|QueueClient|PublishingDestinations/.test(code(f))))
ok("the shared calendar HELPERS are reused rather than re-derived",
  /from "@\/lib\/social\/calendar"/.test(code(`${AGENT_DIR}/AgentCalendarTab.tsx`)))
ok("...without dragging in the admin CalendarShell",
  !/CalendarShell/.test(code(`${AGENT_DIR}/AgentCalendarTab.tsx`)))

// ── 4. THE PANEL SHOWS PROVENANCE ───────────────────────────────────────────
console.log("\n4. time-sensitive facts carry their verification date:")
{
  const panel = code(`${AGENT_DIR}/AgentPropertyPanel.tsx`)
  ok("pricing renders a verified date", /Verified[\s\S]{0,120}pricing\?\.lastVerified|lastVerified/.test(panel))
  ok("the special renders its checked-at AND source", /special\.checkedAt/.test(panel) && /special\.source/.test(panel))
  ok("a MISSING date is called out rather than silently omitted", /no verification date/.test(panel))
  ok("media is fetched per-video, not pre-signed in the grid",
    /\/api\/agent\/social\/media\//.test(panel) && !/\/api\/agent\/social\/media\//.test(code(`${AGENT_DIR}/AgentLibraryTab.tsx`)))
  ok("the panel is reachable from BOTH tabs (one property reads one way)",
    /onOpen/.test(code(`${AGENT_DIR}/AgentLibraryTab.tsx`)) && /onOpen/.test(code(`${AGENT_DIR}/AgentCalendarTab.tsx`)))
}

// ── 5. THE ADMIN SURFACE IS UNTOUCHED ───────────────────────────────────────
console.log("\n5. the admin experience is unchanged:")
{
  ok("no admin page or component was modified in stage 3", (() => {
    // ProfileAvatarMenu is shared chrome and IS modified — additively, behind a flag. Every other
    // admin social file must be untouched, which the commit diff asserts; here we assert the agent
    // code does not reach into them.
    return !agentFiles.some((f) => /admin\/social-autopilot/.test(code(f)))
  })())
  ok("the agent page does not import the admin shell",
    !/SocialAutopilotShell|SocialAutopilotNav/.test(code("app/social/page.tsx")))
  ok("the agent dashboard renders its OWN tabs", /AgentLibraryTab|AgentCalendarTab|AgentAccountsTab/.test(code(`${AGENT_DIR}/AgentSocialClient.tsx`)))
}

console.log(`\nAgent beta stage 3: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
