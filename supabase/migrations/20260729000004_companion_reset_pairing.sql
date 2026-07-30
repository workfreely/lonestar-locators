-- Reset Pairing (credential rotation) — distinct from Revoke.
--
-- Revoke = retire the device (revoked_at; the device shows "Disconnected").
-- Reset  = invalidate the CURRENT token but keep the device + its history, and
--          require the Mac to pair again (rotating credentials). Used when a
--          token may have leaked, a Mac was restored from backup, or an admin
--          wants to force re-authentication.
--
-- When pairing_reset_at is set, the token guard rejects the current token with
-- code "reset" (→ the Companion clears its Keychain token and prompts to
-- reconnect). Re-pairing REUSES this same row (new token_hash, clears
-- pairing_reset_at), so name / created_at / last_synced_at history is preserved.
alter table public.device_tokens
  add column if not exists pairing_reset_at timestamptz;

comment on column public.device_tokens.pairing_reset_at is
  'Set to force credential rotation: current token becomes invalid (guard returns code "reset"); the device + history are preserved and re-pairing reuses this row.';
