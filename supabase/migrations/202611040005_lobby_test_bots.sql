begin;

-- Bot entries are roster-only test participants. They have no Auth user.
alter table public.room_members alter column user_id drop not null;
alter table public.room_members add column if not exists is_bot boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'room_members_bot_identity_check'
      and conrelid = 'public.room_members'::regclass
  ) then
    alter table public.room_members
      add constraint room_members_bot_identity_check
      check ((is_bot = true and user_id is null) or (is_bot = false and user_id is not null));
  end if;
end
$$;

grant select (is_bot) on public.room_members to authenticated;

create or replace function public.api_add_test_bots(
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
  v_active_count integer;
  v_bot_count integer;
  v_to_add integer;
  v_index integer;
  v_suffix integer;
  v_display_name text;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
  v_session_id uuid;
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
    if v_existing_name <> 'api_add_test_bots' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_room.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.created_by_user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_EDITABLE';
  end if;

  select count(*) into v_active_count
  from public.room_members m
  where m.room_id = p_room_id and m.membership_status = 'active';

  select count(*) into v_bot_count
  from public.room_members m
  where m.room_id = p_room_id and m.membership_status = 'active' and m.is_bot = true;

  v_to_add := greatest(0, v_room.min_players - v_active_count);

  if v_active_count + v_to_add > v_room.max_players then
    raise exception using errcode = 'P0001', message = 'ROOM_FULL';
  end if;

  for v_index in 1..v_to_add loop
    v_suffix := 0;
    v_display_name := format('Тестовый бот %s', v_bot_count + v_index);

    while exists (
      select 1 from public.room_members m
      where m.room_id = p_room_id
        and m.membership_status = 'active'
        and lower(m.display_name) = lower(v_display_name)
    ) loop
      v_suffix := v_suffix + 1;
      v_display_name := format('Тестовый бот %s-%s', v_bot_count + v_index, v_suffix);
    end loop;

    insert into public.room_members (
      room_id, user_id, display_name, technical_role,
      membership_status, last_seen_at, is_bot
    )
    values (
      p_room_id, null, v_display_name, 'player',
      'active', now(), true
    );
  end loop;

  select s.id into v_session_id
  from public.game_sessions s
  where s.room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id,
    v_session_id,
    'test_bots_added',
    jsonb_build_object(
      'added', v_to_add,
      'total_active', v_active_count + v_to_add,
      'test_bots', v_bot_count + v_to_add
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'added', v_to_add,
    'active_players', v_active_count + v_to_add,
    'test_bots', v_bot_count + v_to_add
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_add_test_bots', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_add_test_bots(uuid, uuid) from public, anon;
grant execute on function public.api_add_test_bots(uuid, uuid) to authenticated;

create or replace function public.api_get_room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;

  select m.id into v_member_id
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active';

  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;

  select jsonb_build_object(
    'my_member_id', v_member_id,
    'room', (
      select jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'min_players', r.min_players,
        'max_players', r.max_players,
        'ruleset_version', r.ruleset_version,
        'catalog_version', r.catalog_version,
        'created_at', r.created_at
      )
      from public.rooms r
      where r.id = p_room_id
    ),
    'session', (
      select jsonb_build_object(
        'id', s.id,
        'room_id', s.room_id,
        'status', s.status,
        'round_number', s.round_number,
        'max_rounds', s.max_rounds,
        'phase', s.phase,
        'state_version', s.state_version,
        'deadline_at', s.deadline_at
      )
      from public.game_sessions s
      where s.room_id = p_room_id
    ),
    'public_state', (
      select p.payload
      from public.public_game_state p
      where p.room_id = p_room_id
    ),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'member_id', m.id,
          'display_name', m.display_name,
          'technical_role', m.technical_role,
          'membership_status', m.membership_status,
          'joined_at', m.joined_at,
          'last_seen_at', m.last_seen_at,
          'is_bot', m.is_bot
        ) order by m.joined_at, m.id
      )
      from public.room_members m
      where m.room_id = p_room_id and m.membership_status = 'active'
    ), '[]'::jsonb),
    'my_cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'instance_id', ci.id,
          'card_id', cc.card_id,
          'category', cc.category,
          'title', cc.title_original,
          'description', cc.description_original,
          'image_path', cc.image_path,
          'status', ci.instance_status
        ) order by cc.category, cc.source_number
      )
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.room_id = p_room_id
        and ci.owner_member_id = v_member_id
        and ci.zone = 'hand'
        and ci.instance_status <> 'revealed'
    ), '[]'::jsonb),
    'revealed_cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'instance_id', ci.id,
          'owner_member_id', ci.owner_member_id,
          'card_id', cc.card_id,
          'category', cc.category,
          'title', cc.title_original,
          'description', cc.description_original,
          'image_path', cc.image_path,
          'revealed_at', ci.revealed_at
        ) order by ci.revealed_at
      )
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.room_id = p_room_id
        and ci.zone = 'hand'
        and ci.instance_status = 'revealed'
    ), '[]'::jsonb),
    'active_crises', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'instance_id', ci.id,
          'card_id', cc.card_id,
          'title', cc.title_original,
          'description', cc.description_original,
          'image_path', cc.image_path
        ) order by ci.deck_position
      )
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.room_id = p_room_id and ci.zone = 'active_crisis'
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

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
  v_test_mode boolean := false;
  v_has_test_bots boolean := false;
  v_version bigint;
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
    if v_existing_name <> 'api_exit_test_room' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;

  select coalesce((p.payload->>'test_mode')::boolean, false)
    into v_test_mode
  from public.public_game_state p
  where p.room_id = p_room_id;

  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.membership_status = 'active' and m.is_bot = true
  ) into v_has_test_bots;

  if v_room.status <> 'in_progress' or (not coalesce(v_test_mode, false) and not v_has_test_bots) then
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
