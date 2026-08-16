-- ============================================================================
-- lead_tours: tour completion (status) vs. client decision (outcome) — orthogonal
-- ============================================================================
-- "How did the tour go?" splits into two independent facts:
--   • status  — DID the tour happen?  scheduled | completed | no_show | canceled
--                'no_show' is NEW: the tour stayed scheduled but the client did
--                not attend. This is DISTINCT from 'canceled' (a pre-tour cancel).
--                We never rewrite a no-show as 'canceled'.
--   • outcome — WHAT did the client decide? (nullable until a Tour Follow-Up is
--                recorded). lead_tours.outcome is the durable CURRENT-STATE field;
--                lead_timeline remains the immutable historical record.

-- 1) status: add 'no_show' (the original inline CHECK is named lead_tours_status_check).
alter table public.lead_tours drop constraint if exists lead_tours_status_check;
alter table public.lead_tours
  add constraint lead_tours_status_check
  check (status in ('scheduled', 'completed', 'no_show', 'canceled'));

-- 2) outcome: durable per-tour result for O(1) current-state queries.
alter table public.lead_tours
  add column if not exists outcome text;

alter table public.lead_tours drop constraint if exists lead_tours_outcome_check;
alter table public.lead_tours
  add constraint lead_tours_outcome_check
  check (
    outcome is null or outcome in (
      'ready_to_apply',
      'still_deciding',
      'wants_another_tour',
      'didnt_like',
      'didnt_tour',
      'other'
    )
  );
