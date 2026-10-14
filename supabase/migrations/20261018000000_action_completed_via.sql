-- HOW an action was completed, not just that it was.
--
-- lead_next_actions.origin records who CREATED a row ("workflow"), which says nothing about who
-- finished it. The Follow-Up Agent can now complete a Contact Lead action by sending and having
-- acknowledged Text 1, and an agent reading their board needs to know that the automation did it
-- rather than being told "Contacted Lead" as though they had picked up the phone.
--
-- NULL = legacy. Every row completed before this column existed has no reliable provenance, and
-- guessing one would be worse than silence: those rows keep their existing accurate labels.

alter table public.lead_next_actions
  add column if not exists completed_via text;

comment on column public.lead_next_actions.completed_via is
  'How the action was completed: ''manual'' (a person) or ''followup_agent'' (an acknowledged automated send). NULL for rows completed before this column existed — legacy, never inferred.';

-- A closed vocabulary, enforced here rather than by convention. NULL stays permitted because
-- legacy rows and open rows both have nothing to say.
alter table public.lead_next_actions
  drop constraint if exists lead_next_actions_completed_via_check;
alter table public.lead_next_actions
  add constraint lead_next_actions_completed_via_check
  check (completed_via is null or completed_via in ('manual', 'followup_agent'));
