-- Beast Voice — record WHICH phrasing was used and WHICH contact branch was asked for.
--
-- The phrase library supports many wordings for one intent; without these the
-- log cannot show which wordings locators actually reach for, and the grammar
-- would be widened on guesswork rather than evidence.
--
-- requested_method also makes measurable what it costs to leave a spoken
-- "call"/"text" landing on the existing chooser instead of its own branch.
--
-- Additive only: no existing column, policy, index, or CRM object is touched.

alter table public.beast_voice_commands
  -- 'unspecified' | 'call' | 'text'; null for non-contact intents.
  add column if not exists requested_method text,
  -- The ContactPattern id from the phrase library (e.g. 'give-a-call').
  add column if not exists phrase_id text;
