-- DURABLE ONE-TIME INTRO — the index behind the per-lead ledger lookup.
--
-- enrollLifecycleRuns asks "has this lead ever had new_lead/t1 enqueued, claimed or sent?"
-- before it will open the opening pair. That question is answered from
-- followup_outbound_intents, which already is a durable per-message ledger — the row
-- outlives its run (run_id is ON DELETE SET NULL), supersession rewrites only
-- dispatch_status, and nothing deletes intents on archive, restore, stage change or restart.
-- So the guarantee needed no new column, only a way to look it up cheaply.
--
-- There was no index on lead_id: Postgres does not create one for a foreign key, and every
-- existing index here is keyed on run_id or workspace_id. The guard runs once per lead whose
-- applicable sequence is new_lead, up to TICK_BATCH leads per tick, every minute, so the
-- lookup should not be a sequential scan over the whole intents table.
--
-- The predicate deliberately matches followup_intents_active_step_uidx exactly —
-- dispatch_status IN ('pending','claimed','sent') — so the index and the question stay in
-- step: 'sent' is confirmed, 'claimed' is uncertain and still blocks, and 'failed' /
-- 'superseded' are confirmed NOT sent and are excluded so a genuinely undelivered intro can
-- still be retried.
--
-- Purely additive: no column, no constraint, no behaviour change, nothing reads it by name.
-- Verified by rolled-back dry run to be chosen by the planner for the engine's exact query.
-- Rollback: drop index if exists public.followup_intents_lead_step_idx;

create index if not exists followup_intents_lead_step_idx
  on public.followup_outbound_intents (lead_id, sequence_key, step_key)
  where dispatch_status in ('pending', 'claimed', 'sent');
