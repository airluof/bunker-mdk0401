-- Allow the room host to remove participants from the lobby or an active session.
begin;

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
  v_round integer;
  v_state_version bigint;
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
  if v_room_status not in ('lobby', 'in_progress') then
    raise exception using errcode = 'P0001', message = 'KICK_NOT_ALLOWED_IN_THIS_ROOM_STATE';
  end if;
  if v_room_owner is distinct from v_user_id
     or not exists (
       select 1
       from public.room_members caller
       where caller.room_id = p_room_id
         and caller.user_id = v_user_id
         and caller.membership_status = 'active'
         and caller.technical_role = 'host'
         and caller.is_bot = false
     ) then
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

  if v_room_status = 'in_progress' then
    select s.round_number into v_round
    from public.game_sessions s
    where s.room_id = p_room_id
    for update;

    update public.room_members
    set membership_status = 'left',
        is_alive = false,
        eliminated_in_round = coalesce(v_round, eliminated_in_round),
        last_seen_at = clock_timestamp()
    where id = v_target_id;

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
      'member_kicked_active_game',
      jsonb_build_object('member_id', v_target_id, 'display_name', v_target_name, 'round', v_round)
    );
  else
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
  end if;

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

commit;
