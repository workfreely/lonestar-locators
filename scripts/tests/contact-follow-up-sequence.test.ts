/**
 * Pre-list Contact Follow-Up sequence (Contact FU1 → FU2 → FU3) — pure-logic proofs.
 * No DB / no side effects. Covers templates, labels, the successor chain + timing,
 * sequence separation, and post-List-Sent parity.
 *
 *   npx tsx scripts/tests/contact-follow-up-sequence.test.ts
 */
import {
  buildContactFollowUpSmsBody,
  buildFollowUpSmsBody,
  isContactFollowUpAction,
  isFollowUpAction,
  formatWorkflowActionLabel,
  DEFAULT_FOLLOW_UP_TEMPLATES,
} from "../../packages/companion-shared/src/index"
import { getNextContactFollowUpAction, getNextFollowUpAction } from "../../lib/workflowEngine"
import { autoDueInDays } from "../../lib/workflow/autoDueDate"

let failures = 0
function ok(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error("✗", msg) } else { console.log("✓", msg) }
}
function eq(a: unknown, b: unknown, msg: string) { ok(a === b, `${msg}  (got ${JSON.stringify(a)})`) }

// ── Exact approved templates (default, no override) ───────────────────────────
eq(
  buildContactFollowUpSmsBody("Contact FU1", "Jordan"),
  "Hey Jordan! Are you still looking for a place? I can put together some options for you.",
  "Contact FU1 renders the exact approved SMS with {first_name}",
)
eq(
  buildContactFollowUpSmsBody("Contact FU2", "Jordan"),
  "Did you see any properties on my page you'd like more info on?",
  "Contact FU2 renders the exact approved SMS (no name)",
)
eq(
  buildContactFollowUpSmsBody("Contact FU3", "Jordan"),
  "I'll go ahead and pause your search for now. Please let me know if you'd like help finding a place!",
  "Contact FU3 renders the exact approved SMS (no name)",
)
// FU2 / FU3 must NOT contain the client name.
ok(!buildContactFollowUpSmsBody("Contact FU2", "Jordan").includes("Jordan"), "Contact FU2 never includes the client name")
ok(!buildContactFollowUpSmsBody("Contact FU3", "Jordan").includes("Jordan"), "Contact FU3 never includes the client name")
// Action-key form resolves identically.
eq(buildContactFollowUpSmsBody("contact_follow_up_1", "Sam"), buildContactFollowUpSmsBody("Contact FU1", "Sam"), "key and title forms match for FU1")

// ── Never falls through to the post-list Final template ───────────────────────
const FINAL = DEFAULT_FOLLOW_UP_TEMPLATES.final_follow_up
ok(buildContactFollowUpSmsBody("Contact FU1", "Jordan") !== FINAL, "Contact FU1 is not the Final template")
ok(buildContactFollowUpSmsBody("Contact FU3", "Jordan") !== FINAL, "Contact FU3 is not the Final template")
// An unrecognized identity returns "" (never a post-list template).
eq(buildContactFollowUpSmsBody("nonsense", "X"), "", "unknown identity → empty (never a fallthrough template)")

// ── Sequence separation ───────────────────────────────────────────────────────
ok(isContactFollowUpAction("Contact FU1") && isContactFollowUpAction("contact_follow_up_3"), "isContactFollowUpAction matches contact FUs")
ok(!isContactFollowUpAction("FU1") && !isContactFollowUpAction("Final"), "isContactFollowUpAction rejects post-list FUs")
ok(!isFollowUpAction("Contact FU1") && !isFollowUpAction("contact_follow_up_2"), "isFollowUpAction rejects contact FUs")
ok(isFollowUpAction("FU1") && isFollowUpAction("Final"), "isFollowUpAction still matches post-list FUs")

// ── Labels ────────────────────────────────────────────────────────────────────
eq(formatWorkflowActionLabel("Contact FU1"), "Contact FU1", "label Contact FU1")
eq(formatWorkflowActionLabel("contact_follow_up_2"), "Contact FU2", "label Contact FU2 (from key)")
eq(formatWorkflowActionLabel("contact_follow_up_3"), "Contact FU3", "label Contact FU3 (from key)")

// ── Successor chain + timing (+2 days @ 9AM via the SHARED autoDueInDays helper) ─
// Assert the dueAt equals what the existing infrastructure produces for +2 days,
// rather than re-deriving the 9:00 AM instant (which the helper owns).
const due2 = autoDueInDays(2)
const s1 = getNextContactFollowUpAction("Contact FU1")!
eq(s1.actionKey, "contact_follow_up_2", "FU1 → contact_follow_up_2")
eq(s1.dueAt, due2, "FU1 successor due = autoDueInDays(2) (+2 days @ 9AM)")
const s2 = getNextContactFollowUpAction("Contact FU2")!
eq(s2.actionKey, "contact_follow_up_3", "FU2 → contact_follow_up_3")
eq(s2.dueAt, due2, "FU2 successor due = autoDueInDays(2) (+2 days @ 9AM)")
eq(getNextContactFollowUpAction("Contact FU3"), null, "FU3 is terminal — no FU4")
eq(getNextContactFollowUpAction("nonsense"), null, "unknown → no successor")

// ── Post-List-Sent sequence UNCHANGED ─────────────────────────────────────────
eq(DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_1, "Hey! Did you see any properties on the list that you'd like to tour?", "post-list FU1 template unchanged")
eq(DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_2, "Is there one that stands out or would you like me to narrow the list down a bit more?", "post-list FU2 template unchanged")
eq(DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_3, "I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?", "post-list FU3 template unchanged")
eq(DEFAULT_FOLLOW_UP_TEMPLATES.final_follow_up, "Hey {first_name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!", "post-list Final template unchanged")
eq(getNextFollowUpAction("FU1")!.actionKey, "follow_up_2", "post-list FU1 → follow_up_2 unchanged")
eq(getNextFollowUpAction("FU3")!.actionKey, "final_follow_up", "post-list FU3 → final_follow_up unchanged")
eq(buildFollowUpSmsBody("FU1", "Jordan"), "Hey! Did you see any properties on the list that you'd like to tour?", "post-list buildFollowUpSmsBody(FU1) unchanged")

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
