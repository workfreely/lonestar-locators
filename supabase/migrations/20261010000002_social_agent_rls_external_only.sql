-- AGENT RLS — narrow "agent" to an EXTERNAL agent, everywhere.
--
-- Stage 1's policies tested `agent_user_id = auth.uid()`. That is true of the ADMIN's own
-- Instagram connection, which carries agent_user_id = owner_user_id (self-assigned when the invite
-- flow was run against his own account). Nothing leaked — the admin's own ALL policy already
-- granted everything these add, and a live probe confirmed his visible counts were unchanged at
-- 111 / 75 / 2 / 1 — but it left "agent" meaning two different things in two different places,
-- which is how the publishing-hold classifier came to count 8 of his posts as agent-owned.
--
-- One definition now: an external agent is someone OTHER than the owner. See
-- lib/social/agentIdentity.ts, which states the same predicate for the TypeScript side.
--
-- STRICTLY NARROWING. Every policy below replaces a stage-1 agent policy with a more restrictive
-- version. No admin policy is touched, and because same-command policies are OR'd, narrowing an
-- agent policy cannot reduce what the admin can see.
--
-- ACCESS IS STILL NOT GRANTED BY THIS PREDICATE. These policies are the last line, not the first:
-- a caller must already hold an authenticated session, be named in the server-side beta allowlist,
-- and own the connection being acted on (requireSocialAgent) before a query is issued at all.

begin;

drop policy if exists "agent reads own connections" on public.social_connections;
create policy "agent reads own connections"
  on public.social_connections for select
  using (
    agent_user_id = auth.uid()
    and agent_user_id is distinct from owner_user_id
  );

drop policy if exists "agent reads shared content" on public.social_content;
create policy "agent reads shared content"
  on public.social_content for select
  using (
    available_to_agents
    and exists (
      select 1 from public.social_connections c
       where c.agent_user_id = auth.uid()
         and c.agent_user_id is distinct from c.owner_user_id
         and c.owner_user_id = social_content.owner_user_id
    )
  );

drop policy if exists "agent reads own posts" on public.social_posts;
create policy "agent reads own posts"
  on public.social_posts for select
  using (
    connection_id is not null
    and exists (
      select 1 from public.social_connections c
       where c.id = social_posts.connection_id
         and c.agent_user_id = auth.uid()
         and c.agent_user_id is distinct from c.owner_user_id
    )
  );

commit;
