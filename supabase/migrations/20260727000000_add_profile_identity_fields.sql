-- Account Profile redesign: split legal identity from the display name and
-- add the license number used on generated documents.
--
-- first_name / last_name already exist and now hold the LEGAL name (used for
-- account verification / identity). preferred_name is the name shown
-- throughout Locator Beast (guest cards, email/SMS/AI templates, dashboard,
-- activity feed, etc.). license_number is surfaced on guest cards and other
-- generated documents. profile_photo_url already exists (branding bucket).

alter table public.profiles
  add column if not exists preferred_name text,
  add column if not exists license_number text;
