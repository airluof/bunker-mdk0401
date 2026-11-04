begin;

create or replace function public.api_exit_test_room(
  p_room_id uuid,
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
  v_member public.room_members%rowtype;
  v_test_mode boolean;
  v_version bigint;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;

  select coalesce((payload->>'test_mode')::boolean, false)
    into v_test_mode
  from public.public_game_state
  where room_id = p_room_id;

  if v_room.status <> 'in_progress' or not coalesce(v_test_mode, false) then
    raise exception using errcode = 'P0001', message = 'NOT_A_TEST_GAME';
  end if;

  select * into v_member
  from public.room_members
  where room_id = p_room_id and user_id = v_user_id and membership_status = 'active'
  for update;
  if v_member.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;

  if v_member.technical_role = 'host' then
    if v_room.created_by_user_id <> v_user_id then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;

    update public.rooms set status = 'archived', updated_at = now() where id = p_room_id;
    update public.room_invites set is_active = false, revoked_at = now()
      where room_id = p_room_id and is_active = true;
    update public.game_sessions
      set status = 'finished', phase = 'gameover', state_version = state_version + 1, updated_at = now()
      where room_id = p_room_id returning state_version into v_version;
    update public.public_game_state
      set payload = jsonb_build_object('status', 'archived', 'phase', 'gameover', 'test_mode', true),
          state_version = v_version, updated_at = now()
      where room_id = p_room_id;
    update public.room_members set membership_status = 'left', last_seen_at = now()
      where id = v_member.id;
    insert into public.public_game_events (room_id, event_type, public_payload)
      values (p_room_id, 'test_room_closed', jsonb_build_object('member_id', v_member.id));
    v_result := jsonb_build_object('ok', true, 'room_id', p_room_id, 'status', 'archived');
  else
    update public.room_members set membership_status = 'left', last_seen_at = now()
      where id = v_member.id;
    insert into public.public_game_events (room_id, event_type, public_payload)
      values (p_room_id, 'member_left_test_game', jsonb_build_object('member_id', v_member.id));
    v_result := jsonb_build_object('ok', true, 'room_id', p_room_id, 'status', 'left');
  end if;

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
    values (v_user_id, p_command_id, 'api_exit_test_room', v_result);
  return v_result;
end;
$$;

revoke all on function public.api_exit_test_room(uuid, uuid) from public, anon;
grant execute on function public.api_exit_test_room(uuid, uuid) to authenticated;

commit;
