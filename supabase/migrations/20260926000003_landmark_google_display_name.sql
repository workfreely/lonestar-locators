-- Preserve the curated human-facing landmark name while storing Google's canonical
-- displayName separately (resolver writes this; `name` stays the curated label). Additive.
alter table public.location_landmarks add column if not exists google_display_name text;
comment on column public.location_landmarks.google_display_name is
  'Google canonical displayName captured at resolution. Curated human-facing name lives in name.';
