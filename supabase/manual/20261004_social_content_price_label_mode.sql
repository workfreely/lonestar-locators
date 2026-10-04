-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL BEAST — per-source price label mode
--
-- What the "Starting At" number MEANS for one piece of footage:
--   NULL (or anything unrecognized) → "Starting at $X/month"      ← existing behavior
--   'exact_unit'                    → "Exact unit shown: $X/month"
--
-- NULLABLE WITH NO DEFAULT, ON PURPOSE. Every existing row reads as NULL and keeps
-- rendering "Starting at", so this needs NO backfill and NO data migration. A
-- DEFAULT 'starting_at' would have been equivalent in behavior but would have
-- rewritten every existing row's storage for nothing.
--
-- PER-SOURCE, NOT PER-POST. "The exact unit shown" describes the video itself, and
-- stays true of every post made from that video. It also keeps the change small:
-- SourceMeta already flows into every caption/overlay generator, so one field
-- reaches all 16 templates without threading a new parameter through them.
--
-- The price VALUE is untouched: budget_range keeps whatever was typed, and nothing
-- here parses, reformats or rewrites it. Compact "K" rendering is display-only and
-- lives in lib/social/composePost.ts.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.social_content
  add column if not exists price_label_mode text;

comment on column public.social_content.price_label_mode is
  'How the Starting At price is introduced in generated overlay/caption copy: NULL = "Starting at" (default, no backfill needed), ''exact_unit'' = "Exact unit shown:". Per-source because it describes what the footage shows. Display-only; budget_range is unaffected.';

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='social_content' and column_name='price_label_mode';
--
-- -- expect: every existing row NULL (no backfill)
-- select price_label_mode, count(*) from public.social_content group by 1;
