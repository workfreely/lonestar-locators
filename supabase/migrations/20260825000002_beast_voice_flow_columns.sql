-- Beast Voice — Active Voice Flow telemetry.
--
-- The flow now answers the EXISTING workflow's own questions, so the log needs
-- to record which question was on screen when something was said. Without that,
-- a transcript like "yes" is uninterpretable after the fact.
--
-- activation_live captures transient user activation at the moment a tel:/sms:
-- handoff was triggered. It exists to settle empirically whether a delayed,
-- voice-triggered handoff ever fails to reach the OS, rather than guessing.
--
-- Additive only: no existing column, policy, index, or CRM object is touched.

alter table public.beast_voice_commands
  -- 'choose-method' | 'confirm-call' | 'confirm-text'; null when nothing was on screen.
  add column if not exists workflow_phase text,
  -- True when the triggered action hands off to the OS dialer/messages app.
  add column if not exists handoff_attempted boolean not null default false,
  -- navigator.userActivation.isActive at handoff; null when not applicable.
  add column if not exists activation_live boolean;
