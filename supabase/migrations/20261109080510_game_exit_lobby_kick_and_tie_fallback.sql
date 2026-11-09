-- Allow members to leave active online games, allow the host to remove lobby members,
-- and keep a tied ordinary vote from blocking the game flow.
begin;

CREATE OR REPLACE FUNCTION public.api_leave_room(p_room_id uuid, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_room_status text;
  v_member_id uuid;
  v_technical_role text;
  v_state_version bigint;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_leave_room' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select r.status into v_room_status
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room_status is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room_status not in ('lobby', 'in_progress', 'archived', 'finished') then
    raise exception using errcode = 'P0001', message = 'ROOM_CANNOT_BE_LEFT';
  end if;

  select m.id, m.technical_role into v_member_id, v_technical_role
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active'
  for update;
  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;
  if v_technical_role = 'host' and v_room_status = 'lobby' then
    raise exception using errcode = 'P0001', message = 'HOST_MUST_CLOSE_ROOM';
  end if;

  if v_room_status = 'in_progress' then
    -- Mark the leaving participant inactive in the running session.
    -- The existing failover trigger promotes another living human if the host leaves.
    update public.room_members
    set membership_status = 'left',
        is_alive = false,
        last_seen_at = clock_timestamp()
    where id = v_member_id;

    update public.game_sessions
    set state_version = state_version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning state_version into v_state_version;

    update public.public_game_state
    set state_version = coalesce(v_state_version, state_version),
        updated_at = clock_timestamp()
    where room_id = p_room_id;

    insert into public.public_game_events (room_id, event_type, public_payload)
    values (
      p_room_id,
      'member_left_active_game',
      jsonb_build_object('member_id', v_member_id)
    );
  else
    update public.room_members
    set membership_status = 'left',
        last_seen_at = clock_timestamp()
    where id = v_member_id;

    insert into public.public_game_events (room_id, event_type, public_payload)
    values (
      p_room_id,
      'member_left_lobby',
      jsonb_build_object('member_id', v_member_id)
    );
  end if;

  v_result := jsonb_build_object('ok', true, 'room_id', p_room_id, 'status', 'left');
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_leave_room', v_result);

  return v_result;
end;
$function$


revoke all on function public.api_leave_room(uuid, uuid) from public, anon;
grant execute on function public.api_leave_room(uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.api_kick_room_member(p_room_id uuid, p_target_member_id uuid, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_room_status text;
  v_room_owner uuid;
  v_target_id uuid;
  v_target_user_id uuid;
  v_target_role text;
  v_target_name text;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_target_member_id is null or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_kick_room_member' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select r.status, r.created_by_user_id
    into v_room_status, v_room_owner
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room_status is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room_status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'KICK_ONLY_ALLOWED_IN_LOBBY';
  end if;
  if v_room_owner is distinct from v_user_id then
    raise exception using errcode = '42501', message = 'HOST_ONLY';
  end if;

  select m.id, m.user_id, m.technical_role, m.display_name
    into v_target_id, v_target_user_id, v_target_role, v_target_name
  from public.room_members m
  where m.id = p_target_member_id
    and m.room_id = p_room_id
    and m.membership_status = 'active'
  for update;

  if v_target_id is null then
    raise exception using errcode = 'P0001', message = 'KICK_TARGET_NOT_AVAILABLE';
  end if;
  if v_target_role = 'host' or v_target_user_id = v_user_id then
    raise exception using errcode = 'P0001', message = 'CANNOT_KICK_ROOM_HOST';
  end if;

  update public.room_members
  set membership_status = 'left',
      last_seen_at = clock_timestamp()
  where id = v_target_id;

  update public.rooms
  set updated_at = clock_timestamp()
  where id = p_room_id;

  insert into public.public_game_events (room_id, event_type, public_payload)
  values (
    p_room_id,
    'member_kicked_from_lobby',
    jsonb_build_object('member_id', v_target_id, 'display_name', v_target_name)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'room_id', p_room_id,
    'member_id', v_target_id,
    'display_name', v_target_name,
    'status', 'kicked'
  );
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_kick_room_member', v_result);

  return v_result;
end;
$function$


revoke all on function public.api_kick_room_member(uuid, uuid, uuid) from public, anon;
grant execute on function public.api_kick_room_member(uuid, uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.api_resolve_vote(p_room_id uuid, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_session public.game_sessions%rowtype;
  v_state jsonb;
  v_missing integer;
  v_max_votes integer;
  v_tied_count integer;
  v_initial_tied_count integer;
  v_eliminated_id uuid;
  v_eliminated_name text;
  v_is_test boolean;
  v_cancelled boolean := false;
  v_tie_save_applied boolean := false;
  v_tie_no_elimination boolean := false;
  v_modifier_member_id uuid;
  v_modifier_mode text;
  v_new_version bigint;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_resolve_vote' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room
  from public.rooms r
  where r.id = p_room_id and r.created_by_user_id = v_user_id
  for update;
  if v_room.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN_OR_ROOM_NOT_FOUND';
  end if;

  select * into v_session
  from public.game_sessions s
  where s.room_id = p_room_id
  for update;
  if v_session.phase <> 'voting' then
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select p.payload into v_state
  from public.public_game_state p
  where p.room_id = p_room_id
  for update;
  if v_state is null then
    raise exception using errcode = 'P0001', message = 'GAME_STATE_NOT_FOUND';
  end if;

  select coalesce((v_state->>'test_mode')::boolean, false) into v_is_test;
  v_cancelled := coalesce(
    nullif(v_state->>'cancelled_vote_round', '')::integer = v_session.round_number,
    false
  );

  if not v_cancelled then
    select count(*) into v_missing
    from public.room_members m
    where m.room_id = p_room_id
      and m.membership_status = 'active'
      and m.is_alive
      and not m.is_bot
      and not exists (
        select 1
        from public.votes v
        where v.session_id = v_session.id
          and v.round_number = v_session.round_number
          and v.voter_member_id = m.id
      );
    if v_missing > 0 then
      raise exception using errcode = 'P0001', message = 'WAITING_FOR_PLAYER_VOTES';
    end if;

    if nullif(v_state #>> '{action_07_modifier,round}', '')::integer = v_session.round_number then
      v_modifier_member_id := nullif(v_state #>> '{action_07_modifier,member_id}', '')::uuid;
      v_modifier_mode := v_state #>> '{action_07_modifier,mode}';
    end if;

    select max(tally.vote_count) into v_max_votes
    from (
      select
        v.target_member_id,
        count(*)::integer
          + case
              when v_modifier_mode = 'double_vote'
               and bool_or(v.voter_member_id = v_modifier_member_id)
              then 1 else 0
            end as vote_count
      from public.votes v
      where v.session_id = v_session.id
        and v.round_number = v_session.round_number
      group by v.target_member_id
    ) tally;
    if v_max_votes is null then
      raise exception using errcode = 'P0001', message = 'NO_VOTES_CAST';
    end if;

    select count(*) into v_initial_tied_count
    from (
      select v.target_member_id
      from public.votes v
      where v.session_id = v_session.id
        and v.round_number = v_session.round_number
      group by v.target_member_id
      having count(*)::integer
        + case
            when v_modifier_mode = 'double_vote'
             and bool_or(v.voter_member_id = v_modifier_member_id)
            then 1 else 0
          end = v_max_votes
    ) tied;

    if v_modifier_mode = 'tie_save' and v_initial_tied_count > 1 then
      select exists (
        select 1
        from (
          select v.target_member_id
          from public.votes v
          where v.session_id = v_session.id
            and v.round_number = v_session.round_number
          group by v.target_member_id
          having count(*)::integer
            + case
                when v_modifier_mode = 'double_vote'
                 and bool_or(v.voter_member_id = v_modifier_member_id)
                then 1 else 0
              end = v_max_votes
        ) tied
        where tied.target_member_id = v_modifier_member_id
      ) into v_tie_save_applied;
    end if;

    select count(*) into v_tied_count
    from (
      select v.target_member_id
      from public.votes v
      where v.session_id = v_session.id
        and v.round_number = v_session.round_number
      group by v.target_member_id
      having count(*)::integer
        + case
            when v_modifier_mode = 'double_vote'
             and bool_or(v.voter_member_id = v_modifier_member_id)
            then 1 else 0
          end = v_max_votes
    ) tied
    where not (v_tie_save_applied and tied.target_member_id = v_modifier_member_id);

    if v_tied_count > 1 and not v_is_test then
      -- A tied ordinary vote does not remove anyone; the party continues.
      v_tie_no_elimination := true;
    end if;

    if not v_tie_no_elimination then
      select tied.target_member_id into v_eliminated_id
      from (
        select
          v.target_member_id,
          count(*)::integer
            + case
                when v_modifier_mode = 'double_vote'
                 and bool_or(v.voter_member_id = v_modifier_member_id)
                then 1 else 0
              end as vote_count
        from public.votes v
        where v.session_id = v_session.id
          and v.round_number = v_session.round_number
        group by v.target_member_id
      ) tied
      where tied.vote_count = v_max_votes
        and not (v_tie_save_applied and tied.target_member_id = v_modifier_member_id)
      order by random()
      limit 1;

      if v_eliminated_id is null then
        raise exception using errcode = 'P0001', message = 'VOTE_RESULT_NOT_RESOLVED';
      end if;

      select m.display_name into v_eliminated_name
      from public.room_members m
      where m.id = v_eliminated_id;
    end if;
  else
    v_max_votes := 0;
    v_initial_tied_count := 0;
    v_tied_count := 0;
  end if;

  if v_eliminated_id is not null then
    update public.room_members
    set is_alive = false,
        eliminated_in_round = v_session.round_number
    where id = v_eliminated_id
      and room_id = p_room_id;
  end if;

  update public.game_sessions
  set phase = 'elimination',
      deadline_at = null,
      state_version = state_version + 1,
      updated_at = now()
  where id = v_session.id
  returning state_version into v_new_version;

  v_state := (v_state - 'cancelled_vote_round' - 'action_07_modifier')
    || jsonb_build_object(
      'phase', 'elimination',
      'eliminated_member_id', v_eliminated_id,
      'eliminated_name', v_eliminated_name,
      'eliminated_vote_count', v_max_votes,
      'tie_break_used', (v_initial_tied_count > 1),
      'tie_saved', v_tie_save_applied,
      'tie_no_elimination', v_tie_no_elimination,
      'no_elimination', v_cancelled
    );

  update public.public_game_state
  set payload = v_state,
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id,
    v_session.id,
    case
      when v_cancelled then 'vote_cancelled'
      when v_tie_no_elimination then 'vote_tied_no_elimination'
      else 'player_eliminated'
    end,
    jsonb_build_object(
      'member_id', v_eliminated_id,
      'display_name', v_eliminated_name,
      'votes', v_max_votes,
      'tie_break_used', (v_initial_tied_count > 1),
      'tie_saved', v_tie_save_applied,
      'tie_no_elimination', v_tie_no_elimination,
      'no_elimination', v_cancelled,
      'round', v_session.round_number
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'eliminated_member_id', v_eliminated_id,
    'eliminated_name', v_eliminated_name,
    'votes', v_max_votes,
    'tie_break_used', (v_initial_tied_count > 1),
    'tie_saved', v_tie_save_applied,
    'tie_no_elimination', v_tie_no_elimination,
    'no_elimination', v_cancelled
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_resolve_vote', v_result);

  return v_result;
end;
$function$


revoke all on function public.api_resolve_vote(uuid, uuid) from public, anon;
grant execute on function public.api_resolve_vote(uuid, uuid) to authenticated;

commit;
