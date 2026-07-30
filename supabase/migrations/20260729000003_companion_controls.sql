-- Companion control-plane fields on device_tokens.
--
--   app_version    — reported by the Companion (User-Agent) each call, so the
--                    Connected Devices UI can show it and we can force updates.
--   last_synced_at — last time this device actually ingested messages (distinct
--                    from last_used_at, which is any contact incl. heartbeats).
--   sync_paused    — an admin/remote kill switch for a SINGLE device; when true
--                    the server rejects its uploads and tells it to pause, with
--                    NO new desktop build required.
alter table public.device_tokens
  add column if not exists app_version    text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_paused    boolean not null default false;

comment on column public.device_tokens.sync_paused is
  'Per-device remote pause. When true the server rejects the device''s uploads and its heartbeat reports paused — used to disable one installed copy without a new build.';
