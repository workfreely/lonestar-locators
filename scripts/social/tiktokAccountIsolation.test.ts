// SOCIAL BEAST — TIKTOK ACCOUNT ISOLATION (Phase 1).
//
// TikTok's token lifecycle was written when one owner meant one TikTok account, so all of it was
// scoped by (owner_user_id, provider = 'tiktok'). With a SECOND TikTok account that scoping is not
// merely ambiguous, it is destructive. Four defects, each verified against the production catalog
// before a line was changed:
//
//   CONNECT    sa_connect_tiktok looked up "the previous Vault secret" by owner+provider with no
//              account filter and deleted it after inserting the new row — so connecting a second
//              account DELETED THE FIRST ACCOUNT'S TOKEN, leaving a row that still read
//              "connected" over a dangling pointer.
//   REFRESH    sa_update_tiktok_token rotated with UPDATE ... WHERE owner AND provider, pointing
//              BOTH rows at ONE secret. Both destinations would then publish as whichever account
//              refreshed.
//   DISCONNECT sa_disconnect_tiktok() deleted every TikTok row for the owner and revoked one
//              secret.
//   READ       sa_get_tiktok_token ended in an UNORDERED `limit 1` — an arbitrary account's
//              credentials, returned as though a choice had been made.
//
// These assertions cover the five behaviours Phase 1 is about — connection, refresh, publishing
// identity, pause, disconnect — with two accounts connected.
//
// ── WHAT IS TESTED HOW, AND WHY ──────────────────────────────────────────────────────────────
// The DECISIONS (which account, is its token still good, does it belong to this owner) are real
// unit tests: they were moved into lib/social/tiktokConnectionChoice.ts precisely so they could be,
// because lib/social/tiktokServer.ts carries `import "server-only"` and cannot be imported by a
// test at all — the package does not exist outside Next's own resolution. buildTokenBundle is also
// exercised for real.
//
// The SQL and the wiring are source assertions, with comments stripped so no assertion can be
// satisfied by prose. They pin the things that actually broke: a WHERE clause's scope, a missing
// row lock, a token variable reused across rows. The live database is checked separately by
// 20261115000003_…verify.sql, which runs before and after the migration.
//
// Run: npx tsx scripts/social/tiktokAccountIsolation.test.ts
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { soleConnectionId, tokenNeedsRefresh, connectionBelongsToOwner, TIKTOK_EXPIRY_MARGIN_MS } from "@/lib/social/tiktokConnectionChoice"
import { buildTokenBundle } from "@/lib/social/tiktok"

let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (what: string, got: unknown, want: unknown) =>
  ok(what, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const sqlOf = (s: string) => s.replace(/--[^\n]*/g, "")

const MIG = sqlOf(read("supabase/prepared/20261115000003_tiktok_connection_scoped_tokens.sql"))
const SERVER = code(read("lib/social/tiktokServer.ts"))
const WORKER = code(read("app/api/cron/social-tiktok-publish/route.ts"))
const UI = code(read("components/crm/social/PublishingDestinations.tsx"))
const CAPS = code(read("lib/social/accountCapabilities.ts"))
const PAGE = code(read("app/admin/social-autopilot/accounts/page.tsx"))

// Two accounts, used throughout. REP is the live Real Estate Pro destination; LB is the Locator
// Beast one that does not exist yet.
const REP = "11111111-1111-1111-1111-111111111111"
const LB = "22222222-2222-2222-2222-222222222222"
const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const OTHER_OWNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

// ── WHICH ACCOUNT ─────────────────────────────────────────────────────────────────────────────
console.log("WHICH ACCOUNT — one is an answer, two is a question:")
{
  eq("no connections → null", soleConnectionId([]), null)
  eq("null rows → null", soleConnectionId(null), null)
  eq("one connection → that one", soleConnectionId([{ id: REP }]), REP)
  // THE DEFECT, as a test. Two accounts have no owner-level answer, and the old SQL answered
  // anyway with an unordered limit 1.
  eq("TWO connections → null, never a pick", soleConnectionId([{ id: REP }, { id: LB }]), null)
  eq("…and still null with the rows the other way round", soleConnectionId([{ id: LB }, { id: REP }]), null)
  eq("three → null", soleConnectionId([{ id: REP }, { id: LB }, { id: OWNER }]), null)
  // A blank id is not a connection; it would otherwise make a sole real account read as ambiguous.
  eq("a blank id is not counted", soleConnectionId([{ id: REP }, { id: "" }]), REP)
}

// ── IS THE TOKEN STILL GOOD ───────────────────────────────────────────────────────────────────
console.log("\nTOKEN FRESHNESS — unknown is never 'fresh':")
{
  const now = Date.parse("2026-11-12T12:00:00Z")
  const at = (ms: number) => new Date(now + ms).toISOString()
  ok("a token valid for another hour is used as-is", !tokenNeedsRefresh(at(3_600_000), now))
  ok("one already expired refreshes", tokenNeedsRefresh(at(-1), now))
  ok("one expiring inside the margin refreshes", tokenNeedsRefresh(at(TIKTOK_EXPIRY_MARGIN_MS - 1_000), now))
  ok("…and one just outside it does not", !tokenNeedsRefresh(at(TIKTOK_EXPIRY_MARGIN_MS + 1_000), now))
  eq("the margin is a minute", TIKTOK_EXPIRY_MARGIN_MS, 60_000)
  // The old expression was `!!token_expires_at && …`, so a null expiry read as valid for ever.
  ok("a MISSING expiry refreshes rather than being trusted indefinitely", tokenNeedsRefresh(null, now))
  ok("…as does an empty one", tokenNeedsRefresh("", now))
  ok("…as does an unparseable one", tokenNeedsRefresh("not a date", now))
}

// ── WHOSE ACCOUNT ─────────────────────────────────────────────────────────────────────────────
console.log("\nOWNERSHIP — a caller-supplied connection id is checked, not trusted:")
{
  ok("the owner's own connection is allowed", connectionBelongsToOwner(OWNER, OWNER))
  // The request-time routes accept a connectionId from the caller. Without this check, passing
  // someone else's id would borrow their credential.
  ok("another owner's connection is refused", !connectionBelongsToOwner(OTHER_OWNER, OWNER))
  ok("an unknown row owner is refused, not allowed", !connectionBelongsToOwner(null, OWNER))
  ok("…and so is a missing caller", !connectionBelongsToOwner(OWNER, null))
  ok("two blanks are not a match", !connectionBelongsToOwner("", ""))
}

// ── THE REFRESH BUNDLE ────────────────────────────────────────────────────────────────────────
console.log("\nREFRESH — a rotation must not throw away the refresh token:")
{
  const parse = (s: string) => JSON.parse(s) as Record<string, unknown>
  const rotated = parse(buildTokenBundle({ access_token: "A2", refresh_token: "R2", expires_in: 86400, refresh_expires_in: 31536000 } as never))
  eq("a rotated refresh token is stored", rotated.refresh_token, "R2")
  eq("…with the new access token", rotated.access_token, "A2")
  // TikTok normally rotates the refresh token, but the response type allows it to be absent, and a
  // bundle written without one is a connection that dies at the next expiry with no way back
  // except re-authorizing — a silent, unrecoverable loss of a working account.
  const kept = parse(buildTokenBundle(
    { access_token: "A3", expires_in: 86400 } as never,
    { refresh_token: "R1", refresh_expires_at: "2027-01-01T00:00:00.000Z" },
  ))
  eq("a response WITHOUT a rotated refresh token keeps the one we hold", kept.refresh_token, "R1")
  eq("…and keeps its expiry rather than dating it to now", kept.refresh_expires_at, "2027-01-01T00:00:00.000Z")
  eq("…and still takes the new access token", kept.access_token, "A3")
  // The connect path passes no previous bundle, so its behaviour is unchanged by construction.
  const connect = parse(buildTokenBundle({ access_token: "A1", refresh_token: "R1", expires_in: 86400, refresh_expires_in: 31536000 } as never))
  eq("the connect path (no previous bundle) is unchanged", connect.refresh_token, "R1")
  ok("…and dates the refresh expiry from the response", typeof connect.refresh_expires_at === "string")
}

// ── CONNECTION: the defect that destroys a token ──────────────────────────────────────────────
console.log("\nCONNECT — authorizing one account must not touch the other's secret:")
{
  ok("sa_connect_tiktok scopes the old-secret lookup to THIS account",
    /select sc\.token_secret_id into v_old_secret[\s\S]{0,260}external_account_id is not distinct from p_open_id/.test(MIG))
  ok("…and returns only the account just authorized",
    /return query[\s\S]{0,300}external_account_id is not distinct from p_open_id/.test(MIG))
  // Everything else about the connect path is carried over, because it is the OAuth flow.
  for (const [what, needle] of [
    ["the signature", "p_open_id      text"],
    ["the platform-admin check", "if not public.is_platform_admin() then"],
    ["the session check", "sa_connect_tiktok: no session"],
    ["the unique secret name from 20261013000001", "to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')"],
    ["the ON CONFLICT target", "on conflict (owner_user_id, provider, external_account_id) do update"],
    ["the grant to authenticated", "grant execute on function public.sa_connect_tiktok(text, text, text[], text, timestamptz, text) to authenticated"],
  ] as const) {
    ok(`…and keeps ${what}`, MIG.includes(needle))
  }
  // CREATE BEFORE DELETE: a failure part-way must leave a working token, never none.
  const createAt = MIG.indexOf("v_secret := vault.create_secret(")
  const deleteAt = MIG.indexOf("if v_old_secret is not null and v_old_secret <> v_secret then")
  ok("the new secret is created BEFORE the old one is removed", createAt > 0 && createAt < deleteAt)
}

// ── REFRESH: one row, locked ──────────────────────────────────────────────────────────────────
console.log("\nREFRESH — by connection, under a row lock:")
{
  ok("sa_update_tiktok_token_by_connection exists",
    /create or replace function public\.sa_update_tiktok_token_by_connection\(/.test(MIG))
  // THE CONCURRENCY FIX. Two overlapping refreshes of one destination must serialise, or each
  // orphans the other's secret and one refresh is silently discarded.
  ok("…it locks the connection row", /where sc\.id = p_connection_id and sc\.provider = 'tiktok'\s*\n\s*for update;/.test(MIG))
  ok("…it writes ONE row, by id", /update public\.social_connections[\s\S]{0,200}where id = p_connection_id;/.test(MIG))
  ok("…it never writes by owner+provider",
    !/update public\.social_connections[\s\S]{0,200}where owner_user_id = p_owner and provider = 'tiktok';/.test(
      MIG.slice(MIG.indexOf("sa_update_tiktok_token_by_connection"), MIG.indexOf("sa_connect_tiktok"))))
  // The owner-scoped version named secrets with epoch SECONDS, so two connections of one owner
  // refreshing inside the same second would collide on vault's unique name index.
  ok("…its Vault secret name carries the connection id and microseconds",
    /'social:tiktok:conn:' \|\| p_connection_id::text[\s\S]{0,120}YYYYMMDDHH24MISSUS/.test(MIG))
  ok("…and supersedes only the secret it read",
    /if v_old_secret is not null and v_old_secret <> v_secret then[\s\S]{0,160}delete from vault\.secrets where id = v_old_secret/.test(MIG))
  ok("the reader exists and is scoped by id",
    /create or replace function public\.sa_get_tiktok_token_by_connection\([\s\S]{0,900}where sc\.id = p_connection_id and sc\.provider = 'tiktok'/.test(MIG))
  ok("…and returns the row's own owner and pause state, so a caller need not re-read it",
    /sc\.posting_paused, sc\.owner_user_id/.test(MIG))
  // Service-role only: a token must not be resolvable from a browser session.
  for (const fn of ["sa_get_tiktok_token_by_connection(uuid)", "sa_update_tiktok_token_by_connection(uuid, text, timestamptz)"]) {
    ok(`${fn} is revoked from authenticated and anon`,
      MIG.includes(`revoke all on function public.${fn} from public, anon, authenticated`))
    ok(`${fn} is granted only to service_role`,
      MIG.includes(`grant execute on function public.${fn} to service_role`))
  }
}

// ── THE OWNER-SCOPED BACKSTOPS ────────────────────────────────────────────────────────────────
console.log("\nBACKSTOPS — the owner-scoped functions refuse rather than guess:")
{
  const fnBody = (name: string) => {
    const i = MIG.indexOf(`create or replace function public.${name}(`)
    if (i < 0) return ""
    const j = MIG.indexOf("$$;", i)
    return MIG.slice(i, j < 0 ? undefined : j)
  }
  const get = fnBody("sa_get_tiktok_token")
  ok("sa_get_tiktok_token counts the owner's TikTok connections", /select count\(\*\) into v_n/.test(get))
  ok("…returns NOTHING when there is more than one", /if v_n > 1 then\s*\n\s*return;/.test(get))
  ok("…and is deterministic even with one", /order by sc\.created_at/.test(get))
  ok("…the unordered bare `limit 1` is gone", !/\n\s*where sc\.owner_user_id = p_owner and sc\.provider = 'tiktok'\n\s*limit 1;/.test(get))

  const upd = fnBody("sa_update_tiktok_token")
  ok("sa_update_tiktok_token RAISES when ambiguous — a write must never pick",
    /if v_n > 1 then\s*\n\s*raise exception/.test(upd))
  ok("…names the per-connection function to use instead", /sa_update_tiktok_token_by_connection/.test(upd))
  ok("…and writes by id even in the single-account case", /where id = v_conn;/.test(upd))

  const dis = fnBody("sa_disconnect_tiktok")
  ok("sa_disconnect_tiktok RAISES rather than deleting both rows",
    /if v_n > 1 then\s*\n\s*raise exception/.test(dis))
  ok("…and names sa_disconnect_destination, which already does this correctly for one destination",
    /sa_disconnect_destination/.test(dis))
}

// ── WHAT THE MIGRATION MUST NOT DO ────────────────────────────────────────────────────────────
console.log("\nSCOPE OF THE MIGRATION — functions only:")
{
  for (const [what, re] of [
    ["no table, column, index or constraint is touched", /\b(alter table|create table|create (unique )?index|add constraint|drop constraint|drop column|add column)\b/i],
    ["no RLS policy is touched", /\b(create|drop|alter)\s+policy\b/i],
    ["no Instagram function is redefined", /function public\.sa_(connect|disconnect)_instagram|sa_get_instagram_token/i],
    ["no destination-management function is redefined", /create or replace function public\.sa_(pause|resume|disconnect)_destination|sa_update_destination_(label|cadence|markets)/],
    ["no invitation function is redefined", /sa_(create|revoke|validate|consume)_destination_invitation/],
    ["no trigger is created", /create\s+(or replace\s+)?trigger/i],
    ["no post table is referenced at all", /social_posts|social_content/],
  ] as const) {
    ok(what, !re.test(MIG))
  }
  // The migration writes no DATA of its own. The only DML it contains belongs to the two function
  // bodies carried over from the originals — sa_connect_tiktok's upsert and sa_disconnect_tiktok's
  // row delete — and there is exactly one of each, so neither was duplicated or widened.
  eq("exactly one insert into social_connections (sa_connect_tiktok's, carried over)",
    (MIG.match(/insert into public\.social_connections/g) ?? []).length, 1)
  eq("exactly one delete from social_connections (sa_disconnect_tiktok's, behind the new guard)",
    (MIG.match(/delete from public\.social_connections/g) ?? []).length, 1)
  ok("…and that delete is still the owner-scoped one, now unreachable with two accounts",
    /delete from public\.social_connections where owner_user_id = v_uid and provider = 'tiktok';/.test(MIG))
  // String literals stripped first: the file legitimately CONTAINS the word "update" inside
  // '%for update%', which is an assertion about a function body, not a statement.
  const VERIFY = sqlOf(read("supabase/prepared/20261115000003_tiktok_connection_scoped_tokens.verify.sql"))
  const VERIFY_STMTS = VERIFY.replace(/'(?:[^']|'')*'/g, "''")
  ok("the verification writes nothing", !/\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i.test(VERIFY_STMTS))
  ok("…and asserts every TikTok connection still points at a live Vault secret, in BOTH states",
    /join vault\.secrets v on v\.id = sc\.token_secret_id/.test(VERIFY))

  // STRUCTURE, because this migration has not been executed anywhere yet — applying it is the
  // approval gate. A server would catch an unbalanced dollar quote or a missing `end`; until one
  // does, these catch the two ways that goes wrong silently in review.
  const raw = read("supabase/prepared/20261115000003_tiktok_connection_scoped_tokens.sql")
  const defs = raw.match(/create or replace function public\.\w+\(/g) ?? []
  eq("six function definitions, no more", defs.length, 6)
  eq("…and the dollar-quote delimiters are balanced", (raw.match(/\$\$/g) ?? []).length, defs.length * 2)
  eq("…each definition is followed by its own grant or revoke", (raw.match(/\n(grant|revoke) /g) ?? []).length >= defs.length, true)
  for (const name of [
    "sa_get_tiktok_token_by_connection", "sa_update_tiktok_token_by_connection",
    "sa_connect_tiktok", "sa_get_tiktok_token", "sa_update_tiktok_token", "sa_disconnect_tiktok",
  ]) {
    const i = raw.indexOf(`create or replace function public.${name}(`)
    const body = raw.slice(i, raw.indexOf("$$;", i))
    ok(`${name} has a complete body`, i >= 0 && /\bbegin\b/.test(body) && /\bend\b/.test(body)
      && (body.match(/\$\$/g) ?? []).length === 1)
    ok(`${name} pins its search_path`, /set search_path = public/.test(body))
    ok(`${name} is security definer`, /security definer/.test(body))
  }
}

// ── PUBLISHING IDENTITY ───────────────────────────────────────────────────────────────────────
console.log("\nPUBLISHING IDENTITY — every TikTok call speaks as the post's own destination:")
{
  ok("the worker imports the per-connection resolver",
    /getValidTikTokAccessTokenForConnection/.test(WORKER))
  ok("…and no longer imports the owner-level one", !/\bgetValidTikTokAccessToken\b(?!ForConnection)/.test(WORKER))
  // THE REGRESSION THIS FILE EXISTS FOR. A single `token` resolved before the loop and reused for
  // every row is exactly how one brand's video goes out on the other brand's account.
  ok("there is no run-scoped token variable any more",
    !/const token = await getValidTikTokAccessToken\(/.test(WORKER))
  ok("…and no call uses a bare `token.accessToken`", !/[^a-zA-Z]token\.accessToken/.test(WORKER))
  ok("the resolver is memoised per connection for the run", /tokenCache/.test(WORKER))
  ok("a row with no connection_id is refused, not given the owner's token",
    /if \(!connectionId\) return null/.test(WORKER))
  // Every TikTok API call in the due loop must use the post's own token.
  for (const [what, re] of [
    ["Creator Info", /fetchTikTokCreatorInfo\(postTok\.accessToken\)/],
    ["the Direct Post init", /initTikTokDirectPost\(postTok\.accessToken,/],
    ["the post-publish status check", /fetchTikTokPostStatus\(postTok\.accessToken, publishId\)/],
  ] as const) {
    ok(`${what} uses THIS post's destination token`, re.test(WORKER))
  }
  // A publish_id belongs to the account that created it, so the reconcile sweep needs the row's
  // own token too — asking with another account's token reports nothing, or a stranger's post.
  ok("the reconcile sweep selects each row's connection_id",
    /select\("id, external_post_id, connection_id"\)/.test(WORKER))
  ok("…and asks for status with that row's own token",
    /fetchTikTokPostStatus\(rowTok\.accessToken,/.test(WORKER))
  ok("…leaving a row pending rather than guessing when it cannot be resolved",
    /if \(!rowTok\) \{ result\.pending\+\+; continue \}/.test(WORKER))
  // ORDER. Resolved before the claim, so a recoverable condition does not move the post out of
  // 'scheduled' — needs_attention has no route back to publishable.
  const tokAt = WORKER.indexOf("const postTok = await tokenFor(")
  const claimAt = WORKER.indexOf('.update({ status: "publishing"')
  ok("the destination token is resolved BEFORE the publish claim", tokAt > 0 && tokAt < claimAt,
    `token@${tokAt} claim@${claimAt}`)
  // The two outcomes are kept apart, as the Instagram worker keeps paused apart from fault.
  ok("no destination selected → failed with a reason naming what to do",
    /no TikTok publishing destination selected/.test(WORKER) && /result\.noDestinationToken\+\+/.test(WORKER))
  ok("no usable token → left scheduled and counted, so a transient refresh failure retries",
    /result\.destinationTokenUnusable\+\+/.test(WORKER)
    && /left scheduled/.test(read("app/api/cron/social-tiktok-publish/route.ts")))

  // Every gate the worker had is still there — this phase adds one, it replaces none.
  for (const guard of [
    "SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED", "CRON_SECRET", "readAutoPosting", "UNAUDITED",
    'DESTINATIONS[destination].publish !== "supported"', "readSavedSettings",
    "validateAgainstCreatorInfo", "media_publish_claimed_at", "marketRestrictionViolation",
  ]) {
    ok(`the worker still carries its ${guard} guard`, WORKER.includes(guard))
  }
}

console.log("\nPUBLISHING IDENTITY — the request-time routes too:")
{
  const PUB = code(read("app/api/integrations/tiktok/publish/route.ts"))
  const STATUS = code(read("app/api/integrations/tiktok/publish/status/route.ts"))
  const CREATOR = code(read("app/api/integrations/tiktok/creator-info/route.ts"))
  ok("manual publish selects the post's connection_id", /connection_id/.test(PUB))
  // The CLAIM is unchanged — a manual post publishes as the destination the POST belongs to — and
  // it is now stronger: the route also takes an explicit pick for an unassigned post (the manual
  // destination selector) and REFUSES a pick that contradicts an assignment, rather than silently
  // preferring one. The row's assignment still wins wherever it exists.
  ok("…and resolves the token for THAT destination",
    /const assignedConnectionId = \(p as \{ connection_id\?: string \| null \}\)\.connection_id \?\? null/.test(PUB)
    && /getValidTikTokAccessToken\(userId, assignedConnectionId \?\? chosenConnectionId\)/.test(PUB))
  ok("…and a pick that contradicts the post's own assignment is refused",
    /chosenConnectionId !== assignedConnectionId/.test(PUB) && /destination_mismatch/.test(PUB))
  ok("the status check accepts a connectionId", /getValidTikTokAccessToken\(userId, body\.connectionId \?\? null\)/.test(STATUS))
  ok("creator-info accepts a connectionId", /getValidTikTokAccessToken\(userId, connectionId\)/.test(CREATOR))
  ok("…read from the query string", /searchParams\.get\("connectionId"\)/.test(CREATOR))
  // Unchanged for a single account: the second argument is optional and the resolver falls back to
  // the owner's sole TikTok connection, so every one of these behaves exactly as it does today.
  ok("the owner-scoped entry point still takes just an owner id",
    /export async function getValidTikTokAccessToken\(\s*ownerId: string,\s*connectionId\?: string \| null,/.test(SERVER))
  ok("…and refuses rather than picking when the owner has two accounts",
    /const id = connectionId \|\| \(await resolveSoleTikTokConnectionId\(ownerId, client\)\)\s*\n\s*if \(!id\) return null/.test(SERVER))
  ok("…and verifies a caller-supplied id belongs to that owner",
    /if \(!connectionBelongsToOwner\(tok\.ownerUserId, ownerId\)\) return null/.test(SERVER))
  ok("the resolver reads by connection id only", /p_connection_id: connectionId/.test(SERVER))
  ok("…and rotates against the same connection", /sa_update_tiktok_token_by_connection/.test(SERVER))
  ok("…passing the previous bundle so a refresh cannot drop the refresh token",
    /buildTokenBundle\(refreshed, bundle\)/.test(SERVER))
  ok("the server module keeps its server-only guard", /import "server-only"/.test(read("lib/social/tiktokServer.ts")))
  // Comments stripped: the choice module's own header EXPLAINS what the server-only guard is and
  // why it stays in the other file, so the words appear there as prose.
  ok("…and the decisions live in a module that has none, so they are testable",
    !/server-only/.test(code(read("lib/social/tiktokConnectionChoice.ts"))))
}

// ── PAUSE AND DISCONNECT, PER ACCOUNT ─────────────────────────────────────────────────────────
console.log("\nPAUSE — per destination, through the connection-scoped RPCs:")
{
  ok("a TikTok row carries its own pause state", /paused: !!r\.posting_paused/.test(PAGE))
  ok("…and the page selects it", /posting_paused/.test(PAGE))
  ok("the row offers Pause when running", /action: "pause"/.test(UI))
  ok("…and Resume when paused", /action: "resume"/.test(UI))
  // Restated for the owner-grouped cards. The pause is no longer a value the STATUS chip can take
  // — that chip now answers only "can we reach this account" — so it is stated on its own line and
  // cannot be confused with a dead token, which is a stronger form of the original claim.
  ok("the paused state is stated separately from the connection status",
    /CONNECTION_STATUS_LABEL\[state\]/.test(UI) && /t\.paused \? "Paused"/.test(UI))
  ok("…and the status chip cannot say 'Paused' at all",
    !/connected: "Paused"|not_connected: "Paused"|reconnect_needed: "Paused"/.test(CAPS))
  ok("planning excludes a paused destination, so a pause keeps NEW posts off its queue",
    /c\.posting_paused !== true/.test(code(read("lib/social/autopilotPlanRun.ts"))))
  // This read "the TikTok worker does NOT yet enforce it — Phase 2" while Phase 1 was the tip. That
  // was a statement about a moment rather than an invariant, and Phase 2 made it false by doing the
  // work. Replaced by the property Phase 2 established: the worker stops the posts already on a
  // paused destination's queue, which planning cannot reach. Phase 2's own suite owns the detail.
  ok("…and the TikTok worker now stops the posts already queued to a paused one",
    /postTok\.postingPaused/.test(WORKER) && /skippedDestinationPaused/.test(WORKER))
}

console.log("\nDISCONNECT — one account, never both:")
{
  ok("the row disconnects through the connection-scoped backend",
    /const tiktokDisconnect = \(t: TikTokConnection\) => \{[\s\S]{0,400}manage\(t\.id, \{ action: "disconnect" \}\)/.test(UI))
  ok("…and the owner-wide endpoint is no longer called from the UI",
    !/tiktok\/disconnect/.test(UI) && !/TT_DISCONNECT/.test(UI))
  ok("…and the confirmation says the other accounts are unaffected",
    /other accounts are unaffected/.test(read("components/crm/social/PublishingDestinations.tsx")))
  ok("sa_disconnect_destination is the function that does it, and it is ownership-verified",
    /_sa_require_owned_connection/.test(sqlOf(read("supabase/migrations/20260913000002_publishing_destination_authorization.sql"))))
}

// ── THE DASHBOARD ─────────────────────────────────────────────────────────────────────────────
console.log("\nTHE DASHBOARD — N TikTok accounts, not one:")
{
  // .maybeSingle() on two rows returns PGRST116 and no data; the page destructured only `data`, so
  // BOTH accounts vanished and "Connect TikTok directly" was left as the only control.
  ok("the TikTok read is no longer .maybeSingle()",
    !/\.eq\("provider", "tiktok"\)\s*\n\s*\.maybeSingle\(\)/.test(PAGE))
  ok("…it is an ordered list", /\.eq\("provider", "tiktok"\)\s*\n\s*\.order\("created_at", \{ ascending: true \}\)/.test(PAGE))
  ok("…selecting the connection id, so each row can be acted on", /select\("id, username, label, status, posting_paused/.test(PAGE))
  ok("the component takes a list", /tiktok: TikTokConnection\[\]/.test(UI))
  ok("…and renders one row per account, keyed by connection id",
    /accounts\.map\(\(a\) =>/.test(UI) && /tiktokCard\(a as TikTokConnection/.test(UI) && /key: t\.id,/.test(UI))
  ok("the empty state is the empty LIST, not a null row",
    /accounts\.length === 0 && asCards\.length === 0 && emptySlot\(group, platform\)/.test(UI))
  ok("a TikTok row leads with the ACCOUNT, so two rows are distinguishable",
    /name: t\.label \|\| t\.username \|\| t\.ownerName \|\| "TikTok account",/.test(UI))
  ok("…and can be renamed to disambiguate, like the Instagram rows", /setRenamingId\(t\.id\)/.test(UI))
  ok("the market chip still renders on a TikTok row (beb7c81, unchanged)", /marketChip\(t\.marketRestriction\)/.test(UI))
  // The Instagram section is untouched by this phase.
  ok("the Instagram rows still render from the Destination list", /instagramCard\(a as Destination/.test(UI))
  ok("…with both capabilities still reported per account",
    /autoPostingWord\(d\.publishing\)/.test(UI) && /autoReplyWord\(d\.autoReply\)/.test(UI))
  ok("…and the component still decides NEITHER of them itself",
    !/publishingCapability\(|autoReplyCapability\(|accountAutomationGate\(/.test(UI))
}

// ── RELEASE SCOPE ─────────────────────────────────────────────────────────────────────────────
console.log("\nRELEASE SCOPE — Phase 1 only:")
{
  const BASELINE = "beb7c81"
  // The END of Phase 1, not the working tree. Phase 1's scope claim is "between beb7c81 and the
  // account-isolation commit, exactly these files changed, and these others did not move at all" —
  // a claim about a pair of commits, permanently checkable. Diffed against the tree it became a
  // claim about whatever is checked out, so Phase 2 broke it simply by existing. Same pinning
  // militarySpecial and marketRestriction already carry.
  const RELEASE = "abe0b1c"
  const has = (() => {
    try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
  })()
  if (!has) {
    console.log(`  – skipped: ${BASELINE} is not in this clone`)
  } else {
    const lines = (cmd: string) =>
      execSync(cmd, { encoding: "utf8" }).trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const changed = lines(`git diff --name-only ${BASELINE} ${RELEASE} -- . ':!next-env.d.ts'`).sort()
    const APPROVED = [
      // AT THE PATH THEY HAD IN THIS RELEASE — the list is compared against abe0b1c. They were
      // later moved to supabase/prepared/ under a free version, since 20261115000000 was already
      // taken by a prepared Quick Match migration. The reads above follow the current path.
      "supabase/migrations/20261115000000_tiktok_connection_scoped_tokens.sql",
      "supabase/migrations/20261115000000_tiktok_connection_scoped_tokens.verify.sql",
      // The decisions, split out so they are testable at all.
      "lib/social/tiktokConnectionChoice.ts",
      "lib/social/tiktokServer.ts",
      // One additive optional parameter: the previous bundle, so a refresh cannot drop the refresh
      // token. Every existing call site is unchanged.
      "lib/social/tiktok.ts",
      // Publishing identity.
      "app/api/cron/social-tiktok-publish/route.ts",
      "app/api/integrations/tiktok/publish/route.ts",
      "app/api/integrations/tiktok/publish/status/route.ts",
      "app/api/integrations/tiktok/creator-info/route.ts",
      // The dashboard.
      "app/admin/social-autopilot/accounts/page.tsx",
      "components/crm/social/PublishingDestinations.tsx",
      // This file.
      "scripts/social/tiktokAccountIsolation.test.ts",
      // Its diff range pinned to its own release, exactly as militarySpecial's was in beb7c81, so
      // a guard describing the market-restriction release stops breaking on later ones.
      "scripts/social/marketRestriction.test.ts",
      // Two existing guards that describe the one-TikTok-account card and the run-scoped token.
      // Each is RESTATED with its original claim intact — not loosened: the reconnect card still
      // asserts exactly one connect link and exactly one destructive control, and the status fetch
      // assertion now pins the row's OWN token, which is a stronger guarantee than the shared one
      // it replaced.
      "scripts/social/tiktokReconnect.test.ts",
      "scripts/social/tiktokScheduling.test.ts",
    ].sort()
    eq(`exactly the ${APPROVED.length} approved files changed`, changed, APPROVED)

    for (const [label, re] of [
      ["the OAuth connect and callback routes", /tiktok\/(connect|callback)\/|instagram\/(connect|callback)\//],
      ["the destination invitation flow", /destinationInvite|destinations\/invitations/],
      ["the Instagram publish worker", /social-instagram-publish/],
      ["the Instagram helpers", /lib\/social\/(instagram|instagramFinalize)\.ts/],
      ["captions, templates and hashtags", /composePost|hashtags\.ts|overlaySpec|templateFamilies|loadedCopy|commentKeywords/],
      ["the post editor", /PostEditor/],
      ["the planner and the write path", /autopilotPlanner|autopilotWrite|autopilotRotation|autopilotEligibility|postingHistory|recurrence\.ts/],
      ["the market restriction itself", /lib\/social\/marketRestriction\.ts/],
      ["TikTok publishing helpers, gates and saved settings", /tiktokPublish\.ts|tiktokGate|tiktokPublishSettings|tiktokSibling|manualTikTok/],
      ["Quick Match", /lib\/quickMatch\//],
      ["the CRM workspace outside Social Beast", /components\/crm\/(?!social\/)/],
      ["the client-facing pages", /app\/r\/|app\/share|app\/\(site\)/],
      ["the unrelated failing suites", /scripts\/(leads|tests|auth|share|notifications|companion)\//],
    ] as const) {
      ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
    }

    // Shared files must ADD. Each allowance is a named count of lines this phase replaces.
    for (const [f, allowed, why] of [
      ["lib/social/tiktok.ts", 4, "buildTokenBundle's doc line, signature and two body lines"],
      ["lib/social/tiktokServer.ts", 999, "rewritten wholesale — the per-connection resolver replaces the owner-level one"],
      ["app/api/cron/social-tiktok-publish/route.ts", 10, "the import, the result tail, the single token + its guard (4), the reconcile select and its status call, the claim comment anchor"],
      ["app/api/integrations/tiktok/publish/route.ts", 2, "the post select, the token line"],
      ["app/api/integrations/tiktok/publish/status/route.ts", 2, "the body type, the token line"],
      ["app/api/integrations/tiktok/creator-info/route.ts", 3, "the next/server import, the handler signature, the token line"],
      // Sixteen, every one a REPLACEMENT: the TikTok read's comment line, its `const { data: ttRow }`,
      // its select columns and its .maybeSingle() (4); the eleven lines of the single-connection
      // mapping; and the prop passed to the component.
      ["app/admin/social-autopilot/accounts/page.tsx", 16, "the tiktok read (4), the single-connection mapping (11), the prop (1)"],
      ["components/crm/social/PublishingDestinations.tsx", 60, "the single-connection type, props, disconnect handler and the one-row TikTok block, replaced by a list"],
      // Seven: the four-line `changed` expression, the one-line `removed` command, and the two
      // lines of the "normalised through the shared helper" assertion — whose claim is unchanged,
      // only widened to the row variable the TikTok list now uses.
      ["scripts/social/marketRestriction.test.ts", 7, "the diff range (5) and the page assertion's two regex lines"],
      // Seven: the disconnect handler's call shape, the two `!tiktok` branch predicates, the
      // connectedCard slice boundary, and the three lines of the one-link/one-button assertion.
      ["scripts/social/tiktokReconnect.test.ts", 7, "the single-card predicates and the control-count assertion"],
      ["scripts/social/tiktokScheduling.test.ts", 1, "the status fetch's token, now the row's own"],
    ] as const) {
      const removed = lines(`git diff --unified=0 ${BASELINE} ${RELEASE} -- ${f}`)
        .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok(`${f} removes at most the ${allowed} line(s) it replaces (${why})`, removed.length <= allowed,
        `removed ${removed.length}`)
    }

    // Stronger than a diff: the Instagram worker and the planner are byte-identical to beb7c81.
    // Phase 1 is TikTok's token lifecycle and nothing else, and these are where a stray edit would
    // do the most damage.
    for (const f of [
      "app/api/cron/social-instagram-publish/route.ts",
      "lib/social/autopilotPlanner.ts",
      "lib/social/autopilotPlanRun.ts",
      "lib/social/marketRestriction.ts",
      "lib/social/composePost.ts",
      "lib/social/hashtags.ts",
      "lib/social/postingHistory.ts",
    ]) {
      const before = execSync(`git show ${BASELINE}:${f}`, { encoding: "utf8" })
      const after = execSync(`git show ${RELEASE}:${f}`, { encoding: "utf8" })
      ok(`${f} was byte-identical across ${BASELINE}..${RELEASE}`, before === after)
    }
  }
}

console.log(`\nTikTok account isolation: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
