-- Independent FALLBACK image slot for property_catalog.
-- The PRIMARY slot (property_image_url) stays governed by image_selection_state; this adds a
-- symmetric, independently-locked FALLBACK slot (property_image_url_backup already exists) so a
-- property with an existing LOCKED Primary can still have its Fallback gap-filled — WITHOUT ever
-- making the Primary writable. Each slot's populated URL can only be replaced via its own
-- change_requested state. Additive + idempotent.

alter table public.property_catalog
  add column if not exists image_backup_state text not null default 'missing',
  add column if not exists property_image_backup_source text,
  add column if not exists property_image_backup_source_detail text,
  add column if not exists property_image_backup_status text,
  add column if not exists property_image_backup_verified_at timestamptz,
  add column if not exists property_image_backup_checked_at timestamptz;

comment on column public.property_catalog.image_backup_state is
  'FALLBACK slot lock (keep|change_requested|missing), independent of image_selection_state. keep = populated & locked; missing = empty & fillable; change_requested = explicit authorized replacement.';

-- Lock the ~5 rows that already have a backup image so gap-fill can never overwrite them.
update public.property_catalog
  set image_backup_state = 'keep'
  where property_image_url_backup is not null and property_image_url_backup <> ''
    and image_backup_state <> 'keep';

-- Guard the allowed values.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_image_backup_state_chk') then
    alter table public.property_catalog
      add constraint property_catalog_image_backup_state_chk
      check (image_backup_state in ('keep','change_requested','missing'));
  end if;
end $$;
