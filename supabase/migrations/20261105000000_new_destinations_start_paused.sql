-- NEW PUBLISHING DESTINATIONS START PAUSED.
--
-- THE PROBLEM. computeAutopilotPlan selects EVERY row of social_connections and builds a rotation
-- rule for each one, enabling any where:
--
--     isPlannableConnection(...) && c.posting_paused !== true
--
-- and posting_paused is `not null default false`. A freshly authorized destination therefore
-- arrives already eligible for the rotation — nothing has to be switched on for it to start
-- receiving scheduled posts. Today that is masked by the global auto_posting switch sitting at
-- 'paused', which is protection by coincidence of state, not by design: resuming auto-posting
-- would enrol every connected account at once, including one connected minutes earlier purely to
-- test something.
--
-- THE FIX IS THE COLUMN DEFAULT, not a statement in the RPCs, and that is deliberate.
-- Both connect paths INSERT without naming posting_paused:
--
--   sa_connect_instagram                 (owner_user_id, provider, external_account_id, username,
--                                         account_type, status, scopes, token_secret_id,
--                                         token_expires_at, updated_at)
--   sa_consume_destination_invitation    (… the same, plus label, agent_user_id)
--
-- so the default is what governs them, and it governs any future path too — including one written
-- by someone who has never read this file. A `posting_paused = true` added to each INSERT would
-- protect exactly the two call sites we happen to know about today.
--
-- It is also RACE-FREE in a way a follow-up UPDATE from the callback route is not. The row would
-- otherwise exist and be plannable for the window between the INSERT committing and the route's
-- UPDATE landing, and the Autopilot planner runs on a cron that does not care how short that
-- window is.
--
-- EXISTING ROWS ARE NOT TOUCHED. `alter column … set default` changes what future INSERTs receive
-- and rewrites nothing: no table rewrite, no backfill, no lock beyond a brief catalog update.
-- @realestatepro_tx keeps posting_paused = false and keeps publishing exactly as it does now.
-- The reconnect/UPDATE branches of both RPCs already omit posting_paused from their SET lists, so
-- re-authorizing an account still cannot reset its pause state in either direction.
--
-- THE TRADE-OFF, stated plainly: the FIRST destination someone connects now also arrives paused,
-- and they must press Resume before it will publish. That is a visible, reversible, one-click
-- surprise. The alternative failure — a test account silently joining a live posting rotation — is
-- neither visible nor reversible, because by the time anyone notices, something has been published.
--
-- APPLIES TO TIKTOK TOO. sa_connect_tiktok inserts into the same table without naming the column,
-- so a newly connected TikTok destination starts paused as well. That is the same safeguard for the
-- same reason, and is intended rather than incidental.

alter table public.social_connections
  alter column posting_paused set default true;

comment on column public.social_connections.posting_paused is
  'Per-destination publishing pause. DEFAULTS TO TRUE so a newly authorized account cannot enter the Autopilot rotation before someone deliberately resumes it (see migration 20261105000000). Existing rows were not modified. Both connect RPCs omit this column from their INSERT and from their reconnect UPDATE, so the default governs new rows and a reconnect never changes an established one.';
