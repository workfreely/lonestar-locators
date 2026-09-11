-- Social Autopilot SA1.1 — Content Library naming + batch support (additive only).
--
-- RECONCILIATION NOTE: this migration was applied to production (schema_migrations
-- version 20260911000002 is recorded and all four columns exist) during an earlier
-- SA1.1 spike whose code was later reverted. The file was removed with that revert,
-- leaving the repo out of sync with production. This restores the exact, idempotent
-- migration so the repository history correctly represents the live schema. It is a
-- no-op against production (add column IF NOT EXISTS) and introduces no duplicate or
-- conflicting version. The columns remain UNUSED by application code until SA1.1.

alter table public.social_content
  add column if not exists display_name    text,
  add column if not exists name_customized boolean not null default false,
  add column if not exists upload_batch_id uuid,
  add column if not exists batch_seq       integer;

comment on column public.social_content.display_name is
  'Human-readable, editable Content Library name (e.g. "Alta Westover Hills - San Antonio - 2026-09-11 - 01"). Independent of storage_path; renaming never moves the object.';
comment on column public.social_content.name_customized is
  'True once the user manually edits display_name — after which entering/editing property metadata must NOT auto-regenerate the name.';
comment on column public.social_content.upload_batch_id is
  'Groups source assets uploaded together in one multi-file action (organization/recovery). Each file is still its own row.';
comment on column public.social_content.batch_seq is
  '1-based position within the upload batch; drives the zero-padded name sequence.';

create index if not exists social_content_batch_idx
  on public.social_content (upload_batch_id);
