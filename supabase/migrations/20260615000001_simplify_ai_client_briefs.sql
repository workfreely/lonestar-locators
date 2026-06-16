-- Simplify ai_client_briefs: remove structured fields, add insights[] + last_conversation.
-- The AI now produces max 4 short bullets (insights) and one sentence (last_conversation)
-- instead of repeating structured CRM data already visible in the lead panel.

alter table ai_client_briefs
  drop column if exists looking_for,
  drop column if exists preferences,
  drop column if exists deal_breakers,
  drop column if exists properties_liked,
  drop column if exists properties_disliked,
  drop column if exists approval_notes,
  drop column if exists client_objections,
  drop column if exists current_situation,
  drop column if exists next_action,
  drop column if exists ai_summary;

alter table ai_client_briefs
  add column if not exists insights          jsonb not null default '[]',
  add column if not exists last_conversation text;
