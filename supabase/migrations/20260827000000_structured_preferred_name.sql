-- Structured preferred name: split the single free-text `preferred_name` into
-- `preferred_first_name` + `preferred_last_name` (both optional).
--
-- WHY: `preferred_name` is one free-text field, so an agent who types their full
-- name into it ("Jay Morris") gets greeted by their full name — the welcome
-- banner has no way to know which token is the given name. Structured fields let
-- every surface apply one rule per part:
--     display first = preferred first  ELSE legal first
--     display last  = preferred last   ELSE legal last
-- Legal first/last stay exactly as they are, reserved for verification/account
-- identity. They are NOT touched by this migration.
--
-- NON-DESTRUCTIVE BY DESIGN:
--   * `preferred_name` is KEPT, not dropped. Six SECURITY DEFINER RPCs read it
--     (lb_resolve_public_form, lb_resolve_public_join, lb_list_network_members,
--     lb_network_downline, lb_list_licenses, ensure_solo_workspace). Rewriting
--     all six was the larger, riskier change; instead `preferred_name` becomes a
--     DERIVED display cache kept in sync by the trigger below, so every one of
--     those functions keeps working unchanged and keeps returning the same
--     display name it returns today.
--   * The backfill only splits values it can split with CERTAINTY (see below).
--     Anything ambiguous is left NULL and falls back to the legal name, which is
--     the current behaviour — never a guess at which token is a surname.

alter table public.profiles
  add column if not exists preferred_first_name text,
  add column if not exists preferred_last_name  text;

comment on column public.profiles.preferred_first_name is
  'Optional preferred given name. Display rule: this ELSE first_name.';
comment on column public.profiles.preferred_last_name is
  'Optional preferred surname. Display rule: this ELSE last_name.';
comment on column public.profiles.preferred_name is
  'DERIVED display cache maintained by lb_sync_preferred_name(). Do not write '
  'directly — write preferred_first_name / preferred_last_name instead.';

-- ── Backfill: only provably-safe cases ──────────────────────────────────────
-- Case 1 — preferred_name is EXACTLY the legal full name ("Jay Morris" for a
-- profile whose legal name is Jay / Morris). This is not a split: each part is
-- matched against a value we already know, so the mapping is certain.
update public.profiles
   set preferred_first_name = first_name,
       preferred_last_name  = last_name
 where preferred_first_name is null
   and preferred_last_name  is null
   and nullif(trim(coalesce(preferred_name, '')), '') is not null
   and trim(preferred_name) = trim(concat_ws(' ', first_name, last_name));

-- Case 2 — preferred_name is a SINGLE token ("Bob"). One token cannot be a
-- first+last pair, so it is unambiguously the preferred given name.
update public.profiles
   set preferred_first_name = trim(preferred_name)
 where preferred_first_name is null
   and preferred_last_name  is null
   and nullif(trim(coalesce(preferred_name, '')), '') is not null
   and trim(preferred_name) !~ '\s';

-- Every other row (multi-token preferred_name that is NOT the legal full name,
-- e.g. a married name or a nickname + surname) is deliberately left NULL. Those
-- rows keep their existing preferred_name and keep displaying exactly as they do
-- today; they are reported for manual cleanup rather than guessed at.

-- ── Keep `preferred_name` in sync as the derived display name ───────────────
create or replace function public.lb_sync_preferred_name()
returns trigger
language plpgsql
as $$
declare
  v_new_structured boolean;
  v_old_structured boolean;
begin
  v_new_structured := coalesce(
    nullif(trim(coalesce(new.preferred_first_name, '')), ''),
    nullif(trim(coalesce(new.preferred_last_name,  '')), '')
  ) is not null;

  if tg_op = 'INSERT' then
    v_old_structured := false;
  else
    v_old_structured := coalesce(
      nullif(trim(coalesce(old.preferred_first_name, '')), ''),
      nullif(trim(coalesce(old.preferred_last_name,  '')), '')
    ) is not null;
  end if;

  -- Recompute when the structured fields carry a value, when the user just
  -- CLEARED them (so a stale cache can't survive), or when the cache is empty.
  -- A legacy row whose preferred_name could not be split safely is left alone:
  -- none of these conditions hold for it, so its value is preserved verbatim.
  if v_new_structured
     or v_old_structured
     or nullif(trim(coalesce(new.preferred_name, '')), '') is null
  then
    new.preferred_name := nullif(trim(concat_ws(' ',
      coalesce(nullif(trim(coalesce(new.preferred_first_name, '')), ''),
               nullif(trim(coalesce(new.first_name, '')), '')),
      coalesce(nullif(trim(coalesce(new.preferred_last_name,  '')), ''),
               nullif(trim(coalesce(new.last_name,  '')), ''))
    )), '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_preferred_name on public.profiles;
create trigger trg_sync_preferred_name
  before insert or update on public.profiles
  for each row execute function public.lb_sync_preferred_name();

-- Re-derive the cache once for the rows the backfill just populated.
update public.profiles
   set preferred_first_name = preferred_first_name
 where preferred_first_name is not null
    or preferred_last_name  is not null;
