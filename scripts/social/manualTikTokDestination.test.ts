// MANUAL TIKTOK PUBLISHING — choosing which account to post as.
//
// The confirmation panel resolved its account implicitly: the route took the token for "the
// owner's TikTok", which named one account only because there was one. With two connected, the
// operator has to be able to say which — and the panel shows that account's Creator Info, privacy
// options and interaction limits, so the choice has to be made BEFORE those are fetched, not at
// the Post button.
//
// ── THE EXISTING SINGLE-ACCOUNT EXPERIENCE IS UNCHANGED ─────────────────────────────────────
// With one destination the selector does not render, the panel sends connectionId: null, and the
// resolver finds the sole account exactly as before. Every assertion about that is below.
//
// SOURCE ASSERTIONS, with comments stripped so none can be satisfied by prose: the panel sits
// behind an admin auth gate wired to the production database, so there is no way to render it in a
// test without signing in as a real operator — the same reason editorPropertyRow.test.ts gives.
//
// Run: npx tsx scripts/social/manualTikTokDestination.test.ts
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"

let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (what: string, got: unknown, want: unknown) =>
  ok(what, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const ROUTE = code(read("app/api/integrations/tiktok/publish/route.ts"))
const PANEL = code(read("components/crm/social/TikTokPostConfirm.tsx"))
const STATUS = code(read("app/api/integrations/tiktok/publish/status/route.ts"))

console.log("THE ROUTE — which account a manual post publishes as:")
{
  ok("the body accepts a connectionId", /connectionId\?: string/.test(ROUTE))
  ok("the post's own assignment is read from its row", /const assignedConnectionId = \(p as \{ connection_id\?: string \| null \}\)\.connection_id \?\? null/.test(ROUTE))
  // AN ASSIGNED POST IS NOT UP FOR DISCUSSION. connection_id is what
  // social_posts_content_connection_dest_uidx keys on, so publishing elsewhere would leave the row
  // describing an account the video never reached. A disagreement is refused, not resolved.
  ok("a pick that contradicts the post's assignment is REFUSED",
    /if \(assignedConnectionId && chosenConnectionId && chosenConnectionId !== assignedConnectionId\)/.test(ROUTE))
  ok("…with a 409 and a reason naming both options",
    /error: "destination_mismatch"[\s\S]{0,260}status: 409/.test(ROUTE))
  ok("the assignment wins when present, the pick decides when not",
    /getValidTikTokAccessToken\(userId, assignedConnectionId \?\? chosenConnectionId\)/.test(ROUTE))
  // Ownership is the resolver's job and was already asserted in Phase 1; this is the reminder that
  // the route does not bypass it by passing an id straight through to a token read.
  ok("the id goes through the resolver, which verifies it belongs to the caller",
    /getValidTikTokAccessToken\(/.test(ROUTE) && !/sa_get_tiktok_token_by_connection/.test(ROUTE))

  ok("the dry run returns the operator's destinations", /destinations,\n/.test(ROUTE))
  ok("…and the post's own assignment", /assignedConnectionId,\n/.test(ROUTE))
  ok("…read through the CALLER's RLS-scoped client, not the service role",
    /await supabase\s*\n?\s*\.from\("social_connections"\)[\s\S]{0,200}\.eq\("provider", "tiktok"\)/.test(ROUTE))
  // SAFE FIELDS ONLY: no external_account_id (the open_id), no token id, no owner id.
  ok("…selecting only safe display fields",
    /select\("id, username, label, posting_paused"\)/.test(ROUTE))
  for (const leak of ["external_account_id", "token_secret_id", "owner_user_id"]) {
    ok(`…and never ${leak}`, !new RegExp(`destinations[\\s\\S]{0,400}${leak}`).test(ROUTE))
  }
  ok("the paused state travels with each option, so a paused account is visible in the list",
    /paused: d\.posting_paused === true/.test(ROUTE))
  ok("the status endpoint takes a connectionId too, because a publish_id belongs to one account",
    /body\.connectionId \?\? null/.test(STATUS))
}

console.log("\nTHE PANEL — the choice is made before Creator Info is fetched:")
{
  ok("the dry-run shape carries the destinations and the assignment",
    /destinations\?: \{ id: string; username: string \| null; label: string \| null; paused: boolean \}\[\]/.test(PANEL)
    && /assignedConnectionId\?: string \| null/.test(PANEL))
  // THE STALE-CLOSURE TRAP. `load` is memoised on [postId], so a selector that only set state
  // would re-run the dry run with the value from the render that created load — the previous
  // account, or null, which a two-account owner resolves to nothing at all.
  ok("the chosen id is held in a ref as well as state", /const connectionIdRef = useRef<string \| null>\(null\)/.test(PANEL))
  ok("…set through one helper that updates both", /const chooseConnection = \(id: string \| null\) => \{ connectionIdRef\.current = id; setConnectionId\(id\) \}/.test(PANEL))
  ok("…and the dry run reads the REF, not the captured state",
    /mode: "dry_run"[\s\S]{0,120}connectionId: connectionIdRef\.current/.test(PANEL))
  ok("load is still memoised on postId alone, so its dependencies did not widen", /\}, \[postId\]\)/.test(PANEL))
  // Changing the account must RELOAD: the creator, the privacy options and the interaction
  // capabilities below are that account's live Creator Info.
  ok("changing the selection reloads the panel", /onChange=\{\(e\) => \{ chooseConnection\(e\.target\.value\); void load\(\) \}\}/.test(PANEL))
  ok("the post call sends the chosen account", /connectionId,\n\s*\}\),/.test(PANEL))
  ok("the status check sends it too", /publishId: result\.publishId, connectionId/.test(PANEL))

  // THE SINGLE-ACCOUNT EXPERIENCE, which must not change.
  ok("the selector renders ONLY when there is more than one destination",
    /\(data\.destinations\?\.length \?\? 0\) > 1 && !data\.assignedConnectionId/.test(PANEL))
  ok("…and an assigned post is told, not offered a contradiction",
    /\(data\.destinations\?\.length \?\? 0\) > 1 && data\.assignedConnectionId/.test(PANEL)
    && /Assigned to this destination/.test(PANEL))
  ok("the initial choice is null, which is what a single-account owner sends",
    /useState<string \| null>\(null\)\n\s*const connectionIdRef/.test(PANEL))
  ok("a paused destination is labelled in the list", /d\.paused \? " \(paused\)" : ""/.test(PANEL))
  ok("the selector is disabled while loading or posting", /disabled=\{loading \|\| posting\}/.test(PANEL))

  // Nothing about the existing confirmation flow moved.
  for (const [what, needle] of [
    ["the single dry-run call", 'mode: "dry_run"'],
    ["privacy never pre-selected", "Privacy is deliberately NOT pre-selected"],
    ["all three interactions starting off", "setAllowComment(false)"],
    ["the Branded Content policy link", "BRANDED_CONTENT_POLICY_URL"],
    ["the music-usage confirmation link", "MUSIC_USAGE_CONFIRMATION_URL"],
    ["the explicit post confirmation", "Post this video to TikTok now?"],
  ] as const) {
    ok(`${what} is unchanged`, read("components/crm/social/TikTokPostConfirm.tsx").includes(needle))
  }
}

console.log("\nRELEASE SCOPE — the selector, the migration test and nothing else:")
{
  const BASELINE = "caf8b77"
  const has = (() => {
    try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
  })()
  if (!has) {
    console.log(`  – skipped: ${BASELINE} is not in this clone`)
  } else {
    const lines = (cmd: string) =>
      execSync(cmd, { encoding: "utf8" }).trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const changed = [...new Set([
      ...lines(`git diff --name-only ${BASELINE} -- . ':!next-env.d.ts'`),
      ...lines("git ls-files --others --exclude-standard"),
    ])].sort()
    const APPROVED = [
      "app/api/integrations/tiktok/publish/route.ts",
      "components/crm/social/TikTokPostConfirm.tsx",
      "scripts/social/manualTikTokDestination.test.ts",
      // Its audit-scope check was open-ended against the working tree; pinned to its own commit.
      "scripts/social/releaseIntegrationAudit.test.ts",
      // Phase 1 pinned the manual route's token line exactly; the selector changed that line, so
      // its assertion is restated to the current, stronger shape with its claim intact.
      "scripts/social/tiktokAccountIsolation.test.ts",
    ].sort()
    eq(`exactly the ${APPROVED.length} approved files changed`, changed, APPROVED)
    ok("no migration is part of this change", !changed.some((f) => f.startsWith("supabase/")))
    for (const [label, re] of [
      ["the planner and the schedulers", /autopilot|recurrence\.ts/],
      ["the TikTok worker", /social-tiktok-publish/],
      ["the Instagram worker", /social-instagram-publish/],
      ["the token resolver and its decisions", /tiktokServer|tiktokConnectionChoice/],
      ["the market restriction", /marketRestriction\.ts/],
      ["OAuth, connect and callback", /(tiktok|instagram)\/(connect|callback)\//],
      ["the accounts screen", /PublishingDestinations|social-autopilot\/accounts/],
      ["captions, templates and hashtags", /composePost|hashtags\.ts|overlaySpec/],
      ["the unrelated failing suites", /scripts\/(leads|tests|auth|share|notifications|companion)\//],
    ] as const) {
      ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
    }
    for (const [f, allowed, why] of [
      ["app/api/integrations/tiktok/publish/route.ts", 3, "the body type's closing lines and the token line"],
      ["components/crm/social/TikTokPostConfirm.tsx", 9, "the DryRun type's three lines, the dry-run body, the status body, and the account block's five lines"],
      // Six: the five-line `auditChanged` expression and the one-line category pattern that the new
      // test file's own name tripped as a false positive.
      ["scripts/social/releaseIntegrationAudit.test.ts", 6, "the audit-scope diff range and one category pattern"],
      ["scripts/social/tiktokAccountIsolation.test.ts", 2, "the manual route's token-line assertion"],
    ] as const) {
      const removed = lines(`git diff --unified=0 ${BASELINE} -- ${f}`)
        .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok(`${f} removes at most the ${allowed} line(s) it replaces (${why})`, removed.length <= allowed,
        `removed ${removed.length}`)
    }
  }
}

console.log(`\nManual TikTok destination: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
