-- Beast Voice — alpha command log.
--
-- Records what was SAID and what Beast Voice decided to do about it, so the
-- command grammar can be widened from evidence instead of guesswork. Beast Voice
-- is an input layer only: nothing here participates in the CRM workflow, and no
-- CRM table, policy, or function is touched by this migration.
--
-- NO AUDIO. Only the transcript text the recognizer returns is stored; raw
-- microphone audio is never captured, uploaded by us, or persisted.
--
-- APPEND-ONLY, like lead_timeline: insert and select policies only.
--
-- Platform-admin scoped for the alpha. The insert policy requires BOTH
-- is_platform_admin() and user_id = auth.uid(), so a normal account cannot write
-- rows even if it reached the endpoint, and the API route's own admin check is a
-- second, independent gate rather than the only one.

create table if not exists public.beast_voice_commands (
  id              uuid primary key default gen_random_uuid(),

  -- WHO. Both derived server-side from the session — never from the request body.
  -- organization_id is the workspace, matching every other CRM table's scoping,
  -- so usage can later be metered per organization as well as per user.
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid references public.workspaces(id) on delete set null,

  -- WHAT WAS HEARD. Text only.
  transcript      text not null,

  -- WHAT BEAST VOICE UNDERSTOOD.
  -- parsed_intent: 'contact' | 'unknown' (open text so widening the grammar
  -- needs no migration). requested_action is the workflow entry point Beast
  -- Voice asked for — 'initiate-contact' today.
  parsed_intent   text not null,
  requested_action text,

  -- WHICH CLIENT. The FK covers real leads and survives their deletion (set
  -- null) so accuracy analysis outlives the data. matched_lead_ref keeps the raw
  -- identifier the browser matched, which also captures demo-workspace leads
  -- ("demo-1") whose string ids cannot go in a bigint column.
  matched_lead_id  bigint references public.leads(id) on delete set null,
  matched_lead_ref text,
  -- How many clients the spoken name matched. >1 means Beast asked instead of guessing.
  match_count      integer not null default 0,

  -- WHAT HAPPENED. outcome is the single terminal state:
  --   'handed-off'   → the existing Contact Gate was opened
  --   'ambiguous'    → asked which client
  --   'not-found' | 'not-eligible' | 'unparsed' | 'speech-error'
  outcome         text not null,
  error_reason    text,

  -- Whether the command reached the existing CRM workflow. This is the last
  -- thing Beast Voice can observe: everything after the hand-off belongs to the
  -- existing contact workflow, which this checkpoint must not instrument.
  handed_off      boolean not null default false,

  -- RESERVED, always null today. Capturing whether the locator confirmed inside
  -- the existing Call/Text + "Were you able to contact…?" modal, and whether the
  -- write succeeded, would require modifying that workflow — out of scope by
  -- rule. The columns exist so adding it later is a backfill, not a migration.
  confirmed       boolean,
  succeeded       boolean,

  -- SPEECH PROVIDER + COST METERING.
  -- provider is the SpeechProvider id ('browser-webspeech' today); provider_model
  -- is the model/variant a cloud provider would report (null for the browser).
  -- audio_duration_ms is how long capture ran — the billable unit for every
  -- per-minute STT vendor, recorded now so cost can be computed retroactively
  -- once a paid provider is chosen. provider_meta absorbs provider-specific
  -- fields (request id, confidence, billed duration) without a schema change.
  -- This is metering data only: no billing, quota, or entitlement logic exists.
  provider          text not null,
  provider_model    text,
  audio_duration_ms integer,
  provider_meta     jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now()
);

-- Newest-first review of one user's alpha usage; also serves per-user metering rollups.
create index if not exists beast_voice_commands_user_created_idx
  on public.beast_voice_commands (user_id, created_at desc);
-- Per-organization metering rollups.
create index if not exists beast_voice_commands_workspace_created_idx
  on public.beast_voice_commands (workspace_id, created_at desc);

alter table public.beast_voice_commands enable row level security;

create policy "platform admins append beast voice commands"
  on public.beast_voice_commands
  for insert
  with check (public.is_platform_admin() and user_id = auth.uid());

create policy "platform admins read beast voice commands"
  on public.beast_voice_commands
  for select
  using (public.is_platform_admin());

-- Deliberately NO update or delete policies — the log is append-only.
