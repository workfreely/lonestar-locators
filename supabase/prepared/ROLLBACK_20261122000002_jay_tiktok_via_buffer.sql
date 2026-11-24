-- UNDO the Buffer routing on Jay's two TikTok destinations.
--
-- Clearing the two columns returns each row to the native worker: isBufferRouted() goes false, so
-- /api/cron/social-tiktok-publish claims it again and /api/cron/social-buffer-publish stops.
--
-- WHAT THIS DOES NOT UNDO, and must not be mistaken for a full reversal: a post that Buffer has
-- already published is published. TikTok holds it, the row records published_at, and nothing here
-- retracts it. This rollback only changes where FUTURE posts leave from.
--
-- WHAT THE NATIVE ROUTE WILL FIND when it takes these rows back: an expired token on both (see
-- section 6 of the forward migration). They will report "reconnect needed" and publish nothing
-- until someone reconnects by hand. That is the state they were in before the mapping, not a new
-- fault — but it means this rollback restores the dashboard warning along with the native route.
begin;

update public.social_connections
   set buffer_account_id = null,
       buffer_channel_id = null,
       updated_at        = now()
 where provider = 'tiktok'
   and owner_user_id = 'c567c077-d3f4-4532-8807-a54795f753f5'
   and id in (
     '1b5e4878-06b7-47ea-b9e2-73a11aa44e83',
     'ebf475cf-cb0c-4c6b-8af2-99e89c84bc65'
   );

-- The Buffer ACCOUNT row and its stored key are deliberately left in place: they are Lisette's
-- neighbours in the same table and nothing about them is specific to this mapping. Remove the key
-- separately, and only if the Buffer trial itself is being abandoned.

commit;
