\set ON_ERROR_STOP on
insert into leads (id) values (1);
-- helper to insert a workflow guest card
-- Proof 2: different properties for the same lead can each have one open GC
insert into lead_next_actions (lead_id,title,due_at,priority,property_id,action_key,action_type,origin,status)
  values (1,'Email Guest Card',now(),'high',10,'email_guest_card','workflow','workflow','open');
insert into lead_next_actions (lead_id,title,due_at,priority,property_id,action_key,action_type,origin,status)
  values (1,'Email Guest Card',now(),'high',20,'email_guest_card','workflow','workflow','open');
\echo PROOF2 PASS: two different properties each have one open guest card

-- Proof 1: same lead/property cannot have two open GC
do $$ begin
  insert into lead_next_actions (lead_id,title,due_at,priority,property_id,action_key,action_type,origin,status)
    values (1,'Email Guest Card',now(),'high',10,'email_guest_card','workflow','workflow','open');
  raise exception 'PROOF1 FAIL: duplicate open guest card was allowed';
exception when unique_violation then raise notice 'PROOF1 PASS: duplicate open guest card rejected';
end $$;

-- Proof 3: a completed GC does not block a later new open GC for that property
update lead_next_actions set status='completed', completed=true, completed_at=now()
  where lead_id=1 and property_id=10 and status='open';
insert into lead_next_actions (lead_id,title,due_at,priority,property_id,action_key,action_type,origin,status)
  values (1,'Email Guest Card',now(),'high',10,'email_guest_card','workflow','workflow','open');
\echo PROOF3 PASS: completed guest card did not block a new open one for the same property

-- Constraint: a workflow email_guest_card with NULL property_id is rejected
do $$ begin
  insert into lead_next_actions (lead_id,title,due_at,priority,property_id,action_key,action_type,origin,status)
    values (1,'Email Guest Card',now(),'high',null,'email_guest_card','workflow','workflow','open');
  raise exception 'PROP FAIL: workflow guest card without property_id was allowed';
exception when check_violation then raise notice 'PROP PASS: workflow guest card requires property_id';
end $$;

-- General index still dedups non-guest-card workflow actions (follow_up_1)
insert into lead_next_actions (lead_id,title,due_at,priority,action_key,action_type,origin,status,sequence)
  values (1,'FU1',now(),'medium','follow_up_1','workflow','workflow','open',1);
do $$ begin
  insert into lead_next_actions (lead_id,title,due_at,priority,action_key,action_type,origin,status,sequence)
    values (1,'FU1',now(),'medium','follow_up_1','workflow','workflow','open',1);
  raise exception 'GEN FAIL: duplicate open follow_up_1 was allowed';
exception when unique_violation then raise notice 'GEN PASS: general index still dedups follow_up_1';
end $$;

-- Manual/custom task is exempt (two open custom rows, null key, are allowed)
insert into lead_next_actions (lead_id,title,due_at,priority,action_type,origin,status)
  values (1,'Call the plumber',now(),'low','manual','custom','open');
insert into lead_next_actions (lead_id,title,due_at,priority,action_type,origin,status)
  values (1,'Call the plumber',now(),'low','manual','custom','open');
\echo CUSTOM PASS: manual tasks exempt from workflow dedup
