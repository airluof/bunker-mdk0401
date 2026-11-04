begin;

-- Private schemas are not exposed through the Data API, but RLS is still
-- enabled as defense in depth for the heartbeat table.
alter table private.room_member_heartbeats enable row level security;
revoke all on private.room_member_heartbeats from public, anon, authenticated;

-- In a test room only, the technical host may finish the simulation even if
-- bots eliminated their player. This is a QA control, not a regular-game rule.
create or replace function public.api_submit_audit_plan(
  p_room_id uuid,
  p_plan_text text,
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
  v_is_alive boolean;
  v_submission_id uuid;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_command_id is null
     or p_plan_text is null or char_length(btrim(p_plan_text)) < 20
     or char_length(p_plan_text) > 12000 then
    raise exception using errcode = '22023', message = 'AUDIT_PLAN_INVALID';
  end if;

  select cr.response_json, cr.command_name into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_submit_audit_plan' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room
  from public.rooms r
  where r.id = p_room_id and r.status = 'in_progress'
  for update;
  if v_room.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;

  select * into v_session
  from public.game_sessions s
  where s.room_id = p_room_id
  for update;
  if v_session.phase <> 'audit' then
    raise exception using errcode = 'P0001', message = 'AUDIT_NOT_OPEN';
  end if;

  select m.id, m.is_alive into v_member_id, v_is_alive
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active'
    and m.is_bot = false
  for update;

  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;

  if not v_is_alive
     and not (
       v_room.room_mode = 'test'
       and v_room.created_by_user_id = v_user_id
     ) then
    raise exception using errcode = 'P0001', message = 'NOT_ACTIVE_PLAYER';
  end if;

  select a.id into v_submission_id
  from public.audit_submissions a
  where a.session_id = v_session.id
  for update;

  if v_submission_id is null then
    insert into public.audit_submissions (
      session_id, room_id, submitted_by_member_id, submission_payload, status
    )
    values (
      v_session.id, p_room_id, v_member_id,
      jsonb_build_object('plan_text', btrim(p_plan_text)), 'submitted'
    )
    returning id into v_submission_id;
  else
    update public.audit_submissions
    set submitted_by_member_id = v_member_id,
        submission_payload = jsonb_build_object('plan_text', btrim(p_plan_text)),
        status = 'submitted',
        updated_at = clock_timestamp()
    where id = v_submission_id;
  end if;

  update public.game_sessions
  set state_version = state_version + 1, updated_at = clock_timestamp()
  where id = v_session.id
  returning state_version into v_new_version;

  update public.public_game_state
  set payload = payload || jsonb_build_object('audit_plan_submitted', true),
      state_version = v_new_version,
      updated_at = clock_timestamp()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id,
    v_session.id,
    'audit_plan_submitted',
    jsonb_build_object(
      'submitted_by_member_id', v_member_id,
      'test_moderator_override', (not v_is_alive)
    )
  );

  v_result := jsonb_build_object('ok', true, 'submission_id', v_submission_id, 'status', 'submitted');
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_submit_audit_plan', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_submit_audit_plan(uuid, text, uuid) from public, anon;
grant execute on function public.api_submit_audit_plan(uuid, text, uuid) to authenticated;

create or replace function public.api_finish_game(
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
  v_session public.game_sessions%rowtype;
  v_member_id uuid;
  v_is_alive boolean;
  v_has_plan boolean;
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
    if v_existing_name <> 'api_finish_game' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room
  from public.rooms r
  where r.id = p_room_id and r.status = 'in_progress'
  for update;
  if v_room.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;

  select * into v_session
  from public.game_sessions s
  where s.room_id = p_room_id
  for update;
  if v_session.phase <> 'audit' then
    raise exception using errcode = 'P0001', message = 'AUDIT_NOT_OPEN';
  end if;

  select m.id, m.is_alive into v_member_id, v_is_alive
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active'
    and m.is_bot = false
  for update;
  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;

  if not v_is_alive
     and not (
       v_room.room_mode = 'test'
       and v_room.created_by_user_id = v_user_id
     ) then
    raise exception using errcode = 'P0001', message = 'NOT_ACTIVE_PLAYER';
  end if;

  select exists (
    select 1 from public.audit_submissions a
    where a.session_id = v_session.id and a.status = 'submitted'
  ) into v_has_plan;
  if not v_has_plan then
    raise exception using errcode = 'P0001', message = 'AUDIT_PLAN_REQUIRED';
  end if;

  update public.game_sessions
  set status = 'finished',
      phase = 'gameover',
      deadline_at = null,
      state_version = state_version + 1,
      updated_at = clock_timestamp()
  where id = v_session.id
  returning state_version into v_new_version;

  update public.rooms
  set status = 'finished', updated_at = clock_timestamp()
  where id = p_room_id;

  update public.public_game_state
  set payload = payload || jsonb_build_object('status', 'finished', 'phase', 'gameover'),
      state_version = v_new_version,
      updated_at = clock_timestamp()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id,
    v_session.id,
    'game_finished',
    jsonb_build_object(
      'status', 'finished',
      'finished_by_member_id', v_member_id,
      'test_moderator_override', (not v_is_alive)
    )
  );

  v_result := jsonb_build_object('ok', true, 'status', 'finished', 'phase', 'gameover');
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_finish_game', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_finish_game(uuid, uuid) from public, anon;
grant execute on function public.api_finish_game(uuid, uuid) to authenticated;

commit;
