// WHOSE VIDEO, AND WHOSE FIRST VIDEO.
//
// Two features with one discipline: both RESTRICT, so every ambiguous case must resolve towards
// refusing or holding, and neither may change what the operator's existing library does. The
// claims here are therefore in three groups —
//
//   • the three ownership states, and that the two that exist today are untouched;
//   • refusal in BOTH directions, which is the thing the old rule could not express;
//   • the first video as a GATE rather than a priority, including the partial-failure case.
//
// Exercises the pure modules and reads source for the structural claims. Contacts nothing.
// Run: npx tsx scripts/social/personalOwnership.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  personalOwnerOf, isAssignedPersonal, ownershipKindOf, assignedTo,
  personalAssignmentRefusal, marketRestrictionWaived, mayOfferToAgent,
} from "../../lib/social/personalOwnership"
import { renderRefusalFor, REFUSAL_MESSAGE } from "../../lib/social/renderAuthorization"
import { debutStateFor, debutRefusalFor, debutAgentOf, debutMismatch } from "../../lib/social/debutGate"
import { planAutopilot, type AutopilotRule, type PoolPost } from "../../lib/social/autopilotPlanner"
// From the gate module, not siblingAutoCreate — that one is `server-only` and cannot be
// imported here. The gate is where the switch's semantics live precisely so they can be.
import { siblingAutoCreateEnabled, MAX_SIBLINGS_PER_RUN } from "../../lib/social/siblingGate"
import { bufferTikTokEnabled } from "../../lib/social/bufferGate"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `  — ${d}` : ""}`) } }
const read = (p: string) => { try { return readFileSync(path.join(process.cwd(), p), "utf8") } catch { return "" } }
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const sql = (s: string) => s.replace(/^\s*--.*$/gm, "")

const OWN = code(read("lib/social/personalOwnership.ts"))
const DEBUT = code(read("lib/social/debutGate.ts"))
const AUTH = code(read("lib/social/renderAuthorization.ts"))
const PLANNER = code(read("lib/social/autopilotPlanner.ts"))
const PLANRUN = code(read("lib/social/autopilotPlanRun.ts"))
const WORKER = code(read("app/api/cron/social-buffer-publish/route.ts"))
const SERVER = code(read("lib/social/ownershipServer.ts"))
const ID_ROUTE = code(read("app/api/admin/social-autopilot/content/[id]/route.ts"))
const LIST_ROUTE = code(read("app/api/admin/social-autopilot/content/route.ts"))
const CLIENT = code(read("components/crm/social/SocialAutopilotClient.tsx"))
const OWN_SQL = read("supabase/prepared/20261123000000_personal_video_ownership.sql")

const JAY = "c567c077-d3f4-4532-8807-a54795f753f5"
const LIS = "27d7bde4-00f0-433c-b32b-b243623ad20a"
/** Her destination: an EXTERNAL agent connection — agent differs from owner. */
const herIg = { connectionId: "ig-lisette", agent_user_id: LIS, owner_user_id: JAY }
/** His: the shape the live rows actually have, agent self-assigned or absent. */
const hisIg = { connectionId: "ig-jay", agent_user_id: JAY, owner_user_id: JAY }
const hisTikTok = { connectionId: "tt-jay", agent_user_id: null, owner_user_id: JAY }

const general = { availableToAgents: true, personalAgentUserId: null }
const hisPersonal = { availableToAgents: false, personalAgentUserId: null }
const herPersonal = { availableToAgents: false, personalAgentUserId: LIS }

// ── 1. THREE STATES, AND THE TWO THAT EXIST TODAY ARE UNCHANGED ──────────────────────────────
console.log("two columns, three states, and nothing in the library moves:")

ok("general apartment content", ownershipKindOf(general) === "general")
ok("the operator's own personal video — today's meaning of the checkbox",
  ownershipKindOf(hisPersonal) === "operator_personal")
ok("a video assigned to a person", ownershipKindOf(herPersonal) === "assigned_personal")
ok("a row that has never heard of the column reads as the operator's own",
  ownershipKindOf({ availableToAgents: false }) === "operator_personal")
ok("…and a shared one reads as general", ownershipKindOf({ availableToAgents: true }) === "general")
ok("null and undefined are not an assignment",
  !isAssignedPersonal({ availableToAgents: false, personalAgentUserId: null })
  && !isAssignedPersonal({ availableToAgents: false })
  && !isAssignedPersonal(null))
ok("whitespace is not an assignment", !isAssignedPersonal({ personalAgentUserId: "   " }))
ok("the owner is trimmed, so a padded id still matches",
  assignedTo({ personalAgentUserId: ` ${LIS} ` }, LIS))
ok("an unassigned row is 'assigned to' nobody, including the operator",
  !assignedTo(hisPersonal, JAY) && !assignedTo(general, JAY))
ok("personalOwnerOf names the person", personalOwnerOf(herPersonal) === LIS)

// ── 2. REFUSED IN BOTH DIRECTIONS — WHAT THE OLD RULE COULD NOT DO ───────────────────────────
// The existing rule only fires at an EXTERNAL agent's destination, so the operator's own accounts
// were never asked. An assigned video has to be refused at his accounts too, which is why the new
// predicate sits outside that branch.
console.log("\nan assigned video reaches that person's accounts and nobody else's:")

ok("her video is refused on HIS Instagram",
  personalAssignmentRefusal(herPersonal, hisIg) === "personal_other_agent")
ok("her video is refused on HIS TikTok, whose agent column is null",
  personalAssignmentRefusal(herPersonal, hisTikTok) === "personal_other_agent")
ok("her video is allowed on HER Instagram",
  personalAssignmentRefusal(herPersonal, herIg) === null)
ok("an unassigned row is never refused by this rule, at either destination",
  personalAssignmentRefusal(hisPersonal, herIg) === null
  && personalAssignmentRefusal(general, hisIg) === null)
ok("a post with no destination has no question to answer",
  personalAssignmentRefusal(herPersonal, { connectionId: null, agent_user_id: LIS, owner_user_id: JAY }) === null)

console.log("\n…and renderRefusalFor says the same through the shared gate:")
const refusalFor = (source: Record<string, unknown>, destination: Record<string, unknown>) =>
  renderRefusalFor({
    render: { identityState: "clean", identityOwnerUserId: null },
    source: source as never,
    destination: destination as never,
  })
ok("her personal video on his account is refused by name",
  refusalFor(herPersonal, hisIg) === "personal_other_agent")
ok("…with a message that does not leak whose it is",
  !/lisette/i.test(REFUSAL_MESSAGE.personal_other_agent)
  && /another account/.test(REFUSAL_MESSAGE.personal_other_agent))
ok("her personal video on HER account is allowed",
  refusalFor(herPersonal, herIg) === null)
// THE TRAP THIS CLOSES. An assigned personal video carries available_to_agents = false, and the
// external-agent branch reads a false there as "Personal — Only Me, keep it off agents'
// accounts". Correct for the operator's own; fatal for one that names this very agent.
ok("the sharing check is skipped for a video that belongs to THIS agent",
  refusalFor(herPersonal, herIg) !== "personal_video")
ok("…and still fires for the operator's own personal video at an agent's account",
  refusalFor(hisPersonal, herIg) === "personal_video")
ok("…and general content still reaches an agent",
  refusalFor(general, herIg) === null)
ok("an uncertified render is still refused at an agent's account, assignment or not",
  renderRefusalFor({
    render: { identityState: null, identityOwnerUserId: null },
    source: herPersonal as never, destination: herIg as never,
  }) === "identity_not_certified")
ok("the assignment check sits BEFORE the external-agent branch in source order",
  AUTH.indexOf("personalAssignmentRefusal(source, destination)") < AUTH.indexOf("isExternalAgentConnection(destination)"))

// ── 3. THE MARKET WAIVER IS AS NARROW AS IT CLAIMS ───────────────────────────────────────────
console.log("\nthe market restriction is waived only for this person's own video:")

ok("waived for her video at her destination", marketRestrictionWaived(herPersonal, herIg))
ok("NOT waived for general content", !marketRestrictionWaived(general, herIg))
ok("NOT waived for the operator's own personal video", !marketRestrictionWaived(hisPersonal, herIg))
ok("NOT waived for her video at his destination", !marketRestrictionWaived(herPersonal, hisIg))
ok("NOT waived when the post has no destination",
  !marketRestrictionWaived(herPersonal, { connectionId: null, agent_user_id: LIS, owner_user_id: JAY }))
ok("the module waives the MARKET only — it names no other gate",
  !/approved|render_status|posting_paused|auto_posting/.test(OWN))
ok("mayOfferToAgent is the planner's form of the same rule",
  mayOfferToAgent(general, JAY) && mayOfferToAgent(herPersonal, LIS) && !mayOfferToAgent(herPersonal, JAY))

// ── 4. THE PLANNER HONOURS BOTH, AGAINST THE REAL PLANNER ────────────────────────────────────
console.log("\nher personal video survives her market restriction and reaches no other queue:")

const poolPost = (o: Partial<PoolPost> & { id: string; sourceContentId: string }): PoolPost => ({
  placeId: `place-${o.sourceContentId}`, market: "San Antonio", propertyName: `Prop ${o.sourceContentId}`,
  status: "ready", renderStatus: "ready", renderedStoragePath: `renders/${o.id}.mp4`,
  scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
  platform: "instagram", destination: "instagram_reel",
  approvedAt: "2026-11-01T00:00:00.000Z", followsPostId: null,
  identityState: "clean", identityOwnerUserId: null, availableToAgents: true,
  personalAgentUserId: null, ...o,
})
const rule = (o: Partial<AutopilotRule> & { connectionId: string }): AutopilotRule => ({
  platform: "instagram", enabled: true, timezone: "America/Chicago",
  dailyTimes: [450, 1170], postsPerDay: 2, marketWeights: {},
  allowedMarkets: null, marketRotationSeed: 0, staggerOffsetMinutes: 0, startIndex: 0,
  agentUserId: null, ownerUserId: JAY, ...o,
})
const wallClockToUtc = (dateKey: string, minute: number) =>
  new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + minute * 60_000 + 6 * 3_600_000).toISOString()

// Her personal video: no market at all, which a restricted destination would normally refuse.
const herVideo = poolPost({
  id: "p-her", sourceContentId: "c-her", market: null, propertyName: null, placeId: null,
  availableToAgents: false, personalAgentUserId: LIS,
})
const saVideo = poolPost({ id: "p-sa", sourceContentId: "c-sa", market: "San Antonio" })
const dallasVideo = poolPost({ id: "p-dal", sourceContentId: "c-dal", market: "Dallas" })

const herPlan = planAutopilot({
  rules: [rule({ connectionId: "ig-lisette", agentUserId: LIS, allowedMarkets: ["San Antonio", "Austin"] })],
  pool: [herVideo, saVideo, dallasVideo],
  startDateKey: "2026-11-24", wallClockToUtc, maxDays: 1,
})
const herIds = herPlan.planned.map((p) => p.postId)
ok("her personal video IS scheduled although it carries no market", herIds.includes("p-her"), herIds.join(","))
ok("San Antonio is still scheduled", herIds.includes("p-sa"))
ok("Dallas is NOT — the restriction is intact", !herIds.includes("p-dal"))
ok("…and the planner reports no restriction violation",
  herPlan.inventory.marketRestrictionViolations === 0)

const hisPlan = planAutopilot({
  rules: [rule({ connectionId: "ig-jay" })],   // unrestricted, the operator's own
  pool: [herVideo, saVideo, dallasVideo],
  startDateKey: "2026-11-24", wallClockToUtc, maxDays: 1,
})
const hisIds = hisPlan.planned.map((p) => p.postId)
ok("HER video never enters his queue, although his destination is unrestricted",
  !hisIds.includes("p-her"), hisIds.join(","))
ok("…and his own queue is otherwise full", hisIds.includes("p-sa") && hisIds.includes("p-dal"))
ok("the planner's waiver asks the same primitive the publishers ask",
  /assignedTo\(p, ruleAgent\)/.test(PLANNER))
ok("the ownership column is read into the pool",
  /personalAgentUserId: \(src\?\.personal_agent_user_id/.test(PLANRUN))
ok("…and an unreadable column is SAID, not shrugged off",
  /is not readable[\s\S]{0,200}not being enforced/.test(read("lib/social/autopilotPlanRun.ts")))
ok("the pool select falls back rather than returning nothing",
  /POOL_SELECT_WITH_OWNERSHIP/.test(PLANRUN) && /poolQuery\(POOL_SELECT\)/.test(PLANRUN))

// ── 5. THE FIRST VIDEO IS A GATE, NOT A PRIORITY ─────────────────────────────────────────────
console.log("\nthe first video: satisfied only when it has published everywhere:")

const both = ["ig-lisette", "tt-lisette"]
const none = debutStateFor({ contentId: "c-her", destinationConnectionIds: both, publishedConnectionIds: [] })
const half = debutStateFor({ contentId: "c-her", destinationConnectionIds: both, publishedConnectionIds: ["ig-lisette"] })
const done = debutStateFor({ contentId: "c-her", destinationConnectionIds: both, publishedConnectionIds: both })

ok("no designation ⇒ no requirement",
  debutStateFor({ contentId: null, destinationConnectionIds: both, publishedConnectionIds: [] }).required === false)
ok("published nowhere ⇒ not satisfied", none.required && !none.satisfied)
ok("published on ONE of two ⇒ still not satisfied", half.required && !half.satisfied, JSON.stringify(half))
ok("…and it names the one still waiting", half.required && half.pending.join() === "tt-lisette")
ok("…and the one that is done", half.required && half.publishedOn.join() === "ig-lisette")
ok("published on both ⇒ satisfied", done.required && done.satisfied)
ok("NO destinations at all ⇒ not satisfied, never a free pass",
  (() => { const s = debutStateFor({ contentId: "c-her", destinationConnectionIds: [], publishedConnectionIds: [] }); return s.required && !s.satisfied })())
ok("a paused destination still counts — the module says why",
  /A paused destination is deliberately still counted/.test(read("lib/social/debutGate.ts")))

console.log("\n…and nothing else may publish until then:")
ok("the debut itself is allowed", debutRefusalFor(none, "c-her") === null)
ok("regular content is held", debutRefusalFor(none, "c-apartment") === "debut_pending")
ok("ONE PLATFORM FAILING STILL HOLDS THE REST — the partial-failure requirement",
  debutRefusalFor(half, "c-apartment") === "debut_pending")
ok("…and the debut may still be retried on the platform that failed",
  debutRefusalFor(half, "c-her") === null)
ok("once satisfied, everything is released", debutRefusalFor(done, "c-apartment") === null)
ok("no requirement releases everything", debutRefusalFor({ required: false }, "c-apartment") === null)
ok("a post with no source content is held while a debut is outstanding",
  debutRefusalFor(none, null) === "debut_pending")
ok("the gate reads nothing about publishing outcomes beyond 'published'",
  !/error_message|needs_attention|publish_attempted/.test(DEBUT))
ok("nothing in the gate times out or releases itself",
  !/setTimeout|Date\.now|hours|expires/.test(DEBUT))
ok("the only override is the operator clearing the column, and the module says so",
  /clear(s|ing)[\s\S]{0,100}debut_for_agent_user_id/.test(read("lib/social/debutGate.ts")))

console.log("\n…and the two designations must name the same person:")
ok("a video reserved for her cannot be his first video",
  debutMismatch({ personalAgentUserId: LIS, debutForAgentUserId: JAY }) === "debut_for_another_person")
ok("hers can be hers", debutMismatch({ personalAgentUserId: LIS, debutForAgentUserId: LIS }) === null)
ok("an UNASSIGNED video may be anyone's first video",
  debutMismatch({ personalAgentUserId: null, debutForAgentUserId: LIS }) === null)
ok("no debut ⇒ nothing to disagree about", debutMismatch({ personalAgentUserId: LIS }) === null)
ok("debutAgentOf trims", debutAgentOf({ debutForAgentUserId: ` ${LIS} ` }) === LIS)

// ── 6. BOTH READS FAIL CLOSED ────────────────────────────────────────────────────────────────
// This is the whole discipline: both features RESTRICT, so "could not read" must never resolve to
// "nothing restricts this".
console.log("\nan unreadable restriction holds, it does not release:")

ok("the reader is a discriminated union with no nullable fallback",
  /ok: false; kind: "unreadable"/.test(SERVER) && !/\?\? null\s*$/m.test(SERVER))
ok("a MISSING content row is unreadable, not unrestricted",
  /if \(!data\) return \{ ok: false, kind: "unreadable"/.test(SERVER))
ok("every one of the debut reader's three reads can report unreadable",
  (SERVER.match(/return \{ ok: false, kind: "unreadable"/g) ?? []).length >= 4)
ok("the worker HOLDS on an unreadable ownership read — nothing claimed, nothing failed",
  /if \(!owned\.ok\) \{[\s\S]{0,160}skippedOwnershipUnreadable\+\+[\s\S]{0,40}continue/.test(WORKER))
ok("…and on an unreadable debut read",
  /if \(!debut\.ok\) \{[\s\S]{0,160}skippedOwnershipUnreadable\+\+[\s\S]{0,40}continue/.test(WORKER))
ok("the planner HOLDS when it cannot see where the debut published",
  /the hold stays on/.test(read("lib/social/autopilotPlanRun.ts")))
ok("unreadable answers are not cached, so one hiccup does not hold a whole run",
  /if \(fresh\.ok\) hits\.set/.test(SERVER))
ok("the caches are per-run, never module state",
  /export function contentOwnershipCache/.test(SERVER) && !/^const hits = /m.test(SERVER))

// ── 7. THE WORKER: HELD vs FAILED, AND KEYED ON THE POST ─────────────────────────────────────
console.log("\nthe worker holds what will resolve and fails what will not:")

ok("the first-video hold leaves the row scheduled",
  /if \(debutRefusalFor\(debut\.state, sourceContentId\)\) \{[\s\S]{0,120}heldForFirstVideo\+\+[\s\S]{0,40}continue/.test(WORKER))
ok("…and never marks it failed",
  !/heldForFirstVideo[\s\S]{0,80}markFailed/.test(WORKER))
ok("a video on the wrong person's account IS failed — it needs a human to move it",
  /identityRefusal === "personal_other_agent"[\s\S]{0,80}blockedByPersonalOwnership\+\+/.test(WORKER))
ok("the ownership read happens BEFORE the market check, because the market answer depends on it",
  WORKER.indexOf("ownerships.get(sourceContentId)") < WORKER.indexOf("marketRestrictionWaived("))
ok("both market checks honour the same waiver",
  (WORKER.match(/marketWaived \? null : marketRestrictionViolation/g) ?? []).length === 2)
ok("the waiver is computed from the ownership object, not carried as a flag between the two",
  /const marketWaived = marketRestrictionWaived\(ownership, destinationIdentity\)/.test(WORKER))
ok("renderRefusalFor is given the assignment from that same read",
  /personalAgentUserId: ownership\.personalAgentUserId/.test(WORKER))
ok("…rather than from the due select's join, so the two cannot disagree",
  !/rowSrc\?\.personal_agent_user_id/.test(WORKER))
ok("the run reports the two new conditions separately",
  /heldForFirstVideo: 0/.test(WORKER) && /blockedByPersonalOwnership: 0/.test(WORKER)
  && /marketWaivedForPersonal: 0/.test(WORKER))

// ── 8. THE TIKTOK ROUTE AND THE SIBLING ARE BOTH SWITCHED OFF ────────────────────────────────
console.log("\nnothing new is armed:")

ok("TikTok through Buffer is off unless its own variable is set",
  !bufferTikTokEnabled({} as NodeJS.ProcessEnv)
  && !bufferTikTokEnabled({ SOCIAL_BUFFER_TIKTOK_ENABLED: "yes" } as never)
  && !bufferTikTokEnabled({ SOCIAL_BUFFER_TIKTOK_ENABLED: "TRUE" } as never)
  && bufferTikTokEnabled({ SOCIAL_BUFFER_TIKTOK_ENABLED: "true" } as never))
ok("automatic sibling creation is off unless its own variable is set",
  !siblingAutoCreateEnabled({} as NodeJS.ProcessEnv)
  && !siblingAutoCreateEnabled({ SOCIAL_TIKTOK_SIBLING_AUTOCREATE: "1" } as never)
  && siblingAutoCreateEnabled({ SOCIAL_TIKTOK_SIBLING_AUTOCREATE: "true" } as never))
ok("…and it is capped, so a long plan cannot fan out", MAX_SIBLINGS_PER_RUN <= 6)
// THE BUFFER CRON IS NOW SCHEDULED, at the operator's request, so "no cron" has stopped being the
// thing that holds this feature. What holds it is the two switches above plus the arm switch, none
// of which is set — and the two columns this file's ownership rules depend on, which do not exist
// in production yet. A cron that ticks against an unarmed worker reads nothing and writes nothing.
ok("the Buffer cron exists, so the switches above are what hold this feature",
  /social-buffer-publish/.test(read("vercel.json")))
// The columns were APPLIED on 23 Nov 2026 as part of the approved launch release. What the next
// reader needs asserted is no longer "nothing has been applied" but that applying them changed no
// existing behaviour: both are NULL on every pre-existing row, so available_to_agents still decides
// alone until a video is explicitly assigned to somebody.
ok("…and the ownership migration records that it IS applied, with a date",
  /^-- APPLIED \d{1,2} \w+ 20\d\d/m.test(read("supabase/prepared/20261123000000_personal_video_ownership.sql")),
  "an applied file that still claims to be staged is a lie the next reader will act on")
ok("…and it says the new columns are NULL on every pre-existing row",
  /NULL on every pre-existing row/.test(read("supabase/prepared/20261123000000_personal_video_ownership.sql")))
ok("the plan run reports what the queue is waiting for even while creation is off",
  /automatic creation is off \(SOCIAL_TIKTOK_SIBLING_AUTOCREATE\)/.test(read("lib/social/siblingAutoCreate.ts")))

// ── 9. THE SQL IS STAGED, AND WRITES NO ROWS ─────────────────────────────────────────────────
console.log("\nthe schema change is staged and writes nothing:")

ok("marked APPLIED, with a date", /^-- APPLIED \d{1,2} \w+ 20\d\d/m.test(OWN_SQL))
ok("staged, not a migration",
  read("supabase/migrations/20261123000000_personal_video_ownership.sql") === "")
ok("both columns are nullable with no default",
  /personal_agent_user_id uuid\n\s+references/.test(OWN_SQL) && /debut_for_agent_user_id uuid\n\s+references/.test(OWN_SQL))
ok("NO row is written — no update, no insert, no backfill anywhere in the file",
  !/\b(update|insert into|delete from)\b/i.test(sql(OWN_SQL)))
ok("the two columns are constrained to name the same person",
  /debut_for_agent_user_id = personal_agent_user_id/.test(sql(OWN_SQL)))
ok("…and an unassigned video may still be a debut",
  /personal_agent_user_id is null\n\s+or debut/.test(sql(OWN_SQL)))
ok("at most one debut per person, enforced by the database",
  /unique index[\s\S]{0,120}\(debut_for_agent_user_id\)/.test(sql(OWN_SQL)))
ok("deleting a user does not delete their videos",
  (sql(OWN_SQL).match(/on delete set null/g) ?? []).length === 2)
ok("the file states why there is no backfill",
  /NO BACKFILL/.test(OWN_SQL) && /which is precisely what `null` already means/.test(OWN_SQL))

// ── 10. THE INTERFACE ────────────────────────────────────────────────────────────────────────
console.log("\nwhat the upload interface does with it:")

ok("the list route tries the ownership columns and falls back",
  /OWNERSHIP_COLUMNS/.test(LIST_ROUTE) && /ownershipReadable = false/.test(LIST_ROUTE))
ok("…and SAYS which it got, rather than letting the client guess",
  /ownershipReadable,/.test(LIST_ROUTE))
ok("the assignable roster is the same one the Accounts page uses",
  /loadAgentRoster\(supabase, null\)/.test(LIST_ROUTE))
ok("…and only people who actually hold destinations are offered",
  /connectionIds\.length > 0/.test(LIST_ROUTE))
ok("the PATCH route validates the target against that roster, not against a uuid shape alone",
  /no connected destinations to assign a video to/.test(read("app/api/admin/social-autopilot/content/[id]/route.ts")))
ok("assigning somebody implies Personal, written by the server",
  /if \(owner !== null\) patch\.available_to_agents = false/.test(ID_ROUTE))
ok("an incoherent pair is refused with a sentence, not a constraint name",
  /could never publish there/.test(read("app/api/admin/social-autopilot/content/[id]/route.ts")))
ok("an assigned video gets NO generated apartment overlay by default",
  /if \(owner !== null && !\("overlayMode" in body\)\) patch\.overlay_mode = "existing"/.test(ID_ROUTE))
ok("…unless the same call names one explicitly",
  /!\("overlayMode" in body\)/.test(ID_ROUTE))
ok("the new columns are written ONLY when the request names them",
  /const wantsOwner = "personalAgentUserId" in body/.test(ID_ROUTE)
  && /if \(wantsOwner \|\| wantsDebut\) \{/.test(ID_ROUTE))
ok("the picker is hidden when there is nobody to assign to",
  /c\.raw\?\.personal && agents\.length > 0 &&/.test(CLIENT))
ok("'Only me' is an option, so today's state is reachable in one click",
  /<option value="">Only me<\/option>/.test(CLIENT))
ok("the first-video toggle appears only once the video belongs to somebody",
  /c\.raw\.personalAgentUserId && \(/.test(CLIENT))
ok("un-checking Personal clears the assignment",
  /personal \|\| agents\.length === 0 \? \{ personal \} : \{ personal, personalAgentUserId: null \}/.test(CLIENT))
ok("…and sends today's exact body when there is no roster",
  /agents\.length === 0 \? \{ personal \}/.test(CLIENT))

console.log(`\nPersonal ownership and the first video: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
