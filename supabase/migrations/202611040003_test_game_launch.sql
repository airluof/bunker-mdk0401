begin;

-- Shared start logic. Only test mode skips the original minimum-player requirement.
create or replace function private.start_game_core(
  p_room_id uuid,
  p_command_id uuid,
  p_test_mode boolean
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
  v_member_count integer;
  v_catalog_ok boolean;
  v_category text;
  v_new_version bigint;
  v_existing jsonb;
  v_existing_name text;
  v_command_name text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;

  if p_room_id is null or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  v_command_name := case when p_test_mode then 'api_start_test_game' else 'api_start_game' end;

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if v_existing_name <> v_command_name then
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
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select * into v_session
  from public.game_sessions s
  where s.room_id = p_room_id
  for update;

  if v_session.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select count(*) into v_member_count
  from public.room_members m
  where m.room_id = p_room_id and m.membership_status = 'active';

  if (not p_test_mode and (v_member_count < v_room.min_players or v_member_count > v_room.max_players))
     or (p_test_mode and (v_member_count < 1 or v_member_count > v_room.max_players)) then
    raise exception using errcode = 'P0001',
      message = case when p_test_mode then 'TEST_PLAYER_COUNT_OUT_OF_RANGE' else 'PLAYER_COUNT_OUT_OF_RANGE' end;
  end if;

  select (
    count(*) = 180
    and count(*) filter (where category = 'roles') = 30
    and count(*) filter (where category = 'skills') = 30
    and count(*) filter (where category = 'baggage') = 30
    and count(*) filter (where category = 'vulnerabilities') = 30
    and count(*) filter (where category = 'crises') = 30
    and count(*) filter (where category = 'actions') = 30
  ) into v_catalog_ok
  from public.card_catalog cc
  where cc.catalog_version = v_room.catalog_version;

  if not coalesce(v_catalog_ok, false) then
    raise exception using errcode = 'P0001', message = 'CARD_CATALOG_INCOMPLETE';
  end if;

  for v_category in
    select unnest(array['roles', 'skills', 'baggage', 'vulnerabilities', 'actions']::text[])
  loop
    insert into public.card_instances (
      session_id, room_id, owner_member_id, card_id, catalog_version, zone, instance_status
    )
    with ranked_players as (
      select
        m.id,
        row_number() over (order by m.joined_at, m.id) as rn
      from public.room_members m
      where m.room_id = p_room_id and m.membership_status = 'active'
    ),
    ranked_cards as (
      select
        cc.card_id,
        row_number() over (order by random()) as rn
      from public.card_catalog cc
      where cc.catalog_version = v_room.catalog_version
        and cc.category = v_category
    )
    select
      v_session.id,
      p_room_id,
      p.id,
      c.card_id,
      v_room.catalog_version,
      'hand',
      'hidden'
    from ranked_players p
    join ranked_cards c on c.rn = p.rn;
  end loop;

  insert into public.card_instances (
    session_id, room_id, owner_member_id, card_id, catalog_version, zone, instance_status, deck_position
  )
  select
    v_session.id,
    p_room_id,
    null,
    ranked.card_id,
    v_room.catalog_version,
    case when ranked.rn = 1 then 'active_crisis' else 'crisis_deck' end,
    case when ranked.rn = 1 then 'revealed' else 'hidden' end,
    ranked.rn
  from (
    select
      cc.card_id,
      row_number() over (order by random()) as rn
    from public.card_catalog cc
    where cc.catalog_version = v_room.catalog_version
      and cc.category = 'crises'
  ) ranked;

  update public.game_sessions
  set status = 'active',
      round_number = 1,
      phase = 'reveal',
      state_version = state_version + 1,
      updated_at = now()
  where id = v_session.id
  returning state_version into v_new_version;

  update public.rooms
  set status = 'in_progress', updated_at = now()
  where id = p_room_id;

  update public.public_game_state
  set payload = jsonb_build_object(
        'status', 'in_progress',
        'phase', 'reveal',
        'round', 1,
        'test_mode', p_test_mode,
        'active_players_at_start', v_member_count
      ),
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id,
    v_session.id,
    case when p_test_mode then 'test_game_started' else 'game_started' end,
    jsonb_build_object('round', 1, 'phase', 'reveal', 'state_version', v_new_version, 'test_mode', p_test_mode)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'started',
    'round', 1,
    'phase', 'reveal',
    'state_version', v_new_version,
    'test_mode', p_test_mode
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, v_command_name, v_result);

  return v_result;
end;
$$;

create or replace function public.api_start_game(
  p_room_id uuid,
  p_command_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.start_game_core(p_room_id, p_command_id, false);
$$;

create or replace function public.api_start_test_game(
  p_room_id uuid,
  p_command_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.start_game_core(p_room_id, p_command_id, true);
$$;

revoke all on function private.start_game_core(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.api_start_game(uuid, uuid) from public, anon;
revoke all on function public.api_start_test_game(uuid, uuid) from public, anon;
grant execute on function public.api_start_game(uuid, uuid) to authenticated;
grant execute on function public.api_start_test_game(uuid, uuid) to authenticated;

commit;
