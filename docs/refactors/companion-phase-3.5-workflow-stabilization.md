# Phase 3.5 — Workflow Stabilization (plan + read-only data-quality findings)

Separately committed from authentication (Phase 4). Establishes **one
authoritative action system** before the Companion gets any mutation access.
Returns the plan + read-only findings **before** any migration is applied. No
schema or workflow code changed in this commit.

Builds on the audit: [companion-last-next-action-audit.md](companion-last-next-action-audit.md).

---

## 0. Read-only data-quality findings (LB prod `onwrrajmklxtnabekzcy`)
Produced by `scripts/analysis/lead-actions-data-quality.mjs` — **SELECT-only,
aggregates only, no client PII**. Verified the key is privileged (it reads
`profiles: 2`, `workspaces: 3`, bypassing RLS).

| Table | Rows |
|---|---|
| `leads` | **0** |
| `lead_next_actions` | **0** |
| `lead_favorites` | **0** |
| `profiles` | 2 |
| `workspaces` | 3 |

**Implication — near-zero migration risk.** There are **no** existing action rows,
so: no duplicate open actions, no `completed_at`/status contradictions, no
unmappable/custom titles, and no dual virtual/row FU states to resolve. The
canonical model + constraints can be enforced **from the start** rather than
retrofitted onto messy data. The backfill/dedup steps below are therefore
**no-ops today**, but are retained because:
- data will accrue as LB launches, and
- if legacy leads are ever imported from the **frozen Lone Star** project, this
  report **must be re-run against that data** and the backfill executed **before**
  constraint activation. (Only the LB project is configured here; Lone Star was
  not queried.)

---

## 1. Canonical model
- **Every open Next Action is a real `lead_next_actions` row.** No stage/count-
  derived "virtual" action competes with it.
- **Last Action = the most recently completed real row** (`ORDER BY completed_at
  DESC LIMIT 1`), never `completedAtTs`/`first_text_sent_at`, never inferred from
  `follow_up_count`.
- **`getNextAction()` demotes to a migration/fallback generator** — used only to
  *materialize* a missing canonical row (backfill / self-heal), never rendered as
  a live second source of truth. Target: delete it once backfill + generation are
  in place.
- **Last Conversation stays entirely separate** (`lastConversation` DTO; no
  source table today → stays `null`).

## 2. Stable action identity — additive migration (design; not applied)
`lead_next_actions` gains (all additive, nullable/defaulted, existing rows
recoverable):
```sql
alter table public.lead_next_actions
  add column if not exists action_key      text,               -- canonical key; NULL for custom
  add column if not exists action_type     text,               -- 'communication'|'review'|'admin'
  add column if not exists origin          text not null default 'custom'
                                            check (origin in ('workflow','custom','system')),
  add column if not exists sequence         integer,            -- position in a chain (FU 1..4), else NULL
  add column if not exists workflow_version integer not null default 1,
  add column if not exists status          text not null default 'open'
                                            check (status in ('open','completed','canceled','superseded'));
```
- **`action_key`** is the stable identity. **Titles remain display labels** and may
  change without changing identity.
- **Canonical workflow keys:** `contact_lead, fu1, fu2, fu3, final_follow_up,
  build_list, send_list, setup_tour, tour_follow_up, check_application,
  confirm_lease, setup_movers, send_rebate`.
- **Engine-title reconciliation to resolve before backfill** (audit G6):
  the engine currently emits `Follow Up` (contacted), `Reconnect Client`
  (ready_to_tour far-move), `Email Guest Card`, and `Get Invoice Details` — none
  of which are in the canonical key list, and `confirm_lease`/`tour_follow_up`/
  `setup_movers`/`send_rebate` are **not produced by the engine at all** yet.
  Decision needed: extend the key set (`follow_up`, `reconnect_client`,
  `email_guest_card`) and rename/alias `get_invoice_details ↔ confirm_lease`, and
  decide whether `build_list`/`tour_follow_up`/`setup_movers`/`send_rebate` become
  real engine actions or stay reserved.
- **`status` kept consistent with `completed`/`completed_at`** (see §3).

## 3. Data-integrity constraints (activate AFTER backfill + approval only)
```sql
-- One open workflow action per (lead, canonical key). Custom tasks (origin
-- 'custom', action_key NULL) are EXEMPT and may share titles freely.
create unique index concurrently lead_next_actions_open_workflow_uniq
  on public.lead_next_actions (lead_id, action_key)
  where origin = 'workflow' and status = 'open' and action_key is not null;

-- completed_at and status cannot contradict each other.
alter table public.lead_next_actions
  add constraint lead_next_actions_status_ts_ck
  check (
    (status = 'completed') = (completed_at is not null)
    and (completed = (status = 'completed'))
  );
```
Existing records remain recoverable (additive columns, backfilled first). No
constraint is added until the dry-run report is clean and the backfill is
approved (per your rule).

## 4. Atomic server completion (design)
A **PostgreSQL function** `complete_lead_action(...)` (`SECURITY DEFINER`),
invoked through an **authenticated server route** `POST /api/companion/
next-actions/:id/complete` (`requireWorkspaceMember` / scoped token). The function:
1. verifies the action's `workspace_id` matches the caller's authenticated
   workspace, and the lead belongs to it (ownership);
2. `SELECT … FOR UPDATE` the action **and** its lead row (lock);
3. verifies the action is still `open`;
4. checks an **idempotency ledger** (`lead_action_completions(idempotency_key pk,
   action_id, result jsonb, created_at)`) — replay returns the stored result;
5. marks it `completed` + `completed_at = now()` (+ `status`, `completed`);
6. applies stage / `follow_up_count` changes **server-side**;
7. computes the successor via the **server-side engine** (single source of truth);
8. inserts the successor **exactly once** — `insert … on conflict
   (lead_id, action_key) where origin='workflow' and status='open' do nothing`
   (the partial unique index makes the race safe even without the ledger);
9. syncs `leads.next_action_date` / `follow_up_count` / `crm_status`;
10. returns `{ lastAction, nextAction, leadSummary }`.
**Two simultaneous completions** → the row lock serializes them; the loser sees
`status != open` (or the ledger) and returns the **same final state**; the unique
index guarantees no duplicate successor. The engine that currently runs in
`lib/workflowEngine.ts` (client + `update-stage`) is refactored so its **decision
logic is shared** but **execution is server-only** for completion.

## 5. Call / Text correction (CRM behavior; in the CRM-migration commit)
- Header **Call/Text** → communication only (already true).
- Action-card **Call/Message** → **stop auto-completing** the primary action;
  communication only.
- **Completion requires explicit "Mark Complete."**
- `first_text_sent_at` stays communication metadata, **never** Last Action.
- Optional outcome capture is deferred (no required dispositions now — parity).

## 6. Timezone
- Add a workspace timezone source: `workspaces.timezone text not null default
  'America/Chicago'` (optional per-user override `profiles.timezone`). Safe default
  `America/Chicago` for existing accounts.
- Store all due dates as **UTC `timestamptz`** (already).
- Compute "9:00 AM" in the **configured workspace timezone (DST-aware)** — the
  engine's `autoDueInDays`/`autoDueOnDate` become tz-aware and are evaluated
  **server-side** (or via `AT TIME ZONE` in the RPC), never in the browser.
- Today / Overdue derive from that same timezone consistently. **Browser tz and
  server UTC must not independently compute deadlines.**

## 7. Migration / backfill sequence (dry-run first; empty today)
1. Counts of open/completed/duplicate/ambiguous — **done (all 0)**.
2. Map titles → canonical `action_key` (table in §2) — n/a (no rows).
3. Identify unmappable/custom titles without guessing — n/a.
4. Backfill `action_key/action_type/origin/sequence/workflow_version/status`
   additively — n/a now; script provided for future/import.
5. Generate missing canonical open actions from current stage/follow-up — n/a.
6. Resolve dual virtual/row FU deterministically (prefer the existing open row;
   set `follow_up_count` to match its `sequence`) — n/a.
7. Preserve completed history + timestamps — inherently (additive).
8. **Dry-run report before any production data change** — this document is it.
Reports never include client PII (custom titles surfaced only when systematic,
≥10 distinct leads; long-tail suppressed to counts).

## 8. Corrected public DTOs (shared package; stable IDs/keys, no raw rows)
```ts
interface CompletedActionDTO {   // Last Action
  id: string | number | null; actionKey: string | null; title: string;
  origin: "workflow" | "custom" | "system"; completedAt: string;
  sequence: number | null; outcome?: string | null;   // reserved
}
interface OpenActionDTO {         // Next Action
  id: string | number; actionKey: string | null; title: string;
  origin: "workflow" | "custom" | "system"; generatedBy: "workflow_engine" | "manual";
  status: "open"; urgency: "overdue" | "today" | "upcoming" | "none";
  dueAt: string | null; sequence: number | null;
}
interface ConversationSummaryDTO { at: string; direction: "inbound" | "outbound"; channel: "sms"|"call"|"email"; preview?: string | null; }
interface LeadActionsDTO { lastAction: CompletedActionDTO | null; nextAction: OpenActionDTO | null; lastConversation: ConversationSummaryDTO | null; }
```

## 9. CRM migration
Migrate the **existing CRM** to the new completion route **before** the Companion
gets mutation access. Keep optimistic UI, but **reconcile with the authoritative
response and refetch on conflict**. Remove the client-side direct completion +
`createWorkflowActionIfNeeded` chaining **only after parity tests pass**. Do not
maintain two engines permanently.

## 10. Acceptance tests (full audit matrix + edge cases)
The 14-row workflow matrix from the audit, **plus**: two simultaneous completions;
retry with the **same** idempotency key; retry with a **different** key after
completion; duplicate legacy open actions (constraint + backfill); custom tasks
with identical titles (allowed); browser tz ≠ workspace tz; a **DST transition**;
Call/Text opened without completion; stage changed **while a completion is in
flight**; lead archived/restored. Each asserts the exact `lastAction` /
`nextAction` and "no duplicate successor / same final state."

## 11. Delivery sequence (separate commits; stop for approval between)
1. **Schema/data-quality analysis + dry-run migration** ← *this doc + the analysis
   script; findings above. Awaiting approval.*
2. Additive schema (§2) + shared DTO changes (§8) — no constraints yet.
3. Transactional server workflow operation (§4) + tz-aware engine (§6).
4. CRM migration to the server operation (§5, §9).
5. Backfill + **constraint activation** (§3) after verification.

**Do not begin authentication or live Companion data until the existing CRM
passes the full Last/Next Action matrix.** The Phase 3 CRM panel and the
Companion demo UI are preserved throughout.
