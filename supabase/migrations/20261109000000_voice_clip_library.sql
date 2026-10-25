-- ============================================================================
-- SOCIAL BEAST VOICE CLIP LIBRARY — metadata and loudness
-- ============================================================================
-- social_voice_clips carried exactly enough to play a file: a name, a type and
-- a storage path. Importing 58 recordings organised by market, category and
-- price needs somewhere to put that, and the loudness work needs somewhere to
-- record what was measured and what was produced.
--
-- EVERY COLUMN IS ADDITIVE AND NULLABLE. The four rows already in the table
-- keep working untouched — a null market reads as "unclassified", which is
-- exactly what those test clips are.
--
-- NOTHING HERE DELETES, RENAMES OR BACKFILLS. The originals stay in storage
-- exactly as uploaded; normalized_storage_path points at a SEPARATE object, so
-- the recording and its derivative both exist and either can be re-made from
-- the other's absence.

alter table public.social_voice_clips
  -- ── WHAT THE CLIP IS ────────────────────────────────────────────────────
  add column if not exists original_filename text,
  add column if not exists display_name text,
  add column if not exists market text,
  add column if not exists category text,
  add column if not exists property_type text,
  -- Monthly rent the script names, in whole dollars. NULL = the clip makes no
  -- price claim, which is different from a claim of zero.
  add column if not exists price_point integer,
  add column if not exists cta_keyword text,

  -- ── WHAT WAS MEASURED, AND WHAT CAME OUT ────────────────────────────────
  -- Both sides are kept. The "before" is why a clip was processed the way it
  -- was; the "after" is proof the processing did what it claimed.
  add column if not exists lufs_original numeric(6,2),
  add column if not exists tp_original numeric(6,2),
  add column if not exists lufs_normalized numeric(6,2),
  add column if not exists tp_normalized numeric(6,2),
  add column if not exists duration_original numeric(8,3),
  -- Speech boundaries, measured at import. NOT used to trim anything today —
  -- a test render showed trimming made the finished video worse, because the
  -- CTA is anchored near the end and shortening clips just moves silence into
  -- the middle. They are stored so the renderer can one day place a CTA
  -- relative to where the hook actually STOPS rather than to the file's end.
  add column if not exists speech_start_seconds numeric(8,3),
  add column if not exists speech_end_seconds numeric(8,3),

  -- ── PROCESSING ──────────────────────────────────────────────────────────
  add column if not exists normalized_storage_path text,
  add column if not exists compression_applied boolean,
  add column if not exists processing_status text,
  -- Non-empty ⇒ a person must look before this clip is usable. The importer
  -- writes a reason here rather than guessing at an ambiguous filename.
  add column if not exists review_notes text[],

  -- ── WHAT THE RECORDING ACTUALLY SAYS ────────────────────────────────────
  -- The tier below is decided by this, not by which folder the file sat in.
  -- A folder was the wrong signal and produced a real bug: a recording saying
  -- "I just helped my client get an amazing deal on THIS apartment" lived in
  -- 01_Hooks and was therefore treated as an ordinary hook, compatible with
  -- every property in the catalog.
  --
  -- NULL means not transcribed yet, which is NOT a reason to refuse a clip —
  -- 57 of the 58 are untranscribed and blocking them empties the library.
  add column if not exists transcript text,
  add column if not exists transcript_status text,
  -- universal | conditional | property_specific
  add column if not exists eligibility text,
  -- What a person must confirm before a conditional clip may be used.
  add column if not exists requires text[];

-- Constrained to the vocabularies the application already owns, so a typo
-- cannot create a seventh market or a category nothing renders.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_voice_clips_market_check') then
    alter table public.social_voice_clips
      add constraint social_voice_clips_market_check
      check (market is null or market in ('SATX','DAL','HOU','GENERAL'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_voice_clips_category_check') then
    alter table public.social_voice_clips
      add constraint social_voice_clips_category_check
      check (category is null or category in
        ('conversational_hook','social_proof','best_deals','luxury_lifestyle','price_hook','call_to_action'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_voice_clips_cta_keyword_check') then
    alter table public.social_voice_clips
      add constraint social_voice_clips_cta_keyword_check
      check (cta_keyword is null or cta_keyword in ('LIST','TOWN','LOFT','RISE','HOME','KEY'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_voice_clips_eligibility_check') then
    alter table public.social_voice_clips
      add constraint social_voice_clips_eligibility_check
      check (eligibility is null or eligibility in ('universal','conditional','property_specific'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_voice_clips_transcript_status_check') then
    alter table public.social_voice_clips
      add constraint social_voice_clips_transcript_status_check
      check (transcript_status is null or transcript_status in ('confirmed','missing','uncertain'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_voice_clips_processing_status_check') then
    alter table public.social_voice_clips
      add constraint social_voice_clips_processing_status_check
      check (processing_status is null or processing_status in ('pending','normalized','failed','review'));
  end if;
end $$;

-- RE-IMPORT MUST NOT DUPLICATE. The importer is expected to be run more than
-- once — a failed batch, a corrected filename, a re-measure — so the natural
-- key is enforced here rather than trusted to the script.
--
-- DELIBERATELY NOT A PARTIAL INDEX. The obvious form of this would carry
-- `where original_filename is not null`, and it would break the importer:
-- PostgREST's upsert emits `on conflict (user_id, original_filename) do update`
-- with no index predicate, and Postgres can only infer a PARTIAL index when the
-- statement repeats that predicate. The upsert would fail outright with "no
-- unique or exclusion constraint matching the ON CONFLICT specification".
--
-- A plain index costs nothing here: NULLs are distinct in a unique index, so the
-- four pre-existing test rows — which have no original_filename — still do not
-- collide with each other or with anything the importer writes.
create unique index if not exists social_voice_clips_user_original_filename_key
  on public.social_voice_clips (user_id, original_filename);

create index if not exists social_voice_clips_market_category_idx
  on public.social_voice_clips (market, category);

comment on column public.social_voice_clips.price_point is
  'Monthly rent in whole dollars that this clip SAYS OUT LOUD. A clip may only be paired with a property whose verified starting rent supports the claim; NULL means the clip makes no price claim at all.';
comment on column public.social_voice_clips.review_notes is
  'Why a person must look at this clip before it is used — an ambiguous market, an unreadable price, a CTA naming no property type. Empty or null means the filename was unambiguous.';
comment on column public.social_voice_clips.normalized_storage_path is
  'The −16 LUFS derivative. The ORIGINAL at storage_path is never modified or replaced.';


-- ============================================================================
-- THE FEATURED PROPERTY TYPE, PER VIDEO
-- ============================================================================
-- property_catalog.property_type is NULL on all 4,204 rows, and inventory_type
-- says 'townhome_loft' on 523 of them — two different CTA keywords (TOWN and
-- LOFT) behind one value. Neither can drive a type-specific claim.
--
-- Rather than write a guess back into the catalog, the choice lives on the POST:
-- this video features a townhome, that one features a loft, and the catalog is
-- left alone. Null means "not stated", which is what it has always meant.
alter table public.social_posts
  add column if not exists featured_property_type text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_posts_featured_property_type_check') then
    alter table public.social_posts
      add constraint social_posts_featured_property_type_check
      check (featured_property_type is null or featured_property_type in
        ('Apartment','Townhome','Loft','High-Rise','Rental Home','Penthouse'));
  end if;
end $$;

comment on column public.social_posts.featured_property_type is
  'The property type THIS video features, when the catalog cannot say. Set in the editor, saved with the draft, used to pick a type-specific CTA. Never written back to property_catalog.';
