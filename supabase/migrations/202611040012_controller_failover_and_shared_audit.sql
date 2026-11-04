begin;

-- A private heartbeat table avoids publishing frequent presence updates through
-- room_members Realtime. Existing members receive a fresh grace window.
create table if not exists private.room_member_heartbeats (
  member_id uuid primary key references public.room_members(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  last_seen_at timestamptz not null default clock_timestamp()
);

create index if not exists room_member_heartbeats_room_seen_idx
  on private.room_member_heartbeats(room_id, last_seen_at);

revoke all on private.room_member_heartbeats from public, anon, authenticated;

insert into private.room_member_heartbeats (member_id, room_id, last_seen_at)
select m.id, m.room_id, clock_timestamp()
from public.room_members m
where m.membership_status = 'active'
on conflict (member_id) do update
set last_seen_at = excluded.last_seen_at;

-- Called periodically by an authenticated room member. The private timestamp
-- is used only for a server-validated controller takeover.
create or replace function public.api_heartbeat_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_seen_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select m.id into v_member_id
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active';

  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;

  insert into private.room_member_heartbeats (member_id, room_id, last_seen_at)
  values (v_member_id, p_room_id, v_seen_at)
  on conflict (member_id) do update
  set room_id = excluded.room_id,
      last_seen_at = excluded.last_seen_at;

  return jsonb_build_object('ok', true, 'last_seen_at', v_seen_at);
end;
$$;

revoke all on function public.api_heartbeat_room(uuid) from public, anon;
grant execute on function public.api_heartbeat_room(uuid) to authenticated;

-- The current controller can be replaced only when they are no longer an
-- active living member or have not sent a heartbeat for 90 seconds.
create or replace function public.api_takeover_room_control(
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
  v_caller public.room_members%rowtype;
  v_current_host public.room_members%rowtype;
  v_host_seen_at timestamptz;
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
    if v_existing_name <> 'api_takeover_room_control' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_room.id is null or v_room.status not in ('lobby', 'in_progress') then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_AVAILABLE_FOR_TAKEOVER';
  end if;

  select * into v_caller
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active'
    and m.is_bot = false
  for update;

  if v_caller.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;

  if v_room.status = 'in_progress' and not v_caller.is_alive then
    raise exception using errcode = 'P0001', message = 'NOT_ACTIVE_PLAYER';
  end if;

  if v_room.created_by_user_id = v_user_id then
    return jsonb_build_object(
      'ok', true,
      'room_id', p_room_id,
      'controller_member_id', v_caller.id,
      'already_controller', true
    );
  end if;

  select * into v_current_host
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_room.created_by_user_id
  for update;

  if v_current_host.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_CONTROLLER_NOT_FOUND';
  end if;

  select h.last_seen_at into v_host_seen_at
  from private.room_member_heartbeats h
  where h.member_id = v_current_host.id;

  v_host_seen_at := coalesce(v_host_seen_at, v_current_host.last_seen_at, v_current_host.joined_at);

  if v_current_host.membership_status = 'active'
     and v_current_host.is_alive
     and v_host_seen_at > clock_timestamp() - interval '90 seconds' then
    raise exception using errcode = 'P0001', message = 'ROOM_CONTROLLER_STILL_ACTIVE';
  end if;

  update public.room_members
  set technical_role = 'player'
  where room_id = p_room_id and technical_role = 'host';

  update public.room_members
  set technical_role = 'host'
  where id = v_caller.id;

  update public.rooms
  set created_by_user_id = v_user_id,
      updated_at = clock_timestamp()
  where id = p_room_id;

  insert into public.public_game_events (room_id, event_type, public_payload)
  values (
    p_room_id,
    'room_controller_transferred',
    jsonb_build_object(
      'previous_controller_member_id', v_current_host.id,
      'controller_member_id', v_caller.id,
      'controller_name', v_caller.display_name,
      'reason', case
        when v_current_host.membership_status <> 'active' or not v_current_host.is_alive
          then 'controller_inactive'
        else 'controller_heartbeat_expired'
      end
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'room_id', p_room_id,
    'controller_member_id', v_caller.id,
    'controller_name', v_caller.display_name
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_takeover_room_control', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_takeover_room_control(uuid, uuid) from public, anon;
grant execute on function public.api_takeover_room_control(uuid, uuid) to authenticated;

-- If the current controller is expelled, appoint the first remaining human
-- participant. This changes only technical control, never game membership.
create or replace function private.promote_room_controller_after_elimination()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_controller uuid;
  v_next_controller public.room_members%rowtype;
begin
  if old.is_alive is true
     and new.is_alive is false
     and new.user_id is not null then

    select r.created_by_user_id into v_current_controller
    from public.rooms r
    where r.id = new.room_id
    for update;

    if v_current_controller = new.user_id then
      select * into v_next_controller
      from public.room_members m
      where m.room_id = new.room_id
        and m.id <> new.id
        and m.membership_status = 'active'
        and m.is_alive = true
        and m.is_bot = false
        and m.user_id is not null
      order by m.joined_at, m.id
      limit 1
      for update;

      if v_next_controller.id is not null then
        update public.room_members
        set technical_role = 'player'
        where room_id = new.room_id and technical_role = 'host';

        update public.room_members
        set technical_role = 'host'
        where id = v_next_controller.id;

        update public.rooms
        set created_by_user_id = v_next_controller.user_id,
            updated_at = clock_timestamp()
        where id = new.room_id;

        insert into public.public_game_events (room_id, event_type, public_payload)
        values (
          new.room_id,
          'room_controller_transferred',
          jsonb_build_object(
            'previous_controller_member_id', new.id,
            'controller_member_id', v_next_controller.id,
            'controller_name', v_next_controller.display_name,
            'reason', 'controller_eliminated'
          )
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists room_controller_failover_after_elimination on public.room_members;
create trigger room_controller_failover_after_elimination
after update of is_alive on public.room_members
for each row
when (old.is_alive is true and new.is_alive is false)
execute function private.promote_room_controller_after_elimination();

revoke all on function private.promote_room_controller_after_elimination() from public, anon, authenticated;

-- The recovery plan belongs to the surviving team, not to the person who
-- originally created the room. Any surviving human may submit/update it.
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

  select m.id into v_member_id
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
    jsonb_build_object('submitted_by_member_id', v_member_id)
  );

  v_result := jsonb_build_object('ok', true, 'submission_id', v_submission_id, 'status', 'submitted');
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_submit_audit_plan', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_submit_audit_plan(uuid, text, uuid) from public, anon;
grant execute on function public.api_submit_audit_plan(uuid, text, uuid) to authenticated;

-- Any surviving human can finish once the shared recovery plan has been saved.
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

  select m.id into v_member_id
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
    jsonb_build_object('status', 'finished', 'finished_by_member_id', v_member_id)
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
