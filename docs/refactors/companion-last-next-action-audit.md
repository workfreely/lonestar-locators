# Last Action / Next Action — Verification Audit

Read-only audit against the **actual schema and source** (not the Phase 3 fixture).
No workflow code changed. Traces: `components/crm/LeadPanel.tsx`,
`lead_next_actions` (migrations), `lib/workflowEngine.ts`, `lib/nextAction.ts`,
`lib/nextActions.ts` (`rankLeadActions`), `lib/workflow/autoDueDate.ts`, the
stage-advance API, and the completion helpers.

## Schema of record — `lead_next_actions`
`20260719000000_add_lead_next_actions.sql` (+ later): `id bigint PK`, `lead_id
bigint FK → leads ON DELETE CASCADE`, `title text NOT NULL`, `due_at timestamptz
NOT NULL`, `priority text default 'medium' check(low|medium|high)`, `completed
bool default false`, **`completed_at timestamptz` (nullable)**, `notes`,
`created_at default now()`; `property_id`/`property_name` added `20260726000001`;
`workspace_id` added `20260728000005` (RLS tightened to workspace membership +
entitlement in `20260728000008` / `20260730000000`). Partial index on open rows
(`where completed=false`). **No sequence-number column** (FU order is encoded in
the title). **No UNIQUE / partial-unique constraint** on open rows.

## The core finding: TWO parallel "action" systems that can desync
1. **Virtual/automatic** — `lib/nextAction.ts getNextAction(lead)` derives a
   *display label* purely from `crm_status` + `leads.follow_up_count`
   (`new→Contact Lead`, `contacted→Waiting for Response`, `searching→Build List`,
   `list_sent→FU1..Final FU` by count, `done_touring→Tour Follow-Up`,
   `closed→Invoice Details`). No row. Its due date is `leads.next_action_date`.
2. **Real rows** — `lead_next_actions`, created by `lib/workflowEngine.ts`
   (`getStageWorkflowAction` on transitions; `getNextFollowUpAction` FU1→FU2→FU3→
   Final chain) or manually (Add Task). Has real `completed_at`.

`rankLeadActions` merges them and picks ONE `primary` by **urgency → priority →
earliest due**. It suppresses the virtual action only when an open manual row has
the **same title**. Because the FU chain exists in BOTH systems and
`leads.follow_up_count` is advanced by a *different* code path than the FU row
chain, they drift (see #6). This split is the root of most gaps below.

## Determinations

**1. Are completed actions retained or overwritten/deleted?** **Retained.**
`createWorkflowActionIfNeeded` only ever *inserts*; nothing deletes/edits rows.
Completion flips `completed=true` + stamps `completed_at`. Good for history.

**2. Does `completed_at` exist and is it consistently populated?** Column exists.
**Not consistently populated.** It is set only when a *real row* is completed
(`handleCompleteAction`, `handleGuestCardSent`, the return-to-focus stamp). The
**count-based FU advance** (`setFollowUpCount` via the Quick-Action FU buttons)
and **first contact** (`recordFirstContact` → `first_text_sent_at`) complete no
row, so those "completions" leave **no `completed_at`**.

**3. How is the current open action selected with multiple rows?** `rankLeadActions`
sorts `[virtual?, ...openManual]` by `urgency (overdue<today<upcoming<none) →
priority (high<med<low) → earliest due_at`; `primary = all[0]`. It is **not**
"the single open action" — it's the top of a rank over possibly-many open rows.

**4. Are duplicate open actions possible?** **Yes.** Dedup is app-side only
(`createWorkflowActionIfNeeded` does `SELECT … ilike title … limit 1` then
`INSERT`). No DB unique constraint backstops it, and the check-then-insert is
**not atomic** — concurrent completions can both pass the check and insert.

**5. Does completing an action atomically create its successor?** **No.**
Completion (`handleCompleteAction`) runs **client-side**: optimistic remove →
`supabase.update({completed})` → *then* `createWorkflowActionIfNeeded`. Two
separate writes, no transaction; a failure between them leaves an action
completed with no successor, and concurrency can create two successors.

**6. Do stage, `follow_up_count`, `next_action_date` stay synchronized?**
**Partially — the FU chain desyncs.** The FU sequence has two disconnected
drivers: (a) the Quick-Action FU buttons → `setFollowUpCount` bumps
`leads.follow_up_count` + `next_action_date` (no row); (b) the FU1→Final
`lead_next_actions` rows chained by `getNextFollowUpAction` (no count change).
Completing the FU1 *row* creates the FU2 row but leaves `follow_up_count=0`, so
`getNextAction(list_sent, fu=0)` still returns the virtual "FU1"; since its label
("FU1") no longer matches the open row ("FU2"), the virtual FU1 **reappears
alongside** FU2 → two open actions. `next_action_date` is written by the client
and merely *trusted* by the stage route (server does not recompute it).

**7. Does Call/Text only record first-contact bookkeeping?** **The header
Call/Text buttons: yes** — `handleHeaderCall/Text` open `tel:`/`sms:` and call
`recordFirstContact` **only when `crm_status==='new'`** (stamp `first_text_sent_at`
+ advance New→Contacted + engine's next action); on later stages they are pure
comms and complete nothing. **Caveat:** the Next-Action-card contextual buttons
(`handleCallClientAction`, `handleMessageClient`) *do* additionally complete the
primary manual action — but those are the "do this action" buttons, not the
generic header comms. So: header Call/Text never completes a workflow action;
the action-card Call/Message buttons intentionally do.

**8. How are overdue/today computed, and which timezone?** `urgencyOf` (in
`rankLeadActions`) compares `new Date(due_at)` vs `new Date()` after
`setHours(0,0,0,0)` — i.e. **the browser's local midnight**. Due dates come from
`autoDueInDays/autoDueOnDate` = "9:00 AM local" via `setHours(9,…)` — computed in
**whichever environment runs it**: the **browser** for client FU completions, the
**server (UTC)** for the stage-advance API. So a server-created action is "9:00 AM
UTC" but overdue/today is judged against **browser-local** midnight → off-by-hours
skew across timezones. No per-user timezone column exists.

**9. Do custom tasks share the sequence?** **They participate in ranking, not in
the chain.** A custom task (Add Task → `lead_next_actions`) is ranked by
`rankLeadActions` like any manual row, but `getNextFollowUpAction` only advances
FU1/FU2/FU3 titles — completing a custom task creates **no successor**.

**10. Does the Phase 2 DTO distinguish `lastAction` vs `nextAction`?** **No.**
`leadSummarySchema` exposes `workflow {followUpCount, nextActionDate,
firstContactAt}` + a flat `nextActions[]` array; the panel derives Last/Next
client-side. There are **no distinct `lastAction` / `nextAction` typed fields**,
and **no `lastConversation`** concept at all. (Also: the current UI's "Last
Action" is derived from `first_text_sent_at` (Contact Lead, gated on
`follow_up_count===0`) or an **ephemeral in-session `completedAtTs`** — it does
**not** read `lead_next_actions.completed_at`, and is lost on refresh.)

## Test matrix — Last / Next after each event (CURRENT behavior)
"Virtual" = derived label, no row. Flags call out gaps.

| Event | Last Action (today) | Next Action (today) | Notes / gap |
|---|---|---|---|
| Contact Lead completed | "Contact Lead" via `first_text_sent_at` (not a row) | "Follow Up" (+2d row, engine) | Last not from `completed_at`; ⚠ #2/#10 |
| FU1 completed (row) | ephemeral `completedAtTs` or none on refresh | "FU2" (+2d row) **and** virtual "FU1" reappears | ⚠ #6 desync — two open actions |
| FU2 completed (row) | ephemeral/none | "FU3" (+3d) (+ virtual FU drift) | ⚠ #6 |
| FU3 completed (row) | ephemeral/none | "Final" (+7d) | ⚠ #6 |
| Final follow-up completed | ephemeral/none | none (chain ends) | virtual "Final FU" may linger via count path |
| Build List completed | n/a — **virtual label only, not completable** | stays "Build List" until stage moves | ⚠ no row to complete |
| Send List completed (row) | ephemeral/none | (stage-driven; entering list_sent→FU1) | Send List is the `searching` engine action |
| Setup Tour completed (row) | ephemeral/none | none (no `done_touring` rule) | ⚠ Tour Follow-Up not implemented |
| Tour Follow-Up completed | **does not exist** (virtual only, no engine rule) | — | ⚠ unimplemented |
| Check App completed (row) | ephemeral/none | none | Check App suppressed once Closed |
| Confirm Lease completed | **does not exist** (closed→"Get Invoice Details") | — | ⚠ title not in engine |
| Custom task completed | ephemeral/none | next ranked open action (no successor created) | #9 — no chaining |
| Call/Text opened, not completed | unchanged | unchanged (header buttons) | ✓ #7 (except new-lead first-contact) |
| Two completions submitted at once | — | **duplicate successor rows possible** | ⚠ #4/#5 non-atomic |

## Identified gaps (blockers to fix before/with live workflow)
- **G1 — Last Action is not sourced from `completed_at`.** It's ephemeral
  (`completedAtTs`) or first-contact-special-cased, lost on refresh, and not the
  true "most recently completed action." Must become `SELECT … WHERE completed
  ORDER BY completed_at DESC LIMIT 1`.
- **G2 — No atomic/idempotent completion.** Client-side complete-then-chain, no
  transaction, no unique backstop ⇒ duplicate successors under double-submit.
- **G3 — FU dual-system desync.** `follow_up_count` (count path) vs FU rows
  (chain path) advance independently; virtual FU reappears next to a chained row.
- **G4 — `completed_at` not written for count/first-contact "completions."**
- **G5 — Timezone skew.** "9 AM local" computed server-side (UTC) vs browser;
  overdue/today judged in browser tz; no per-user tz.
- **G6 — Matrix titles that don't exist in the engine**: Build List (virtual),
  Tour Follow-Up (unimplemented), Confirm Lease (engine uses "Get Invoice
  Details"). Naming must be reconciled before the Companion exposes them.
- **G7 — Phase 2 DTO conflates the concepts** (no `lastAction`/`nextAction`/
  `lastConversation`).

## Corrected DTO proposal (before any workflow change)
```ts
type ActionKind = "workflow" | "manual" | "first_contact";

interface CompletedActionDTO {          // "Last Action" — NEVER "Last Conversation"
  id: string | number | null;           // null for first_contact (no row)
  title: string;
  kind: ActionKind;
  completedAt: string;                  // from lead_next_actions.completed_at (or first_text_sent_at)
  outcome?: string | null;             // reserved extension point (not collected yet)
  sequence?: { chain: "follow_up"; step: number } | null;
}

interface OpenActionDTO {               // "Next Action" — the single authoritative open action
  id: string | number | null;           // null when it is the virtual/automatic action
  title: string;
  kind: "automatic" | "manual";
  generatedBy: "workflow_engine" | "manual";
  status: "pending" | "overdue" | "today" | "in_progress" | "scheduled" | "waiting_on_client";
  dueAt: string | null;
  sequence?: { chain: "follow_up"; step: number } | null;
}

interface ConversationSummaryDTO {      // separate concept; NOT derived from actions
  at: string; direction: "inbound" | "outbound"; channel: "sms" | "call" | "email";
  preview?: string | null;             // future — no source table exists today
}

interface LeadActionsDTO {
  lastAction: CompletedActionDTO | null;
  nextAction: OpenActionDTO | null;
  lastConversation: ConversationSummaryDTO | null;   // null until a messages source exists
}
```
`lastAction`, `nextAction`, and `lastConversation` are **three distinct fields** —
never merged. `lastConversation` stays `null` for now (no conversation/messages
table feeds the CRM lead panel; the `companion_messages` ingest is Beast Sync and
not wired here) so the type exists but is honestly empty.

## Required server-side completion (design for the auth/live phase — not built now)
A single transactional/idempotent endpoint (`POST /api/companion/next-actions/:id/
complete`) that:
1. verifies workspace + lead ownership (token/session, server-side);
2. verifies the action is still open (`completed=false`) — else returns the
   current state idempotently (no-op);
3. marks `completed=true, completed_at=now()`;
4. applies stage/`follow_up_count`/`next_action_date` changes **server-side**
   (single source of truth — stop trusting client-supplied values);
5. computes + creates the successor **exactly once** — backed by a **partial
   unique index** `unique (lead_id, lower(title)) where completed=false` so a
   double-submit hits a constraint instead of inserting a duplicate;
6. recomputes the lead's next-action summary/date;
7. returns `{ lastAction, nextAction }`;
8. emits the bridge `mutation` event so CRM + Companion refetch.
Wrap 3–6 in a DB transaction (or a `SECURITY DEFINER` RPC) so partial failure
can't strand state. Idempotency-Key optional on top for retry safety.

**Recommendation:** land G1 (Last Action from `completed_at`), G2/G5 (transactional
server completion + the partial unique index + a fixed tz basis), and G3/G4 (unify
the FU count/row systems) **before** the Companion performs any live completion.
