-- Recommendation VIEW notifications — reuse the existing view/session system.
--
-- Step 0 made view recording reliable (browser beacon -> awaited RPC). This adds the agent-facing
-- half WITHOUT a second tracking system: the same lb_record_client_share_view keeps owning
-- sessionization, and now also reports whether THIS call opened a new session and whether the agent
-- should be told. The route only sends the email.
--
-- Deciding the cooldown inside the function (rather than in the route) is deliberate: the stamp and
-- the decision happen in one statement, so two concurrent opens cannot both pass the 6-hour check
-- and send two emails.

-- The smallest possible persisted state for the cooldown. No notification-history table.
alter table public.client_recommendation_shares
  add column if not exists last_view_notification_at timestamptz;

comment on column public.client_recommendation_shares.last_view_notification_at is
  'When the agent was last emailed about a client view of THIS share. Drives the 6-hour repeat-view cooldown; null until the first notification.';

-- The return type changes from void, so the old signature must go first.
drop function if exists public.lb_record_client_share_view(text);

create or replace function public.lb_record_client_share_view(p_token_hash text)
returns table (
  should_notify     boolean,
  is_first_view     boolean,
  client_first_name text,
  locator_email     text,
  lead_id           bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share_id    uuid;
  v_lead_id     bigint;
  v_workspace   uuid;
  v_owner       uuid;
  v_first_name  text;
  v_last_id     bigint;
  v_last        timestamptz;
  v_first_seen  timestamptz;
  v_last_notif  timestamptz;
  v_new_session boolean := false;
  v_is_first    boolean := false;
  v_should      boolean := false;
  v_email       text;
begin
  -- Unchanged gate: a revoked or disabled share records nothing and notifies nobody.
  select s.id, s.lead_id, s.workspace_id, s.first_viewed_at, s.last_view_notification_at
    into v_share_id, v_lead_id, v_workspace, v_first_seen, v_last_notif
    from public.client_recommendation_shares s
   where s.token_hash = p_token_hash and s.revoked_at is null and s.disabled_at is null
   limit 1;
  if v_share_id is null then return; end if;

  -- ── SESSIONIZATION — byte-for-byte the behaviour Step 0 verified ───────────
  select v.id, v.last_seen_at into v_last_id, v_last
    from public.client_recommendation_share_views v
   where v.share_id = v_share_id
   order by v.last_seen_at desc limit 1;

  if v_last is not null and v_last > now() - interval '30 minutes' then
    -- Same session: a refresh. Extends the window, never a new view, never a notification.
    update public.client_recommendation_share_views
       set last_seen_at = now(), hit_count = hit_count + 1
     where id = v_last_id;
  else
    v_new_session := true;
    insert into public.client_recommendation_share_views (share_id) values (v_share_id);
    update public.client_recommendation_shares
       set view_session_count = view_session_count + 1
     where id = v_share_id;
  end if;

  update public.client_recommendation_shares
     set last_viewed_at  = now(),
         first_viewed_at = coalesce(first_viewed_at, now())
   where id = v_share_id;

  -- ── NOTIFICATION DECISION — only ever on a NEW SESSION ─────────────────────
  if v_new_session then
    -- first_viewed_at was read BEFORE the stamp above, so null here means first ever.
    v_is_first := v_first_seen is null;
    -- First view always tells the agent. A repeat visit waits out the 6-hour cooldown, so a
    -- client flicking back and forth across an afternoon produces one email, not five.
    v_should := v_is_first
             or v_last_notif is null
             or v_last_notif < now() - interval '6 hours';

    if v_should then
      -- Stamped here, inside the same transaction as the decision, so a concurrent open cannot
      -- also read a stale last_view_notification_at and send a second email.
      update public.client_recommendation_shares
         set last_view_notification_at = now()
       where id = v_share_id;
    end if;

    select l.owner_user_id, nullif(btrim(l.first_name), '')
      into v_owner, v_first_name
      from public.leads l where l.id = v_lead_id limit 1;

    -- ONE timeline event per SESSION (never per hit/refresh), mirroring how
    -- lb_client_resume_search already records a client-driven event from a definer function.
    insert into public.lead_timeline (lead_id, type, metadata, occurred_at, workspace_id, owner_user_id)
    values (
      v_lead_id,
      'recommendations_viewed',
      jsonb_build_object('shareId', v_share_id, 'firstView', v_is_first),
      now(), v_workspace, v_owner
    );

    select p.email into v_email from public.profiles p where p.id = v_owner limit 1;
  end if;

  return query select v_should, v_is_first, v_first_name, v_email, v_lead_id;
end $$;

-- Same grants as before: the public page (anon) is the caller.
grant execute on function public.lb_record_client_share_view(text) to anon, authenticated;
