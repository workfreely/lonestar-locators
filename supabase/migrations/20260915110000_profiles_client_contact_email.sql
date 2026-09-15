-- Dedicated client-facing contact email, separate from the account/login email.
--
-- profiles.email is the agent's Locator Beast account/login email (it also backs
-- the password/login UI). It was being shown to prospects in the confirmation
-- email signature, which is not the address agents want leads contacting.
--
-- client_contact_email is the address shown to leads on client-facing surfaces.
-- Optional: when null, surfaces fall back to the existing behavior. Never used
-- for authentication.
alter table public.profiles add column if not exists client_contact_email text;
