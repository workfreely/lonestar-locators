-- Lead Timeline — the CRM's append-only activity history. Named broadly (not
-- "communication log") because it will grow into the full activity feed for a
-- lead — notes, stage changes, tours, guest cards, etc. — not just contact.
-- The initial release records ONLY communication events (first contact +
-- follow-ups); the open-ended `type` + `metadata` columns let future activity
-- types land here without another table or a schema change.
--
-- APPEND-ONLY by design: rows are only ever inserted, never updated or deleted
-- (except via the lead's own ON DELETE CASCADE). This preserves an accurate,
-- immutable history. Live workflow state — follow_up_count, crm_status,
-- next_action_date, first_text_sent_at — stays denormalized on `leads` as the
-- fast-read cache the Workflow Engine reads; this table is the source of truth
-- for HISTORY, and each communication event mirrors one of those cache changes.

create table public.lead_timeline (
  id          uuid primary key default gen_random_uuid(),
  lead_id     bigint not null references public.leads(id) on delete cascade,
  -- Broad activity type. Communication types today: 'first_contact',
  -- 'follow_up'. Future (no migration needed): 'note', 'stage_change',
  -- 'tour_scheduled', 'guest_card_sent', 'lease_signed', etc.
  type        text not null,
  -- How the contact was made, when relevant: 'call' | 'text' | 'email'.
  method      text,
  -- Ordinal within a numbered sequence when relevant: 0 = first contact,
  -- 1..N = the follow-up number. Null for events with no sequence.
  sequence    integer,
  -- Structured payload for future activity types (e.g. { "from": ..., "to": ... }
  -- on a stage_change) without needing new columns.
  metadata    jsonb not null default '{}'::jsonb,
  -- When the activity actually happened (kept separate from created_at so a
  -- future backfill can set a real past time). Both default to now for live writes.
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  -- Who performed it — traceability only; the row outlives the user.
  created_by  uuid default auth.uid() references auth.users(id) on delete set null
);

create index lead_timeline_lead_id_occurred_at_idx
  on public.lead_timeline (lead_id, occurred_at desc);

alter table public.lead_timeline enable row level security;

-- Same authenticated-CRM-session posture as leads / lead_next_actions.
create policy "Authenticated users can read lead_timeline"
  on public.lead_timeline
  for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can append lead_timeline"
  on public.lead_timeline
  for insert
  with check (auth.role() = 'authenticated');

-- Deliberately NO update or delete policies — the timeline is append-only.
