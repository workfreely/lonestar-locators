-- Comments — Automated Lead Capture (Phase 2: structures only; nothing sends).
--
-- Five tables. No change to leads, social_posts, social_connections, social_content or anything the
-- Smart Lead Form, CRM, Follow-Up Agent, renderer or publisher touches. A comment never creates a
-- lead: the lead is created when the person submits the existing form with contact details and
-- consent, exactly as today, and the comment only contributes attribution (utm_content).
--
-- AUTOMATION IS OFF BY DEFAULT, structurally. Both enable flags default FALSE and there is no
-- migration path that turns one on.

-- ── RULES ───────────────────────────────────────────────────────────────────────────────────
-- One row per keyword. `keyword` is stored CANONICAL (uppercase, single-spaced) because it is the
-- join between a matched comment and its reply bank; the matcher in lib/social/commentKeywords
-- normalises to the same shape, so the two cannot drift.
create table if not exists public.comment_rules (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  keyword         text not null,
  -- The property interest the keyword implies (Apartment, Townhome, …), or NULL for general
  -- interest. CARRIED as attribution, never applied to the form — prefill is deferred.
  property_type   text,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- One rule per keyword per operator: a second rule for the same word would make "which reply?"
-- ambiguous, and the matcher guarantees exactly one keyword wins.
create unique index if not exists comment_rules_owner_keyword_uidx
  on public.comment_rules (owner_user_id, keyword);

-- ── REPLY BANK ──────────────────────────────────────────────────────────────────────────────
-- Public reply variations for a rule. Which one is used is chosen DETERMINISTICALLY from the
-- comment id (pickVariant), never randomly, so a retry re-sends the same text it sent before.
create table if not exists public.comment_reply_variants (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references public.comment_rules(id) on delete cascade,
  body        text not null,
  -- TRUE for variations that claim a DM ("Just sent you a DM!"). Those may only be used once the
  -- platform has ACCEPTED a private reply; otherwise the truthful bio-link fallback is used.
  claims_dm   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists comment_reply_variants_rule_idx on public.comment_reply_variants (rule_id);

-- ── COMMENTERS — the durable PERSON record ──────────────────────────────────────────────────
-- THE ONE-DM-PER-PERSON GUARANTEE LIVES HERE, not on the comment.
--
-- The requirement is one automatic private message per unique commenter per connected account. A
-- per-comment key cannot express that: somebody commenting on three Reels is one person owed one
-- DM. `dm_sent_at` on this row is the gate, and the unique index below is what makes it durable
-- across retries, re-polling and restarts.
--
-- provider_user_id is NOT NULL on purpose. A commenter with no stable provider id gets no row and
-- therefore no DM — usernames are mutable and reusable, so treating one as identity risks either
-- messaging a stranger who inherited a handle, or messaging the same person twice after a rename.
-- Such comments are still stored (social_comments keeps the username for display) and still get a
-- truthful public reply; they are simply never messaged privately.
create table if not exists public.social_commenters (
  id               uuid primary key default gen_random_uuid(),
  connection_id    uuid not null references public.social_connections(id) on delete cascade,
  provider         text not null,
  provider_user_id text not null,
  username         text,
  -- A profile URL the PROVIDER returned. We prefer it over anything constructed from a username;
  -- when neither is usable the UI shows the name as inert text rather than risk the wrong account.
  profile_url      text,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  -- ── THE ATOMIC CLAIM ──────────────────────────────────────────────────────────────────────
  -- dm_sent_at alone cannot hold the one-DM rule. Reading it and then deciding is check-then-act:
  -- two workers handling two comments from the SAME person both read NULL, both decide to send,
  -- and the person gets two unsolicited messages. The unique index below prevents duplicate ROWS,
  -- not duplicate SENDS.
  --
  -- So a send is CLAIMED before it is attempted, with a conditional update that only one caller
  -- can win:
  --
  --     update social_commenters set dm_claimed_at = now()
  --      where id = $1 and dm_claimed_at is null and dm_sent_at is null
  --     returning id;
  --
  -- No row returned ⇒ somebody else owns this person's DM ⇒ do not send. Same compare-and-set the
  -- follow-up engine's claimIntent uses, for the same reason.
  --
  -- CLAIM FIRST, STAMP AFTER. dm_claimed_at is taken BEFORE the API call and dm_sent_at written
  -- only on a confirmed acceptance:
  --   accepted  → dm_sent_at = now(); the claim has served its purpose.
  --   failed    → release the claim (dm_claimed_at = null) so a later comment may try again.
  --   UNCERTAIN → leave it claimed FOR EVER. Never released, never retried, surfaced for a human.
  --
  -- That last line is the important one. A send whose outcome we could not establish may well have
  -- arrived; retrying it would be the duplicate we are trying to prevent. A claim nobody releases
  -- blocks further attempts, which is the correct failure direction for unsolicited messaging.
  dm_claimed_at    timestamptz,
  dm_sent_at       timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists social_commenters_account_person_uidx
  on public.social_commenters (connection_id, provider_user_id);
-- Claims that were taken but never resolved — in flight, or uncertain and awaiting a human. The
-- Automation view lists these; nothing retries them automatically.
create index if not exists social_commenters_unresolved_claim_idx
  on public.social_commenters (connection_id, dm_claimed_at)
  where dm_claimed_at is not null and dm_sent_at is null;

-- ── COMMENTS ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.social_comments (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.social_connections(id) on delete cascade,
  provider            text not null,
  external_comment_id text not null,
  external_media_id   text,
  -- The Social Beast post, when the media maps to one. ON DELETE SET NULL: the conversation is a
  -- record of what a real person said and must outlive our own bookkeeping.
  post_id             uuid references public.social_posts(id) on delete set null,
  commenter_id        uuid references public.social_commenters(id) on delete set null,
  -- Captured even when there is no stable id, so the Inbox can always show who said it.
  author_username     text,
  body                text,
  permalink           text,
  commented_at        timestamptz,
  matched_rule_id     uuid references public.comment_rules(id) on delete set null,
  matched_keyword     text,
  created_at          timestamptz not null default now()
);
-- Re-polling the same comment must be free. This is what makes an overlapping poll window safe.
create unique index if not exists social_comments_external_uidx
  on public.social_comments (provider, external_comment_id);
create index if not exists social_comments_recent_idx
  on public.social_comments (connection_id, commented_at desc);
-- "Show me this person's history across posts" — the returning-commenter view.
create index if not exists social_comments_commenter_idx
  on public.social_comments (commenter_id, commented_at desc);

-- ── ACTIONS — what we did, and what we are unsure about ─────────────────────────────────────
-- status: pending | sent | failed | uncertain | skipped
--
-- `uncertain` is deliberate and load-bearing. An API call whose outcome we could not establish is
-- NOT a failure to retry — retrying could send a second unsolicited message. It is surfaced for a
-- human instead. This is the honest alternative to claiming exactly-once delivery.
create table if not exists public.comment_actions (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references public.social_comments(id) on delete cascade,
  kind         text not null,
  status       text not null default 'pending',
  -- Why nothing was sent, when nothing was: no_stable_id, already_messaged, own_account,
  -- automation_off. Shown in the Inbox so a skip is explained rather than silent.
  reason       text,
  external_id  text,
  error        text,
  attempted_at timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
-- At most ONE action of each kind per comment. Necessary (it stops a retry double-sending for one
-- comment) but NOT sufficient for the person-level rule — that is social_commenters.dm_sent_at.
create unique index if not exists comment_actions_once_uidx
  on public.comment_actions (comment_id, kind);
create index if not exists comment_actions_attention_idx
  on public.comment_actions (status, created_at desc)
  where status in ('failed', 'uncertain');

-- ── SETTINGS ────────────────────────────────────────────────────────────────────────────────
-- Two independent switches; the STRICTER always wins. Both default FALSE, so a fresh install and a
-- fresh connected account are both silent until somebody deliberately turns them on.
create table if not exists public.comment_automation_settings (
  owner_user_id  uuid primary key references auth.users(id) on delete cascade,
  global_enabled boolean not null default false,
  updated_at     timestamptz not null default now()
);
create table if not exists public.comment_account_settings (
  connection_id  uuid primary key references public.social_connections(id) on delete cascade,
  enabled        boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- ── RLS — same posture as the rest of Social Beast ──────────────────────────────────────────
-- Owner-scoped SELECT for the UI; every write is service-role (the poller and the action runner),
-- so there is no write policy. Matches lead_followup_runs / followup_outbound_intents exactly.
alter table public.comment_rules                enable row level security;
alter table public.comment_reply_variants       enable row level security;
alter table public.social_commenters            enable row level security;
alter table public.social_comments              enable row level security;
alter table public.comment_actions              enable row level security;
alter table public.comment_automation_settings  enable row level security;
alter table public.comment_account_settings     enable row level security;

create policy "owner reads comment_rules" on public.comment_rules
  for select using (owner_user_id = auth.uid());
create policy "owner reads comment_reply_variants" on public.comment_reply_variants
  for select using (exists (select 1 from public.comment_rules r where r.id = rule_id and r.owner_user_id = auth.uid()));
create policy "owner reads social_commenters" on public.social_commenters
  for select using (exists (select 1 from public.social_connections c where c.id = connection_id and c.owner_user_id = auth.uid()));
create policy "owner reads social_comments" on public.social_comments
  for select using (exists (select 1 from public.social_connections c where c.id = connection_id and c.owner_user_id = auth.uid()));
create policy "owner reads comment_actions" on public.comment_actions
  for select using (exists (
    select 1 from public.social_comments sc join public.social_connections c on c.id = sc.connection_id
     where sc.id = comment_id and c.owner_user_id = auth.uid()));
create policy "owner reads comment_automation_settings" on public.comment_automation_settings
  for select using (owner_user_id = auth.uid());
create policy "owner reads comment_account_settings" on public.comment_account_settings
  for select using (exists (select 1 from public.social_connections c where c.id = connection_id and c.owner_user_id = auth.uid()));
