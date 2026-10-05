-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL BEAST — master Auto Posting switch (Instagram worker gate #2).
--
-- The environment flag SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED is a deploy-time kill switch; it
-- requires a redeploy to change and is invisible from the product. This is the OPERATOR's switch:
-- one setting, flipped from the UI, that stops automatic publishing immediately.
--
-- Publishing requires BOTH. Either one off means nothing publishes.
--
-- ── FAIL CLOSED, BY SCHEMA ──────────────────────────────────────────────────────────────────
-- `default 'paused'` is doing real work: a missing row, a brand-new account, and a row created by
-- some future code path that forgets to set the column all resolve to PAUSED. The worker likewise
-- treats a failed read or an unrecognised value as paused. There is no code path where "we could
-- not determine the setting" means "publish".
--
-- ── WHY auto_posting_resumed_at EXISTS ──────────────────────────────────────────────────────
-- Pausing must not delete or rewrite scheduled posts — they stay exactly where they are. But that
-- creates a hazard on resume: two days paused at 9am/7pm is four posts whose scheduled_at has
-- passed, and a worker that simply asks "is it due?" would publish all four back to back.
--
-- So resuming STAMPS the moment it happened, and a post is only eligible if its scheduled_at is at
-- or after that stamp. Anything earlier was missed during the pause: it keeps its row, keeps its
-- schedule, is counted as overdue, and waits for a human to reschedule it. Nothing is deleted and
-- no date is silently rewritten.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create table if not exists public.social_settings (
  owner_user_id            uuid primary key,

  -- 'paused' is the DEFAULT on purpose — see the fail-closed note above.
  auto_posting             text not null default 'paused'
                             check (auto_posting in ('on','paused')),

  -- Set to now() every time auto_posting transitions to 'on'. Null means "never resumed", which
  -- the worker also treats as not-eligible rather than guessing.
  auto_posting_resumed_at  timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.social_settings is
  'Social Beast per-owner settings. auto_posting is the MASTER automatic-publishing switch, checked server-side by the Instagram worker in addition to the SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED env flag. Defaults to paused so an absent row can never mean "publish".';
comment on column public.social_settings.auto_posting_resumed_at is
  'When auto_posting last became ''on''. A due post is only eligible if scheduled_at >= this, so resuming after a pause never publishes the backlog that accumulated while paused.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mirrors social_content/social_posts: platform admin AND owner. Declared here, not left implicit:
-- a table with RLS enabled and no policy accepts writes affecting ZERO rows and reports success.
alter table public.social_settings enable row level security;
drop policy if exists "platform admin owns social settings" on public.social_settings;
create policy "platform admin owns social settings"
  on public.social_settings for all
  using (public.is_platform_admin() and owner_user_id = auth.uid())
  with check (public.is_platform_admin() and owner_user_id = auth.uid());

-- ── The ONLY writer ─────────────────────────────────────────────────────────
-- A SECURITY DEFINER function so the state transition and the resume stamp can never be set
-- independently — stamping resume is what makes the backlog rule work, and a client that could
-- write the columns separately could set 'on' without it.
create or replace function public.sa_set_auto_posting(p_state text)
returns table (auto_posting text, auto_posting_resumed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_state is null or p_state not in ('on','paused') then
    raise exception 'invalid state';
  end if;

  insert into public.social_settings as s (owner_user_id, auto_posting, auto_posting_resumed_at, updated_at)
  values (
    v_uid,
    p_state,
    case when p_state = 'on' then now() else null end,
    now()
  )
  on conflict (owner_user_id) do update
    set auto_posting = excluded.auto_posting,
        -- Re-stamp ONLY on a transition into 'on'. Re-saving 'on' while already on keeps the
        -- original stamp, so a stray double-click cannot quietly make the backlog eligible.
        auto_posting_resumed_at = case
          when excluded.auto_posting = 'on' and s.auto_posting <> 'on' then now()
          when excluded.auto_posting = 'on' then s.auto_posting_resumed_at
          else null
        end,
        updated_at = now();

  return query
    select s.auto_posting, s.auto_posting_resumed_at
      from public.social_settings s
     where s.owner_user_id = v_uid;
end;
$$;

revoke all on function public.sa_set_auto_posting(text) from public, anon;
grant execute on function public.sa_set_auto_posting(text) to authenticated;

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema='public' and table_name='social_settings' order by ordinal_position;
--
-- -- expect 0 rows: no backfill, and an absent row already means paused
-- select count(*) from public.social_settings;
--
-- -- expect exactly one policy
-- select policyname, cmd from pg_policies where schemaname='public' and tablename='social_settings';
