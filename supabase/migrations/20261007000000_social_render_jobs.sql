-- Render-job queue for the dedicated container worker.
--
-- Vercel stays the control plane: it CREATES jobs. The worker only ever claims and completes them,
-- so the heavy render leaves the serverless environment entirely.

create table if not exists public.social_render_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  -- PLATFORM IS PART OF THE JOB, not something to look up later. The overlay is fitted to the
  -- platform's safe area (lib/social/platformSafeArea), so the SAME post rendered for Instagram and
  -- for TikTok produces DIFFERENT MP4s. A job that did not carry its platform could be claimed and
  -- rendered against the wrong one, and the resulting artifact would be silently mis-sized rather
  -- than visibly broken. It is also part of the idempotency key, so the two never collapse onto one
  -- job. Constrained rather than free text: a typo here would quietly create a third "platform".
  platform text not null check (platform in ('instagram', 'tiktok')),
  -- IDEMPOTENCY. One row per (post, render intent): a double-click, a retried HTTP request or a
  -- duplicated queue message all collapse onto the same job instead of rendering (and later
  -- publishing) the same post twice. The caller derives this from the post id + overlay inputs, so
  -- a genuinely NEW render (different headline, different template) gets a different key.
  idempotency_key text not null unique,

  status text not null default 'queued'
    check (status in ('queued','claimed','rendering','succeeded','failed','cancelled')),
  attempt_count int not null default 0,
  max_attempts int not null default 3,

  -- Set while a worker holds the job. A claim that goes stale (worker died mid-render) is
  -- reclaimable once claim_expires_at passes, which is what stops one crash wedging the queue.
  claimed_by text,
  claimed_at timestamptz,
  claim_expires_at timestamptz,

  output_path text,              -- storage path of the finished MP4
  metrics jsonb,                 -- timings/sizes from the render, for cost and regression tracking
  error_message text,
  error_detail jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists social_render_jobs_claimable_idx
  on public.social_render_jobs (status, created_at)
  where status in ('queued','claimed');
create index if not exists social_render_jobs_post_idx on public.social_render_jobs (post_id);

alter table public.social_render_jobs enable row level security;
-- No policies: this table is service-role only. The worker uses the service key; the browser has no
-- business reading or writing the queue directly.

-- Atomically claim the oldest eligible job. SKIP LOCKED means adding workers later needs no change
-- here — two workers can never claim the same row.
create or replace function public.lb_claim_render_job(p_worker text, p_lease_seconds int default 1800)
returns setof public.social_render_jobs
language sql volatile security definer set search_path to 'public' as $$
  update public.social_render_jobs j
  set status = 'claimed', claimed_by = p_worker, claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = j.attempt_count + 1, started_at = coalesce(j.started_at, now()), updated_at = now()
  where j.id = (
    select c.id from public.social_render_jobs c
    where (c.status = 'queued')
       or (c.status = 'claimed' and c.claim_expires_at < now())   -- reclaim a dead worker's lease
    order by c.created_at
    for update skip locked
    limit 1
  )
  and j.attempt_count < j.max_attempts
  returning j.*;
$$;

-- Terminal transition. A job that has exhausted max_attempts stays failed rather than returning to
-- the queue, so a poison job cannot spin forever.
create or replace function public.lb_finish_render_job(
  p_id uuid, p_ok boolean, p_output_path text default null,
  p_metrics jsonb default null, p_error text default null, p_detail jsonb default null)
returns public.social_render_jobs
language sql volatile security definer set search_path to 'public' as $$
  update public.social_render_jobs
  set status = case when p_ok then 'succeeded'
                    when attempt_count >= max_attempts then 'failed'
                    else 'queued' end,
      output_path = coalesce(p_output_path, output_path),
      metrics = coalesce(p_metrics, metrics),
      error_message = case when p_ok then null else p_error end,
      error_detail = case when p_ok then null else p_detail end,
      claimed_by = null, claimed_at = null, claim_expires_at = null,
      finished_at = case when p_ok or attempt_count >= max_attempts then now() else null end,
      updated_at = now()
  where id = p_id
  returning *;
$$;
