// PHASE C — WHOSE FACE IS IN THIS, AND WHOSE ACCOUNT IS THIS.
//
// Two claims, tested separately:
//
//   1. IT REFUSES NOTHING THAT EXISTS TODAY. Every live destination and post shape passes. This
//      is the acceptance test for shipping a refusal: measured against production before the
//      predicate was written, it refused ZERO of 265 posts, and the shapes that made that true
//      are reproduced here so a later edit cannot quietly start refusing them.
//
//   2. IT REFUSES EVERYTHING UNSAFE. An external agent may receive only a certified-clean
//      render of a shared source — nothing else, in any combination.
import { renderRefusalFor, deriveIdentityState, effectiveAgent, REFUSAL_MESSAGE } from "@/lib/social/renderAuthorization"
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const ADMIN = "c567c077-d3f4-4532-8807-a54795f753f5"
const AGENT = "27d7bde4-00f0-433c-b32b-b243623ad20a"
const CONN = "5ea0e810-f608-404d-8277-98169af785c9"

const ownIg = { connectionId: CONN, agent_user_id: ADMIN, owner_user_id: ADMIN }   // live Instagram
const ownTikTok = { connectionId: CONN, agent_user_id: null, owner_user_id: ADMIN } // live TikTok
const agentIg = { connectionId: CONN, agent_user_id: AGENT, owner_user_id: ADMIN }  // a real agent
const unassigned = { connectionId: null, agent_user_id: null, owner_user_id: null }

const shared = { availableToAgents: true }
const personal = { availableToAgents: false }

// ── 1. THE OPERATOR'S OWN ACCOUNTS KEEP WORKING ───────────────────────────────────────────────
console.log("every shape that exists in production today is still allowed:")

for (const [label, dest] of [["Instagram, agent = owner", ownIg], ["TikTok, agent = NULL", ownTikTok]] as const) {
  for (const state of ["unknown", "owned", "clean"] as const) {
    for (const src of [shared, personal]) {
      const refusal = renderRefusalFor({
        render: { identityState: state, identityOwnerUserId: state === "owned" ? ADMIN : null },
        source: src,
        destination: dest,
      })
      ok(`${label}, render '${state}', source ${src.availableToAgents ? "shared" : "Personal"} → allowed`, refusal === null, String(refusal))
    }
  }
}

// THE TRAP. A null agent_user_id is the owner's own account. Reading it as "not the owner" is
// what would have refused every TikTok post the operator publishes.
ok("a null agent resolves to the owner, not to nobody", effectiveAgent(ownTikTok) === ADMIN)
ok("…so an owner-identity render passes on it",
  renderRefusalFor({ render: { identityState: "owned", identityOwnerUserId: ADMIN }, source: shared, destination: ownTikTok }) === null)

// THE OTHER TRAP. Four real posts — three published TikToks and a draft — carry no connection_id.
// Evaluated without this guard the identity rule refused all four.
console.log("\nan unassigned post has no destination to be refused for:")
for (const state of ["unknown", "owned", "clean"] as const) {
  ok(`render '${state}', no connection → not applicable`,
    renderRefusalFor({ render: { identityState: state, identityOwnerUserId: ADMIN }, source: personal, destination: unassigned }) === null)
}
ok("…even with no destination object at all",
  renderRefusalFor({ render: { identityState: "owned", identityOwnerUserId: ADMIN }, source: personal, destination: null }) === null)

// ── 2. AN EXTERNAL AGENT RECEIVES ONLY A CERTIFIED CLEAN RENDER ───────────────────────────────
console.log("\nan agent's account refuses everything that is not certified clean:")

ok("'unknown' → identity_not_certified",
  renderRefusalFor({ render: { identityState: "unknown", identityOwnerUserId: null }, source: shared, destination: agentIg }) === "identity_not_certified")
ok("the operator's identity → identity_not_certified",
  renderRefusalFor({ render: { identityState: "owned", identityOwnerUserId: ADMIN }, source: shared, destination: agentIg }) === "identity_not_certified")
ok("…even when the identity is the AGENT'S OWN, while uncertified footage is involved",
  renderRefusalFor({ render: { identityState: "owned", identityOwnerUserId: AGENT }, source: shared, destination: agentIg }) === "identity_not_certified")
ok("a missing render row → identity_not_certified",
  renderRefusalFor({ render: null, source: shared, destination: agentIg }) === "identity_not_certified")
ok("a Personal source → personal_video, whatever the render says",
  renderRefusalFor({ render: { identityState: "clean", identityOwnerUserId: null }, source: personal, destination: agentIg }) === "personal_video")
ok("…and Personal is reported BEFORE certification, as the operator's own choice",
  renderRefusalFor({ render: { identityState: "unknown", identityOwnerUserId: null }, source: personal, destination: agentIg }) === "personal_video")
ok("a missing source → personal_video, failing closed",
  renderRefusalFor({ render: { identityState: "clean", identityOwnerUserId: null }, source: null, destination: agentIg }) === "personal_video")
ok("certified clean + shared → ALLOWED, which is the whole point",
  renderRefusalFor({ render: { identityState: "clean", identityOwnerUserId: null }, source: shared, destination: agentIg }) === null)

// On the OWNER's own account the rule is narrower: somebody else's face may not appear.
console.log("\nsomebody else's identity never reaches an account that is not theirs:")
ok("an agent's identity on the owner's account → identity_mismatch",
  renderRefusalFor({ render: { identityState: "owned", identityOwnerUserId: AGENT }, source: shared, destination: ownIg }) === "identity_mismatch")
ok("'owned' with no owner recorded → identity_mismatch, failing closed",
  renderRefusalFor({ render: { identityState: "owned", identityOwnerUserId: null }, source: shared, destination: ownIg }) === "identity_mismatch")

// ── 3. AUDIO IS NOT IDENTITY ──────────────────────────────────────────────────────────────────
// The operative distinction, and the one most likely to be re-broken: a video is not suspect
// because it has a soundtrack. Music, effects, ambient audio and a generic read are all clean.
console.log("\naudio does not make a render unclean:")

const derive = (o: Partial<Parameters<typeof deriveIdentityState>[0]>) =>
  deriveIdentityState({ hasPresenter: false, voiceClipsCertified: [], sourceCertified: true, ownerUserId: ADMIN, ...o })

ok("certified source, no voice at all → clean", derive({}).identityState === "clean")
ok("certified source + a CERTIFIED voice clip → clean",
  derive({ voiceClipsCertified: [true] }).identityState === "clean")
ok("certified source + two certified clips → clean",
  derive({ voiceClipsCertified: [true, true] }).identityState === "clean")
ok("…and a clean render belongs to nobody",
  derive({ voiceClipsCertified: [true] }).identityOwnerUserId === null)
ok("an UNCERTIFIED voice clip → owned",
  derive({ voiceClipsCertified: [false] }).identityState === "owned")
ok("one uncertified among certified → owned",
  derive({ voiceClipsCertified: [true, false] }).identityState === "owned")
ok("…attributed to the render's owner", derive({ voiceClipsCertified: [false] }).identityOwnerUserId === ADMIN)

console.log("\na presenter is always somebody, and the source always matters:")
ok("a presenter → owned even with a certified source and certified voice",
  derive({ hasPresenter: true, voiceClipsCertified: [true] }).identityState === "owned")
ok("an UNCERTIFIED source → unknown, never clean",
  derive({ sourceCertified: false }).identityState === "unknown")
ok("…even with every composited input certified",
  derive({ sourceCertified: false, voiceClipsCertified: [true, true] }).identityState === "unknown")
ok("…and 'unknown' belongs to nobody, so it cannot be mistaken for an attribution",
  derive({ sourceCertified: false }).identityOwnerUserId === null)
ok("a presenter over an uncertified source → owned, not unknown",
  derive({ hasPresenter: true, sourceCertified: false }).identityState === "owned")

// ── 4. THE MODULE ONLY EVER REFUSES ───────────────────────────────────────────────────────────
console.log("\nthe predicate cannot grant anything:")
const authSrc = code(readFileSync("lib/social/renderAuthorization.ts", "utf8"))
ok("it never writes to the database", !authSrc.includes(".from(") && !authSrc.includes("supabase"))
ok("it reuses the one external-agent classifier", authSrc.includes("isExternalAgentConnection"))
ok("…rather than comparing ids itself", !/agent_user_id\s*!==|agent_user_id\s*<>/.test(authSrc))
ok("every refusal has a message for the operator",
  (["identity_not_certified", "identity_mismatch", "personal_video"] as const).every((r) => typeof REFUSAL_MESSAGE[r] === "string" && REFUSAL_MESSAGE[r].length > 20))

// ── 5. THE THREE CHECKPOINTS ARE ALL WIRED, TO THE SAME MODULE ────────────────────────────────
console.log("\nall three checkpoints ask the same module:")
const planner = code(readFileSync("lib/social/autopilotPlanner.ts", "utf8"))
const renderer = code(readFileSync("lib/social/renderPost.ts", "utf8"))
const ig = code(readFileSync("app/api/cron/social-instagram-publish/route.ts", "utf8"))
const tt = code(readFileSync("app/api/cron/social-tiktok-publish/route.ts", "utf8"))

ok("PLANNING calls it", planner.includes("renderRefusalFor("))
ok("RENDERING calls it", renderer.includes("renderRefusalFor("))
ok("PUBLISHING (Instagram) calls it", ig.includes("renderRefusalFor("))
ok("PUBLISHING (TikTok) calls it", tt.includes("renderRefusalFor("))
ok("both workers send a refusal to needs_attention, never a silent skip",
  /identityRefusal\)\s*\{\s*await fail\(/.test(ig) && /identityRefusal\)\s*\{\s*await markFailed\(/.test(tt))
ok("neither worker re-implements the rule", !ig.includes("identity_state ===") && !tt.includes("identity_state ==="))

// The planner must not disturb a destination that refuses nothing — asserted structurally,
// because this is what makes Phase C a no-op for the operator's own accounts.
ok("the planner reuses the same pool array when nothing is refused",
  /identityRefused\.size === 0 \? marketPool :/.test(planner),
  "a fresh array every time would change behaviour the surrounding code relies on")

// Certification must never reach the fingerprint: certifying a video changes no pixels, and
// folding it in would invalidate every stored render the moment somebody ticked a box.
const spec = code(readFileSync("lib/social/renderSpec.ts", "utf8"))
ok("the fingerprint knows nothing about certification",
  !spec.includes("identity") && !spec.includes("cleared"))

console.log(`\nRender authorization: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
