begin;

-- Hotfix: discard the acting player's own Vulnerability card.
-- The action card becomes public; a hidden Vulnerability remains hidden.
update public.card_catalog
set effect_handler_id = 'hotfix_discard_own_vulnerability',
    effect_status = 'approved'
where card_id = 'action_04'
  and category = 'actions'
  and catalog_version = 'v1';

create or replace function public.api_use_hotfix_card(
  p_room_id uuid,
  p_action_card_instance_id uuid,
  p_vulnerability_card_instance_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_session public.game_sessions%rowtype;
  v_member_id uuid;
  v_member_name text;
  v_action_card public.card_instances%rowtype;
  v_vulnerability public.card_instances%rowtype;
  v_state jsonb;
  v_new_version bigint;
  v_result jsonb;
  v_existing jsonb;
  v_existing_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;

  if p_room_id is null
     or p_action_card_instance_id is null
     or p_vulnerability_card_instance_id is null
     or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if v_existing_name <> 'api_use_hotfix_card' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select *
    into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_room.id is null or v_room.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'GAME_NOT_ACTIVE';
  end if;

  select *
    into v_session
  from public.game_sessions s
  where s.room_id = p_room_id
  for update;

  if v_session.id is null
     or v_session.status <> 'active'
     or v_session.phase in ('lobby', 'audit', 'gameover') then
    raise exception using errcode = 'P0001', message = 'ACTION_WINDOW_CLOSED';
  end if;

  select m.id, m.display_name
    into v_member_id, v_member_name
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active'
    and m.is_alive = true
    and m.is_bot = false
  for update;

  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ACTIVE_PLAYER';
  end if;

  select ci.*
    into v_action_card
  from public.card_instances ci
  join public.card_catalog cc
    on cc.card_id = ci.card_id
   and cc.catalog_version = ci.catalog_version
  where ci.id = p_action_card_instance_id
    and ci.session_id = v_session.id
    and ci.room_id = p_room_id
    and ci.owner_member_id = v_member_id
    and ci.zone = 'hand'
    and ci.card_id = 'action_04'
    and cc.category = 'actions'
    and cc.effect_status = 'approved'
    and cc.effect_handler_id = 'hotfix_discard_own_vulnerability'
  for update of ci;

  if v_action_card.id is null then
    raise exception using errcode = 'P0001', message = 'ACTION_CARD_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from public.game_action_uses u
    where u.session_id = v_session.id
      and u.card_instance_id = v_action_card.id
  ) then
    raise exception using errcode = 'P0001', message = 'ACTION_ALREADY_USED';
  end if;

  select ci.*
    into v_vulnerability
  from public.card_instances ci
  join public.card_catalog cc
    on cc.card_id = ci.card_id
   and cc.catalog_version = ci.catalog_version
  where ci.id = p_vulnerability_card_instance_id
    and ci.session_id = v_session.id
    and ci.room_id = p_room_id
    and ci.owner_member_id = v_member_id
    and ci.zone = 'hand'
    and cc.category = 'vulnerabilities'
  for update of ci;

  if v_vulnerability.id is null then
    raise exception using errcode = 'P0001', message = 'VULNERABILITY_CARD_NOT_AVAILABLE';
  end if;

  select p.payload
    into v_state
  from public.public_game_state p
  where p.room_id = p_room_id
  for update;

  if v_state is null then
    raise exception using errcode = 'P0001', message = 'GAME_STATE_NOT_FOUND';
  end if;

  -- Preserve the action as a public revealed card and send the Vulnerability
  -- to discard without exposing its id when it was previously hidden.
  update public.card_instances
  set instance_status = 'revealed',
      revealed_at = coalesce(revealed_at, now()),
      revealed_by_member_id = coalesce(revealed_by_member_id, v_member_id)
  where id = v_action_card.id;

  update public.card_instances
  set zone = 'discard',
      owner_member_id = null
  where id = v_vulnerability.id;

  insert into public.game_action_uses (
    session_id, room_id, actor_member_id, card_instance_id,
    action_id, effect_id, result_payload
  )
  values (
    v_session.id, p_room_id, v_member_id, v_action_card.id,
    'action_04', 'hotfix_discard_own_vulnerability',
    jsonb_build_object(
      'discarded_vulnerability_card_id', v_vulnerability.card_id,
      'was_revealed', v_vulnerability.instance_status = 'revealed'
    )
  );

  update public.game_sessions
  set state_version = state_version + 1,
      updated_at = now()
  where id = v_session.id
  returning state_version into v_new_version;

  update public.public_game_state
  set payload = jsonb_set(
        payload,
        '{used_action_cards}',
        coalesce(payload->'used_action_cards', '[]'::jsonb)
          || jsonb_build_array(v_action_card.id::text),
        true
      ),
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (
    room_id, session_id, event_type, public_payload
  )
  values (
    p_room_id,
    v_session.id,
    'action_card_used',
    jsonb_build_object(
      'action_id', 'action_04',
      'effect_id', 'hotfix_discard_own_vulnerability',
      'card_instance_id', v_action_card.id,
      'actor_member_id', v_member_id,
      'actor_name', v_member_name,
      'round', v_session.round_number,
      'phase', v_session.phase
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'action_id', 'action_04',
    'effect_id', 'hotfix_discard_own_vulnerability',
    'card_instance_id', v_action_card.id,
    'discarded_vulnerability_card_id', v_vulnerability.card_id,
    'vulnerability_was_revealed', v_vulnerability.instance_status = 'revealed',
    'state_version', v_new_version
  );

  insert into public.command_receipts (
    user_id, command_id, command_name, response_json
  )
  values (
    v_user_id, p_command_id, 'api_use_hotfix_card', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.api_use_hotfix_card(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.api_use_hotfix_card(uuid, uuid, uuid, uuid) to authenticated;

commit;
