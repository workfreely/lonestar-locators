-- PREPARED, NOT APPLIED. Held back while the Content Posting API audit is under review.
--
-- WHAT THIS IS FOR. A scheduled TikTok post publishes with nobody present, and TikTok's Content
-- Sharing Guidelines put privacy, interaction settings and commercial disclosure in the creator's
-- hands — chosen manually, nothing defaulted. The only compliant way to publish unattended is to
-- REPLAY a decision a person actually made. These three columns are that decision.
--
-- NULL MEANS "NOBODY HAS CHOSEN THIS YET" AND IS NOT A DEFAULT. That is why each concept is one
-- nullable column rather than a set of booleans: "allow no interactions" is a real choice and must
-- be storable, and with three separate booleans it is indistinguishable from "nobody decided".
--
-- WHY THESE COLUMNS DO NOT CONTRADICT THE SUBMITTED AUDIT ANSWER. They hold OUR OWN REQUEST
-- INPUTS — what the creator told us to send. The answer given to TikTok concerns what we persist
-- from Content Posting API RESPONSES (publish_id, status, creator info), and that remains nothing.
-- Applying this file does not change that. It is still held until the audit returns, because
-- changing a schema while reviewers may be testing buys nothing.
--
-- ⚠ THIS FILE IS SELF-TRANSACTING (begin; … commit;). Do NOT rehearse it by wrapping it in an
-- outer `begin` and `rollback` — the commit inside the file ends the outer transaction and the
-- rollback becomes a no-op, which APPLIES the migration. That mistake was made once against
-- production and had to be reverted by hand. To rehearse, strip the begin/commit lines first, or
-- run it against a scratch database.
--
-- APPLY TOGETHER WITH THE CODE THAT READS THEM. The posts PATCH route selects these columns; it
-- will fail against a database that does not have them. Migration and deploy are one change.

begin;

alter table public.social_posts
  add column if not exists tiktok_privacy_level        text,
  add column if not exists tiktok_allowed_interactions text[],
  add column if not exists tiktok_disclosure           text;

comment on column public.social_posts.tiktok_privacy_level is
  'The privacy level the creator explicitly chose for THIS post, as a TikTok API value. NULL means '
  'no choice has been made — never a default. Required before a tiktok_video post may be scheduled.';
comment on column public.social_posts.tiktok_allowed_interactions is
  'The interactions the creator explicitly ALLOWED for this post, a subset of {comment,duet,stitch}. '
  'Stored as the allow-list rather than the API''s disable_* flags so that an empty array reads '
  'unambiguously as "allow none" — a real choice — while NULL means nobody has decided.';
comment on column public.social_posts.tiktok_disclosure is
  'The creator''s commercial content disclosure for this post: none / your_brand / branded_content / '
  'both. "none" is having considered it and declared nothing, which is NOT the same as NULL.';

-- Legal values, enforced here rather than in every caller. NOT NULL is deliberately NOT used:
-- a post without a decision is the normal state for every draft and every Instagram row.
alter table public.social_posts
  drop constraint if exists social_posts_tiktok_privacy_level_chk;
alter table public.social_posts
  add constraint social_posts_tiktok_privacy_level_chk
  check (tiktok_privacy_level is null or tiktok_privacy_level in
    ('PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR','SELF_ONLY'));

alter table public.social_posts
  drop constraint if exists social_posts_tiktok_disclosure_chk;
alter table public.social_posts
  add constraint social_posts_tiktok_disclosure_chk
  check (tiktok_disclosure is null or tiktok_disclosure in
    ('none','your_brand','branded_content','both'));

alter table public.social_posts
  drop constraint if exists social_posts_tiktok_interactions_chk;
alter table public.social_posts
  add constraint social_posts_tiktok_interactions_chk
  check (tiktok_allowed_interactions is null
         or tiktok_allowed_interactions <@ array['comment','duet','stitch']::text[]);

-- ALL THREE OR NONE. A row carrying a privacy level but no disclosure is not a half-made decision
-- to be completed with assumptions — it is an incomplete one, and nothing may read it as a
-- decision. The code refuses partial rows too; this makes the partial row impossible.
alter table public.social_posts
  drop constraint if exists social_posts_tiktok_settings_complete_chk;
alter table public.social_posts
  add constraint social_posts_tiktok_settings_complete_chk
  check (
    (tiktok_privacy_level is null and tiktok_allowed_interactions is null and tiktok_disclosure is null)
    or
    (tiktok_privacy_level is not null and tiktok_allowed_interactions is not null and tiktok_disclosure is not null)
  );

-- ── RE-APPROVAL ON A SETTINGS CHANGE ────────────────────────────────────────────────────────
-- The existing trigger un-approves on RE-RENDER, because approval is of a specific artifact. This
-- extends the same rule to the publishing decision: approval is of "this video, posted this way",
-- so changing how it will be posted un-approves it too.
--
-- CRUCIALLY IT DOES NOT TOUCH render_status. Changing privacy changes no pixels; invalidating the
-- render would discard a good MP4 and force a re-approval of a video nothing happened to. This is
-- the one place that distinction is enforced in the database.
--
-- The `new.approved_at is not distinct from old.approved_at` guard is carried over verbatim from
-- the re-render trigger: it lets an explicit re-approval in the SAME update survive, which is what
-- makes "save settings and approve" a single atomic action rather than a race.
create or replace function public.social_posts_unapprove_on_settings_change()
returns trigger
language plpgsql
as $$
begin
  if new.approved_at is not null
     and old.published_at is null
     and new.approved_at is not distinct from old.approved_at
     and (new.tiktok_privacy_level        is distinct from old.tiktok_privacy_level
          or new.tiktok_allowed_interactions is distinct from old.tiktok_allowed_interactions
          or new.tiktok_disclosure        is distinct from old.tiktok_disclosure) then
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists social_posts_unapprove_on_settings_change_trg on public.social_posts;
create trigger social_posts_unapprove_on_settings_change_trg
  before update on public.social_posts
  for each row
  execute function public.social_posts_unapprove_on_settings_change();

commit;

-- VERIFY AFTER APPLYING:
--   select count(*) from public.social_posts where tiktok_privacy_level is not null;  -- expect 0
--   select conname from pg_constraint where conrelid='public.social_posts'::regclass
--     and conname like 'social_posts_tiktok%';                                        -- expect 4
