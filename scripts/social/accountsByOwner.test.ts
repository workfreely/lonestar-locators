// THE ACCOUNTS PAGE, GROUPED BY OWNER.
//
// The page was a list of Instagram rows, a list of TikTok rows, and a third list of pending
// invitations at the bottom — so the only way to learn an invitation belonged to an agent was to
// read its label and remember. Accounts now sit under their owner, inside their platform, and an
// invitation sits under the person it was sent to.
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────────────────────
// A reorganisation of a screen is exactly the kind of change that quietly alters behaviour: a
// control moves, its handler is rewritten by hand, and a payload changes with it. So the claims
// here are mostly NEGATIVE — the same endpoints, the same request bodies, the same confirmations,
// no new writes, and no rule re-decided in the component. The visual grouping is asserted too,
// but it is the smaller half.
//
// Reads source only. Contacts nothing.
// Run: npx tsx scripts/social/accountsByOwner.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  connectionStatus,
  CONNECTION_STATUS_LABEL,
  autoPostingWord,
  autoReplyWord,
  publishingCapability,
  autoReplyCapability,
} from "../../lib/social/accountCapabilities"
import { accountAutomationGate } from "../../lib/social/commentSafety"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `  — ${d}` : ""}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
/** Comments stripped, so prose can never satisfy an assertion. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const UI_RAW = read("components/crm/social/PublishingDestinations.tsx")
const UI = code(UI_RAW)
const PAGE = code(read("app/admin/social-autopilot/accounts/page.tsx"))

// ── 1. THE THREE STATUSES ─────────────────────────────────────────────────────────────────────
// The old pill mixed connection health with posting state, so a healthy account whose posting was
// paused and an account whose token had died both wore a non-green pill. The chip now answers one
// question; everything that can be switched off has its own line.
console.log("the status chip answers one question, and only one:")

ok("there are exactly three statuses", Object.keys(CONNECTION_STATUS_LABEL).length === 3)
ok("…and none of them is a posting state",
  !Object.values(CONNECTION_STATUS_LABEL).some((l) => /paus|off|on\b|blocked/i.test(l)),
  JSON.stringify(Object.values(CONNECTION_STATUS_LABEL)))
ok("a healthy connection reads Connected even when its posting is paused",
  connectionStatus({ status: "connected", expired: false }) === "connected")
ok("an expired token reads Reconnect Needed", connectionStatus({ status: "connected", expired: true }) === "reconnect_needed")
ok("…and so does a connection in error", connectionStatus({ status: "error", expired: false }) === "reconnect_needed")

// ── 2. THE CARD REPORTS, IT DOES NOT DECIDE ───────────────────────────────────────────────────
// publishingCapability and accountAutomationGate are the authorities. The card's shorter words are
// a translation of their verdict; a second opinion computed in the component is how the page and
// the worker came to disagree once already.
console.log("\nthe three facts come from the existing authorities:")

const paused = publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: false, autoPosting: "paused" })
const live = publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: false, autoPosting: "on" })
const dead = publishingCapability({ connectionStatus: "error", expired: false, destinationPaused: false, autoPosting: "on" })
ok("the master switch being paused reads Paused, not On", autoPostingWord(paused) === "Paused")
ok("a per-account pause also reads Paused",
  autoPostingWord(publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: true, autoPosting: "on" })) === "Paused")
ok("an unreadable master switch fails closed, to Paused",
  autoPostingWord(publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: false, autoPosting: "on", autoPostingUnreadable: true })) === "Paused")
ok("only a genuinely live account reads On", autoPostingWord(live) === "On")
ok("a broken connection reads Blocked, never On or Paused", autoPostingWord(dead) === "Blocked")

const gateOn = accountAutomationGate({ settingsReadOk: true, globalEnabled: true, accountEnabled: true, activatedAt: "2026-10-18T00:00:00Z", permissionsOk: true })
const gateOff = accountAutomationGate({ settingsReadOk: true, globalEnabled: false, accountEnabled: false, activatedAt: null, permissionsOk: true })
const gateNoScope = accountAutomationGate({ settingsReadOk: true, globalEnabled: true, accountEnabled: true, activatedAt: "2026-10-18T00:00:00Z", permissionsOk: false })
ok("auto reply enabled reads On", autoReplyWord(autoReplyCapability(gateOn)) === "On")
ok("…switched off reads Off", autoReplyWord(autoReplyCapability(gateOff)) === "Off")
ok("…a missing permission says so rather than Off", autoReplyWord(autoReplyCapability(gateNoScope)) === "Permission needed")
ok("…and unresolved work is surfaced even while the switches are on",
  autoReplyWord(autoReplyCapability(gateOn, { unresolvedActions: 2, danglingClaims: 0 })) === "Needs attention")

ok("the component re-derives NEITHER capability",
  !/publishingCapability\(|autoReplyCapability\(|accountAutomationGate\(/.test(UI))
ok("…and the page still computes both server-side",
  /publishing: publishingCapability\(\{/.test(PAGE) && /autoReply: autoReplyCapability\(gate/.test(PAGE))

// ── 3. THE GROUPING IS DERIVED, NOT CONFIGURED ────────────────────────────────────────────────
// An owner appears because a connection or an invitation names them — the same relationship
// loadAgentRoster is built from. Nothing has to be registered for a new agent to get a band.
console.log("\ngrouping comes from relationships that already exist:")

ok("groups are built from the rows already loaded, with no extra query",
  /const groupFor = \(agentUserId: string \| null\): OwnerGroup/.test(PAGE))
ok("…from connections, TikTok connections AND invitations",
  /for \(const d of destinations\)/.test(PAGE) && /for \(const t of tiktoks\)/.test(PAGE) && /for \(const i of pendingInvites\)/.test(PAGE))
// A null agent_user_id is the OWNER's own account, which is what the live TikTok row carries and
// what an invitation created without choosing an agent carries. Treating it as "no agent" would
// strand both in a bucket nobody looks in.
ok("a NULL agent is the owner's own, not a bucket of its own",
  /!agentUserId \|\| \(me && agentUserId === me\.id\) \? OWNER_KEY : agentUserId/.test(PAGE))
ok("My Accounts sorts before Team Accounts",
  /a\.kind === "mine" \? -1 : 1/.test(PAGE))
ok("…and the team sorts by name, so the page does not reshuffle itself",
  /a\.name\.localeCompare\(b\.name\)/.test(PAGE))
ok("the owner always has a band, even with nothing in it", /groupFor\(null\)/.test(PAGE))
// Unfiltered, an empty team band is the slot that agent's next account goes in. Under a
// selected-agent filter it is noise: the operator asked to see one agent.
ok("an empty band survives unfiltered but is dropped under an agent filter",
  /const visibleGroups = selectedAgent\s*\n?\s*\? groups\.filter\(\(g\) => g\.instagram\.length \+ g\.tiktok\.length \+ g\.invites\.length > 0\)\s*\n?\s*: groups/.test(PAGE))
ok("the bands are labelled exactly My Accounts and Team Accounts",
  /\{group\.kind === "mine" \? "My Accounts" : "Team Accounts"\}/.test(UI))
// OWNER FIRST. This used to be a section per platform with an owner band inside each, so one
// person appeared twice on the page and reading their accounts meant looking in two places. Whose
// account it is is what the operator sorts by; the platform is a property of the account.
//
// The guarantee is unchanged and still asserted: every owner renders BOTH platform blocks, so an
// owner cannot be present on one platform and silently missing from the other.
ok("the page renders one section per owner, not one per platform",
  /groups\.map\(\(group\) => ownerSection\(group\)\)/.test(UI) && !/platformSection\(/.test(UI))
ok("…and every owner section renders BOTH platforms, so none can be missing from one",
  /platformBlock\(group, "instagram"\)/.test(UI) && /platformBlock\(group, "tiktok"\)/.test(UI))
ok("…with the owner band as the section's own heading",
  /\{ownerBand\(group, countsFor\(group\.instagram\.length \+ group\.tiktok\.length, group\.invites\.length\)\)\}/.test(UI))

// ── 4. INVITATIONS SIT UNDER THEIR PERSON ─────────────────────────────────────────────────────
console.log("\nan invitation is shown with the person it was sent to:")

// DECIDED PER INVITATION, not by counting. Counting was wrong as soon as an owner had one account
// and a link for a DIFFERENT one: every invitation became a strip, so the second account had no
// row and no status at all. A link naming an account already in the band is a spare link for it;
// a link naming anything else is an account that does not exist yet.
ok("a link naming an existing account is a strip beneath it",
  /const asStrips = invites\.filter\(isSpareLinkFor\)/.test(UI)
    && /return l\.length > 0 && named\.has\(l\)/.test(UI))
ok("…and a link naming anything else becomes its own card",
  /const asCards = invites\.filter\(\(inv\) => !isSpareLinkFor\(inv\)\)/.test(UI))
ok("…matched against the account's label, agent name AND handle",
  /accounts\.flatMap\(\(a\) => \[a\.label, "agentName" in a \? a\.agentName : null, a\.username\]\)/.test(UI))
// An owner's OWN unconnected account should be signed in to, not sent a link to themselves — and
// direct sign-in is the only route that can grant comment access.
ok("an unconnected account of your own offers direct sign-in first",
  /group\.kind === "mine" && \(\s*\n?\s*<a href=\{CONNECT\}/.test(UI))
ok("that card reads Not Connected", /status: "not_connected"/.test(UI))
ok("there is no separate Pending Invitations section any more",
  !/Pending Invitations/.test(UI_RAW))
// The raw token is shown once at creation and only a hash is stored, so there is nothing to copy
// later. Offering a Copy button for an existing invitation would be offering something impossible.
ok("the only link action is to create a NEW one",
  /Create New Link/.test(UI) && !/Copy invitation link/.test(UI_RAW))
ok("…which revokes the old link before minting one",
  /const rev = await fetch\(`\$\{INVITES\}\/\$\{inv\.id\}\/revoke`, \{ method: "POST" \}\)[\s\S]{0,120}if \(!rev\.ok\) return/.test(UI))
ok("invitations are Instagram-only, as the authorize flow is",
  /const invites = isIg \? group\.invites : \[\]/.test(UI))

// ── 5. THE ADD BUTTONS LIVE IN THE SECTIONS, BOTH ROUTES INTACT ───────────────────────────────
// The two Instagram routes are NOT interchangeable: the invitation flow requests INSTAGRAM_SCOPES,
// which does not include instagram_business_manage_comments and cannot, so an account added by
// link can publish but can never auto-reply. Merging the buttons without stating that would
// quietly cost the operator Auto Reply.
//
// The header's "+ Add Account" is gone with this release. It opened the sheet on a question the
// click could not have answered — which platform — while each section's own button already names
// the platform AND the owner. Its removal is asserted rather than assumed, because a second
// control that reappears here is exactly the redundancy that was cleaned up.
console.log("\nper-platform Add buttons, with the difference stated:")

ok("the redundant top-level Add Account control is gone", !/\+ Add Account/.test(UI))
ok("…and each section's own button still names its platform",
  /\+ Add \{group\.kind === "team"[\s\S]{0,160}platform === "tiktok" \? "TikTok" : "Instagram"\}/.test(UI))
// THE POINT OF THE CHANGE. The sheet used to render once at the top of the page for every
// platform, so "+ Add TikTok" at the foot of the TikTok section answered somewhere off screen.
ok("…the sheet opens inside the section whose button opened it, never once at the top",
  /adding && addPlatform === platform &&/.test(UI) && !/\{adding && addSheet\}/.test(UI))
ok("…and is scrolled into view without yanking a sheet already on screen",
  /scrollIntoView\(\{ behavior: "smooth", block: "nearest" \}\)/.test(UI))
// A null platform belonged to no section, so it could not have rendered the sheet anywhere. The
// signature forbids it rather than the layout tolerating it.
ok("…and the platform can no longer be absent when the flow opens",
  /const openAdd = \(platform: Platform,/.test(UI))
// Removed with the header button: prose the sections now say for themselves, per owner.
ok("the top-level explanatory sentence is gone", !/Accounts you publish to, grouped by owner/.test(UI_RAW))
// Against the comment-stripped source: the header explains what the three used to be, and prose
// must never be able to fail an assertion about what the screen renders.
ok("…and the three old ones are gone",
  !/\+ Add Publishing Destination/.test(UI) && !/>Connect My Instagram</.test(UI) && !/>Connect My TikTok</.test(UI))
ok("the sheet still offers the self-authorized route", /setAddRoute\("self"\)/.test(UI))
ok("…and the invitation route", /setAddRoute\("invite"\)/.test(UI))
ok("…and says which one grants comment management",
  /The only route that can grant comment/.test(UI_RAW))
ok("…and that the link route cannot", /Auto Reply cannot be granted this way/.test(UI_RAW))
ok("TikTok is offered as direct sign-in, because it has no invitation flow",
  /TikTok has no invitation link/.test(UI_RAW))

// ── 6. EVERY ACTION IS THE ONE THAT WAS HERE BEFORE ───────────────────────────────────────────
// The reorganisation moved controls. It must not have changed what any of them does.
console.log("\nthe endpoints, payloads and confirmations are unchanged:")

for (const [what, needle] of [
  ["the connection-scoped manage endpoint", 'const MANAGE = "/api/admin/social-autopilot/destinations/manage"'],
  ["the invitations endpoint", 'const INVITES = "/api/admin/social-autopilot/destinations/invitations"'],
  ["the Instagram connect endpoint", 'const CONNECT = "/api/admin/social-autopilot/accounts/instagram/connect"'],
  ["the TikTok connect endpoint", 'const TT_CONNECT = "/api/integrations/tiktok/connect"'],
  ["the Comments page link", 'const COMMENTS_PAGE = "/admin/social-autopilot/comments"'],
] as const) {
  ok(`${what} is unchanged`, UI.includes(needle))
}
ok("manage still posts connectionId plus the action",
  /body: JSON\.stringify\(\{ connectionId: id, \.\.\.body \}\)/.test(UI))
for (const action of ["pause", "resume", "label", "disconnect"]) {
  ok(`the ${action} action is still sent by that name`, UI.includes(`action: "${action}"`))
}
ok("the invitation payload still carries agentUserId and label",
  /payload\.agentUserId = selectedAgent\.id/.test(UI) && /payload\.label = selectedAgent\.name/.test(UI))
ok("revoke is still a POST to the invitation's revoke path",
  /fetch\(`\$\{INVITES\}\/\$\{id\}\/revoke`, \{ method: "POST" \}\)/.test(UI))
ok("disconnecting Instagram still warns the queue and library are kept",
  /Scheduled posts stay in the Queue; nothing in your Library is deleted/.test(UI_RAW))
ok("disconnecting TikTok still warns the other accounts are unaffected",
  /Your other accounts are unaffected, and nothing in your Library is deleted/.test(UI_RAW))
ok("TikTok still disconnects through the connection-scoped backend, never the owner-wide one",
  /manage\(t\.id, \{ action: "disconnect" \}\)/.test(UI) && !/tiktok\/disconnect/.test(UI))

// ── 7. OUT OF SCOPE, AND VERIFIED OUT OF SCOPE ────────────────────────────────────────────────
// The brief was a visual and organisational change. Nothing about publishing, scheduling,
// rendering, approvals or automation may move with it.
console.log("\nnothing outside the screen moved:")

ok("the page writes nothing", !/\.(insert|update|delete|upsert)\(/.test(PAGE))
ok("…and still reads only safe display fields — never a token or an external id",
  !/token_secret_id|external_account_id/.test(PAGE))
ok("the component touches no posting, rendering or approval endpoint",
  !/\/api\/[^"']*(publish|render|approve|queue|schedule)/.test(UI))
ok("…and never writes the master Auto Posting switch",
  !/auto-posting/.test(UI) && !/autoPosting:/.test(UI))
ok("the master switch is still rendered by its own component, above the list",
  /<AutoPostingControl \/>/.test(PAGE))
// posts_per_day joined the TikTok select so the card can state a cadence. It is a READ: the
// planner has always honoured the column for every provider — computeAutopilotPlan builds a rule
// from each connection and takes its daily times from it — the page simply never selected it.
//
// buffer_account_id and buffer_channel_id joined it for the same kind of reason, and are also
// reads. The card has to know whether a destination publishes through Buffer, because a routed row
// holds none of our tokens and its token_expires_at therefore says nothing about whether it can
// publish. Without them both TikTok cards read "Reconnect Needed" while publishing perfectly well.
// The list is pinned in full so a THIRD column cannot arrive unnoticed.
ok("the TikTok read added only the two routing columns",
  /\.select\("id, username, label, status, posting_paused, posts_per_day, token_expires_at, created_at, avatar_url, market_restriction, agent_user_id, buffer_account_id, buffer_channel_id"\)/.test(PAGE))
// avatar_url joined the Instagram read as well, so an Instagram card can show the ACCOUNT's own
// face the way a TikTok card does. Without it the two cards could not share one identity rule:
// Instagram had only the PERSON's photo to draw.
ok("…and the Instagram read added the routing columns and the account's own avatar",
  /\.select\("id, username, status, label, posting_paused, posts_per_day, token_expires_at, created_at, agent_user_id, scopes, market_restriction, buffer_account_id, buffer_channel_id, avatar_url"\)/.test(PAGE))
ok("…and the TikTok read carries avatar_url too, so neither card is the special case",
  /avatar_url, market_restriction, agent_user_id, buffer_account_id, buffer_channel_id"\)/.test(PAGE))
ok("…and neither select reads a credential",
  !/token_secret_id|external_account_id|owner_user_id/.test(
    (PAGE.match(/\.select\("id, username[^)]*\)/g) ?? []).join(" ")),
  "these are display queries; a credential column in one would leak into the page's props")
ok("…and routing is decided by the shared predicate, not re-derived here",
  /isBufferRouted\(/.test(PAGE) && !/buffer_channel_id\s*!==\s*null/.test(PAGE),
  "a second interpretation of the columns could disagree with where a post actually goes")
ok("…and the planner really does read it per connection, for every provider",
  /postsPerDay: typeof c\.posts_per_day === "number" && c\.posts_per_day > 0/.test(code(read("lib/social/autopilotPlanRun.ts"))))
ok("the agent filter still works and is still presentation-only",
  /const visible = \(id: string\) => visibleIds === null \|\| visibleIds\.includes\(id\)/.test(PAGE))

// ── THE PROFILE REFRESH ───────────────────────────────────────────────────────────────────────
// Both TikTok photos were broken and Lisette's TikTok wore the operator's face. Neither was a
// layout bug: avatar_url held TikTok's own SIGNED CDN urls, which expired on 2026-11-21 and
// returned 403, and her row had no avatar at all so the card fell through to a global owner photo.
// scripts/refresh-buffer-profiles.mjs stores Buffer's avatars instead — plain S3 objects with no
// signature and no expiry, so they do not come back broken.
console.log("\nthe profile refresh reads Buffer per account, and writes only display data:")

const REFRESH = (() => { try { return read("scripts/refresh-buffer-profiles.mjs") } catch { return "" } })()

ok("the refresh script exists", REFRESH.length > 0)
ok("…and defaults to a dry run, writing only with --apply",
  /const APPLY = process\.argv\.includes\("--apply"\)/.test(REFRESH) && /if \(APPLY\) \{/.test(REFRESH),
  "a script that rewrites names and faces should show its diff before taking it")
ok("…and asks each channel with ITS OWN account's key, never one shared key",
  /keyFor\(account\.label\)/.test(REFRESH) && /accountById\.get\(row\.buffer_account_id\)/.test(REFRESH),
  "one key for every row is how one person's profile reaches another's card")
ok("…and refuses a channel answering from the wrong organization",
  /ch\.organizationId !== account\.organization_id/.test(REFRESH) && /REFUSED/.test(REFRESH),
  "a plausible name and face from the wrong account would hide a mapping bug, not reveal it")
ok("…and refuses a channel whose service disagrees with the row",
  /String\(ch\.service\)\.toLowerCase\(\) !== String\(row\.provider\)\.toLowerCase\(\)/.test(REFRESH))
// The key goes from psql's stdout straight into a variable (stdout piped, stderr inherited so a
// failure is still visible) and is interpolated in exactly ONE place: the Authorization header.
// Counting the interpolations is the check — grepping for the WORD "key" would flag the "no stored
// key for…" message, which names a key without carrying one.
ok("…and never prints the key: it is interpolated only into the Authorization header",
  /stdio: \["ignore", "pipe", "inherit"\]/.test(REFRESH) &&
  (REFRESH.match(/\$\{key\}/g) ?? []).length === 1 &&
  /authorization: `Bearer \$\{key\}`/.test(REFRESH),
  "a second interpolation is the one that ends up in a log line")
ok("…and writes only display columns — never a credential, a route or a schedule",
  (() => {
    const written = Array.from(REFRESH.matchAll(/updates\.([a-z_]+) =/g)).map((m) => m[1]).sort()
    const allowed = ["avatar_url", "label", "username"]
    return written.length > 0 && written.every((c) => allowed.includes(c))
  })(),
  "this script must not be able to touch buffer_channel_id, posting_paused or market_restriction")
ok("…and never overwrites a label the operator typed",
  /!override && !row\.label/.test(REFRESH),
  "a blank label may be filled; a label somebody chose is theirs")
ok("…and the two names Buffer cannot supply are keyed by connection id, not matched by name",
  /OVERRIDE_BY_PREFIX/.test(REFRESH) && /"671b758b": "Jay \| Dallas Apt Locator"/.test(REFRESH) &&
  /"1b5e4878": "Jay \| Dallas Apt Locator"/.test(REFRESH),
  "a rename matched on a name could land on the wrong row")
ok("…and records that Buffer returns the HANDLE in displayName, so the display name is not there",
  /does NOT carry the profile's display name/i.test(REFRESH),
  "the next reader will otherwise try to fetch it again")
ok("…and explains why writing username is safe although the mapping deliberately did not",
  /nothing in the publishing route reads username/i.test(REFRESH))

console.log(`\nAccounts by owner: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
