begin;

-- Explicit room entry modes: ordinary human rooms and mixed human+bot test rooms.
alter table public.rooms
  add column if not exists room_mode text not null default 'players'
  check (room_mode in ('players', 'test'));

alter table public.room_members
  add column if not exists is_alive boolean not null default true,
  add column if not exists eliminated_in_round smallint;

create table if not exists public.game_round_reveals (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 5),
  member_id uuid not null references public.room_members(id) on delete cascade,
  card_instance_id uuid not null references public.card_instances(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, round_number, member_id),
  unique (session_id, round_number, card_instance_id)
);

create index if not exists game_round_reveals_room_round_idx
  on public.game_round_reveals(room_id, round_number);

alter table public.game_round_reveals enable row level security;
revoke all on public.game_round_reveals from public, anon, authenticated;

-- A database guard prevents test bots from being inserted into an ordinary room,
-- even if somebody tries to call the RPC directly.
create or replace function private.guard_test_bot_room_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  if new.is_bot then
    select r.room_mode into v_mode
    from public.rooms r
    where r.id = new.room_id;

    if v_mode is distinct from 'test' then
      raise exception using errcode = 'P0001', message = 'BOTS_ALLOWED_ONLY_IN_TEST_ROOMS';
    end if;

    if new.user_id is not null then
      raise exception using errcode = '22023', message = 'TEST_BOT_MUST_NOT_HAVE_AUTH_USER';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists room_members_test_bot_mode_guard on public.room_members;
create trigger room_members_test_bot_mode_guard
before insert or update of is_bot, room_id, user_id on public.room_members
for each row execute function private.guard_test_bot_room_mode();

revoke all on function private.guard_test_bot_room_mode() from public, anon, authenticated;

-- Test-room creation uses the same identity, invite, and membership setup as a normal room.
create or replace function public.api_create_test_room(
  p_display_name text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_existing_name text;
  v_created jsonb;
  v_room_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if v_existing_name <> 'api_create_test_room' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  -- Use a separate internal command id so this wrapper has its own idempotency receipt.
  v_created := public.api_create_room(p_display_name, gen_random_uuid());
  v_room_id := (v_created->>'room_id')::uuid;

  update public.rooms
  set room_mode = 'test', updated_at = now()
  where id = v_room_id;

  update public.public_game_state
  set payload = payload || jsonb_build_object('room_mode', 'test'),
      updated_at = now()
  where room_id = v_room_id;

  v_result := v_created || jsonb_build_object('room_mode', 'test');

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_create_test_room', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_create_test_room(text, uuid) from public, anon;
grant execute on function public.api_create_test_room(text, uuid) to authenticated;

-- Keep the eight-player minimum in BOTH room types. Test rooms reach it using
-- actual people plus bot seats; the test path no longer starts a one-player game.
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
  v_is_test boolean;
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

  if v_member_count < v_room.min_players or v_member_count > v_room.max_players then
    raise exception using errcode = 'P0001', message = 'PLAYER_COUNT_OUT_OF_RANGE';
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

  v_is_test := (v_room.room_mode = 'test') or p_test_mode;

  update public.room_members
  set is_alive = true, eliminated_in_round = null
  where room_id = p_room_id and membership_status = 'active';

  for v_category in
    select unnest(array['roles', 'skills', 'baggage', 'vulnerabilities', 'actions']::text[])
  loop
    insert into public.card_instances (
      session_id, room_id, owner_member_id, card_id, catalog_version, zone, instance_status
    )
    with ranked_players as (
      select m.id, row_number() over (order by m.joined_at, m.id) as rn
      from public.room_members m
      where m.room_id = p_room_id and m.membership_status = 'active'
    ),
    ranked_cards as (
      select cc.card_id, row_number() over (order by random()) as rn
      from public.card_catalog cc
      where cc.catalog_version = v_room.catalog_version and cc.category = v_category
    )
    select v_session.id, p_room_id, p.id, c.card_id, v_room.catalog_version, 'hand', 'hidden'
    from ranked_players p
    join ranked_cards c on c.rn = p.rn;
  end loop;

  insert into public.card_instances (
    session_id, room_id, owner_member_id, card_id, catalog_version, zone, instance_status, deck_position
  )
  select v_session.id, p_room_id, null, ranked.card_id, v_room.catalog_version,
         case when ranked.rn = 1 then 'active_crisis' else 'crisis_deck' end,
         case when ranked.rn = 1 then 'revealed' else 'hidden' end,
         ranked.rn
  from (
    select cc.card_id, row_number() over (order by random()) as rn
    from public.card_catalog cc
    where cc.catalog_version = v_room.catalog_version and cc.category = 'crises'
  ) ranked;

  update public.game_sessions
  set status = 'active', round_number = 1, phase = 'reveal',
      state_version = state_version + 1, deadline_at = null, updated_at = now()
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
        'test_mode', v_is_test,
        'room_mode', v_room.room_mode,
        'active_players_at_start', v_member_count,
        'bunker_capacity', greatest(2, floor(v_member_count::numeric / 2)::integer)
      ),
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id, v_session.id,
    case when v_is_test then 'test_game_started' else 'game_started' end,
    jsonb_build_object(
      'round', 1, 'phase', 'reveal',
      'state_version', v_new_version, 'test_mode', v_is_test,
      'active_players', v_member_count,
      'bot_players', (select count(*) from public.room_members m where m.room_id = p_room_id and m.is_bot and m.membership_status = 'active')
    )
  );

  v_result := jsonb_build_object(
    'ok', true, 'status', 'started', 'round', 1, 'phase', 'reveal',
    'state_version', v_new_version, 'test_mode', v_is_test
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, v_command_name, v_result);

  return v_result;
end;
$$;

-- Unified snapshot adds public roster status and current-round voting/reveal data
-- without exposing another human player's private hand.
create or replace function public.api_get_game_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_room public.rooms%rowtype;
  v_round integer;
  v_snapshot jsonb;
  v_players jsonb;
  v_votes jsonb;
  v_events jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;

  select * into v_room from public.rooms r where r.id = p_room_id;
  if v_room.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;

  select m.id into v_member_id
  from public.room_members m
  where m.room_id = p_room_id and m.user_id = v_user_id and m.membership_status = 'active';
  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;

  select s.round_number into v_round
  from public.game_sessions s where s.room_id = p_room_id;

  v_snapshot := public.api_get_room_snapshot(p_room_id);

  select coalesce(jsonb_agg(
    p.value || jsonb_build_object(
      'is_alive', m.is_alive,
      'eliminated_in_round', m.eliminated_in_round,
      'votes_received', (
        select count(*) from public.votes v
        where v.room_id = p_room_id and v.round_number = v_round
          and v.target_member_id = m.id
      ),
      'revealed_this_round', exists (
        select 1 from public.game_round_reveals rr
        where rr.room_id = p_room_id and rr.round_number = v_round and rr.member_id = m.id
      )
    ) order by m.joined_at, m.id
  ), '[]'::jsonb) into v_players
  from jsonb_array_elements(coalesce(v_snapshot->'players', '[]'::jsonb)) p(value)
  join public.room_members m on m.id = (p.value->>'member_id')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'voter_member_id', v.voter_member_id,
    'voter_name', voter.display_name,
    'target_member_id', v.target_member_id,
    'target_name', target.display_name,
    'created_at', v.created_at
  ) order by v.created_at), '[]'::jsonb)
  into v_votes
  from public.votes v
  join public.room_members voter on voter.id = v.voter_member_id
  join public.room_members target on target.id = v.target_member_id
  where v.room_id = p_room_id and v.round_number = v_round;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type', e.event_type,
    'public_payload', e.public_payload,
    'created_at', e.created_at
  ) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select * from public.public_game_events e
    where e.room_id = p_room_id
    order by e.created_at desc
    limit 50
  ) e;

  v_snapshot := jsonb_set(v_snapshot, '{room,room_mode}', to_jsonb(v_room.room_mode), true);
  v_snapshot := jsonb_set(v_snapshot, '{players}', v_players, true);
  v_snapshot := jsonb_set(v_snapshot, '{current_round_votes}', v_votes, true);
  v_snapshot := jsonb_set(v_snapshot, '{my_revealed_this_round}', to_jsonb(exists (
    select 1 from public.game_round_reveals rr
    join public.game_sessions s on s.id = rr.session_id
    where rr.room_id = p_room_id and rr.member_id = v_member_id and rr.round_number = s.round_number
  )), true);
  v_snapshot := jsonb_set(v_snapshot, '{my_vote_target_member_id}', coalesce((
    select to_jsonb(v.target_member_id)
    from public.votes v
    join public.game_sessions s on s.id = v.session_id
    where v.room_id = p_room_id and v.voter_member_id = v_member_id and v.round_number = s.round_number
    limit 1
  ), 'null'::jsonb), true);
  v_snapshot := jsonb_set(v_snapshot, '{current_result}', coalesce((
    select jsonb_build_object(
      'eliminated_member_id', p.payload->'eliminated_member_id',
      'eliminated_name', p.payload->'eliminated_name',
      'vote_count', p.payload->'eliminated_vote_count',
      'tie_break_used', p.payload->'tie_break_used'
    )
    from public.public_game_state p where p.room_id = p_room_id
  ), '{}'::jsonb), true);
  v_snapshot := jsonb_set(v_snapshot, '{bunker_capacity}', coalesce((
    select p.payload->'bunker_capacity'
    from public.public_game_state p where p.room_id = p_room_id
  ), 'null'::jsonb), true);
  v_snapshot := jsonb_set(v_snapshot, '{events}', v_events, true);

  return v_snapshot;
end;
$$;

revoke all on function public.api_get_game_snapshot(uuid) from public, anon;
grant execute on function public.api_get_game_snapshot(uuid) to authenticated;

-- A living human reveals one hidden card per round. The chosen card and action
-- are committed together so two devices cannot reveal twice in the same round.
create or replace function public.api_reveal_card(
  p_room_id uuid,
  p_card_instance_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_session public.game_sessions%rowtype;
  v_room_mode text;
  v_card public.card_instances%rowtype;
  v_target_member_id uuid;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
  v_card_title text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_card_instance_id is null or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_reveal_card' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select m.id into v_member_id
  from public.room_members m
  where m.room_id = p_room_id and m.user_id = v_user_id
    and m.membership_status = 'active' and m.is_alive = true;
  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ACTIVE_PLAYER';
  end if;

  select * into v_session
  from public.game_sessions s where s.room_id = p_room_id for update;
  if v_session.phase <> 'reveal' then
    raise exception using errcode = 'P0001', message = 'REVEAL_PHASE_CLOSED';
  end if;

  select * into v_card
  from public.card_instances ci
  where ci.id = p_card_instance_id and ci.room_id = p_room_id
    and ci.owner_member_id = v_member_id and ci.zone = 'hand'
    and ci.instance_status = 'hidden'
  for update;
  if v_card.id is null then
    raise exception using errcode = 'P0001', message = 'CARD_NOT_AVAILABLE';
  end if;

  insert into public.game_round_reveals (
    session_id, room_id, round_number, member_id, card_instance_id
  ) values (
    v_session.id, p_room_id, v_session.round_number, v_member_id, v_card.id
  );

  update public.card_instances
  set instance_status = 'revealed',
      revealed_at = now(),
      revealed_by_member_id = v_member_id
  where id = v_card.id;

  select cc.title_original into v_card_title
  from public.card_catalog cc
  where cc.card_id = v_card.card_id and cc.catalog_version = v_card.catalog_version;

  update public.game_sessions
  set state_version = state_version + 1, updated_at = now()
  where id = v_session.id;

  update public.public_game_state
  set payload = payload || jsonb_build_object('last_event', 'card_revealed'),
      state_version = state_version + 1,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id, v_session.id, 'card_revealed',
    jsonb_build_object('member_id', v_member_id, 'card_instance_id', v_card.id,
                       'card_id', v_card.card_id, 'title', v_card_title,
                       'round', v_session.round_number)
  );

  v_result := jsonb_build_object('ok', true, 'card_instance_id', v_card.id,
                                 'card_id', v_card.card_id, 'round', v_session.round_number);
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_reveal_card', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_reveal_card(uuid, uuid, uuid) from public, anon;
grant execute on function public.api_reveal_card(uuid, uuid, uuid) to authenticated;

-- Host advances reveal -> briefing. Test bots open one random hidden card.
-- Every living human must first reveal one card themselves.
create or replace function public.api_transition_game_phase(
  p_room_id uuid,
  p_next_phase text,
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
  v_missing integer;
  v_bot record;
  v_card public.card_instances%rowtype;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
  v_is_test boolean;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_command_id is null or p_next_phase not in ('briefing', 'voting') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name into v_existing, v_existing_name
  from public.command_receipts cr where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_transition_game_phase' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room from public.rooms r where r.id = p_room_id for update;
  if v_room.id is null or v_room.created_by_user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'FORBIDDEN_OR_ROOM_NOT_FOUND';
  end if;
  select * into v_session from public.game_sessions s where s.room_id = p_room_id for update;
  select coalesce((p.payload->>'test_mode')::boolean, false) into v_is_test
  from public.public_game_state p where p.room_id = p_room_id;

  if p_next_phase = 'briefing' then
    if v_session.phase <> 'reveal' then
      raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
    end if;

    select count(*) into v_missing
    from public.room_members m
    where m.room_id = p_room_id and m.membership_status = 'active'
      and m.is_alive and not m.is_bot
      and not exists (
        select 1 from public.game_round_reveals rr
        where rr.session_id = v_session.id and rr.round_number = v_session.round_number
          and rr.member_id = m.id
      );

    if v_missing > 0 then
      raise exception using errcode = 'P0001', message = 'PLAYERS_MUST_REVEAL_FIRST';
    end if;

    if v_is_test then
      for v_bot in
        select m.id
        from public.room_members m
        where m.room_id = p_room_id and m.membership_status = 'active'
          and m.is_alive and m.is_bot
          and not exists (
            select 1 from public.game_round_reveals rr
            where rr.session_id = v_session.id and rr.round_number = v_session.round_number
              and rr.member_id = m.id
          )
      loop
        select * into v_card
        from public.card_instances ci
        where ci.room_id = p_room_id and ci.owner_member_id = v_bot.id
          and ci.zone = 'hand' and ci.instance_status = 'hidden'
        order by random() limit 1 for update;

        if v_card.id is not null then
          insert into public.game_round_reveals (session_id, room_id, round_number, member_id, card_instance_id)
          values (v_session.id, p_room_id, v_session.round_number, v_bot.id, v_card.id);

          update public.card_instances
          set instance_status = 'revealed', revealed_at = now(), revealed_by_member_id = v_bot.id
          where id = v_card.id;

          insert into public.public_game_events (room_id, session_id, event_type, public_payload)
          values (p_room_id, v_session.id, 'bot_card_revealed',
                  jsonb_build_object('member_id', v_bot.id, 'card_id', v_card.card_id, 'round', v_session.round_number));
        end if;
      end loop;
    end if;

    update public.game_sessions
    set phase = 'briefing', deadline_at = now() + interval '60 seconds',
        state_version = state_version + 1, updated_at = now()
    where id = v_session.id returning state_version into v_new_version;

  else
    if v_session.phase <> 'briefing' then
      raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
    end if;
    if v_session.deadline_at is not null and v_session.deadline_at > now() then
      raise exception using errcode = 'P0001', message = 'BRIEFING_TIMER_RUNNING';
    end if;

    if v_is_test then
      for v_bot in
        select m.id
        from public.room_members m
        where m.room_id = p_room_id and m.membership_status = 'active'
          and m.is_alive and m.is_bot
          and not exists (
            select 1 from public.votes v
            where v.session_id = v_session.id and v.round_number = v_session.round_number
              and v.voter_member_id = m.id
          )
      loop
        select m.id into v_target_member_id
        from public.room_members m
        where m.room_id = p_room_id and m.membership_status = 'active' and m.is_alive
          and m.id <> v_bot.id
        order by random() limit 1;

        if v_target_member_id is not null then
          insert into public.votes (session_id, room_id, round_number, voter_member_id, target_member_id)
          values (v_session.id, p_room_id, v_session.round_number, v_bot.id, v_target_member_id);
          insert into public.public_game_events (room_id, session_id, event_type, public_payload)
          values (p_room_id, v_session.id, 'bot_vote_cast',
                  jsonb_build_object('voter_member_id', v_bot.id, 'target_member_id', v_target_member_id, 'round', v_session.round_number));
        end if;
        v_target_member_id := null;
      end loop;
    end if;

    update public.game_sessions
    set phase = 'voting', deadline_at = null,
        state_version = state_version + 1, updated_at = now()
    where id = v_session.id returning state_version into v_new_version;
  end if;

  update public.public_game_state
  set payload = payload || jsonb_build_object('phase', p_next_phase, 'round', v_session.round_number),
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (p_room_id, v_session.id, 'phase_changed',
          jsonb_build_object('phase', p_next_phase, 'round', v_session.round_number, 'state_version', v_new_version));

  v_result := jsonb_build_object('ok', true, 'phase', p_next_phase,
                                 'round', v_session.round_number, 'state_version', v_new_version);
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_transition_game_phase', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_transition_game_phase(uuid, text, uuid) from public, anon;
grant execute on function public.api_transition_game_phase(uuid, text, uuid) to authenticated;

create or replace function public.api_submit_vote(
  p_room_id uuid,
  p_target_member_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_session public.game_sessions%rowtype;
  v_target_alive boolean;
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

  select cr.response_json, cr.command_name into v_existing, v_existing_name
  from public.command_receipts cr where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_submit_vote' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select m.id into v_member_id
  from public.room_members m
  where m.room_id = p_room_id and m.user_id = v_user_id
    and m.membership_status = 'active' and m.is_alive and not m.is_bot;
  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ELIGIBLE_TO_VOTE';
  end if;

  select * into v_session from public.game_sessions s
  where s.room_id = p_room_id for update;
  if v_session.phase <> 'voting' then
    raise exception using errcode = 'P0001', message = 'VOTING_NOT_OPEN';
  end if;

  select m.is_alive into v_target_alive
  from public.room_members m
  where m.room_id = p_room_id and m.id = p_target_member_id
    and m.membership_status = 'active';
  if v_target_alive is distinct from true then
    raise exception using errcode = 'P0001', message = 'VOTE_TARGET_NOT_AVAILABLE';
  end if;

  insert into public.votes (session_id, room_id, round_number, voter_member_id, target_member_id)
  values (v_session.id, p_room_id, v_session.round_number, v_member_id, p_target_member_id);

  update public.game_sessions
  set state_version = state_version + 1, updated_at = now()
  where id = v_session.id;

  update public.public_game_state
  set payload = payload || jsonb_build_object('last_event', 'vote_cast'),
      state_version = state_version + 1, updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (p_room_id, v_session.id, 'vote_cast',
          jsonb_build_object('voter_member_id', v_member_id, 'target_member_id', p_target_member_id,
                             'round', v_session.round_number));

  v_result := jsonb_build_object('ok', true, 'target_member_id', p_target_member_id,
                                 'round', v_session.round_number);
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_submit_vote', v_result);

  return v_result;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'ALREADY_VOTED_THIS_ROUND';
end;
$$;

revoke all on function public.api_submit_vote(uuid, uuid, uuid) from public, anon;
grant execute on function public.api_submit_vote(uuid, uuid, uuid) to authenticated;

create or replace function public.api_resolve_vote(
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
  v_missing integer;
  v_max_votes integer;
  v_tied_count integer;
  v_eliminated_id uuid;
  v_eliminated_name text;
  v_is_test boolean;
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
  from public.command_receipts cr where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_resolve_vote' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room from public.rooms r
  where r.id = p_room_id and r.created_by_user_id = v_user_id for update;
  if v_room.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN_OR_ROOM_NOT_FOUND';
  end if;

  select * into v_session from public.game_sessions s
  where s.room_id = p_room_id for update;
  if v_session.phase <> 'voting' then
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select coalesce((p.payload->>'test_mode')::boolean, false) into v_is_test
  from public.public_game_state p where p.room_id = p_room_id;

  select count(*) into v_missing
  from public.room_members m
  where m.room_id = p_room_id and m.membership_status = 'active'
    and m.is_alive and not m.is_bot
    and not exists (
      select 1 from public.votes v
      where v.session_id = v_session.id and v.round_number = v_session.round_number
        and v.voter_member_id = m.id
    );
  if v_missing > 0 then
    raise exception using errcode = 'P0001', message = 'WAITING_FOR_PLAYER_VOTES';
  end if;

  select max(tally.vote_count) into v_max_votes
  from (
    select v.target_member_id, count(*)::integer as vote_count
    from public.votes v
    where v.session_id = v_session.id and v.round_number = v_session.round_number
    group by v.target_member_id
  ) tally;
  if v_max_votes is null then
    raise exception using errcode = 'P0001', message = 'NO_VOTES_CAST';
  end if;

  select count(*) into v_tied_count
  from (
    select v.target_member_id
    from public.votes v
    where v.session_id = v_session.id and v.round_number = v_session.round_number
    group by v.target_member_id
    having count(*) = v_max_votes
  ) tied;

  if v_tied_count > 1 and not v_is_test then
    raise exception using errcode = 'P0001', message = 'VOTE_TIE_NEEDS_RULE';
  end if;

  select tied.target_member_id into v_eliminated_id
  from (
    select v.target_member_id
    from public.votes v
    where v.session_id = v_session.id and v.round_number = v_session.round_number
    group by v.target_member_id
    having count(*) = v_max_votes
  ) tied
  order by random()
  limit 1;

  select m.display_name into v_eliminated_name
  from public.room_members m where m.id = v_eliminated_id;

  update public.room_members
  set is_alive = false, eliminated_in_round = v_session.round_number
  where id = v_eliminated_id and room_id = p_room_id;

  update public.game_sessions
  set phase = 'elimination', deadline_at = null,
      state_version = state_version + 1, updated_at = now()
  where id = v_session.id returning state_version into v_new_version;

  update public.public_game_state
  set payload = payload || jsonb_build_object(
        'phase', 'elimination',
        'eliminated_member_id', v_eliminated_id,
        'eliminated_name', v_eliminated_name,
        'eliminated_vote_count', v_max_votes,
        'tie_break_used', (v_tied_count > 1)
      ),
      state_version = v_new_version, updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (p_room_id, v_session.id, 'player_eliminated',
          jsonb_build_object('member_id', v_eliminated_id, 'display_name', v_eliminated_name,
                             'votes', v_max_votes, 'tie_break_used', (v_tied_count > 1),
                             'round', v_session.round_number));

  v_result := jsonb_build_object('ok', true, 'eliminated_member_id', v_eliminated_id,
                                 'eliminated_name', v_eliminated_name,
                                 'votes', v_max_votes, 'tie_break_used', (v_tied_count > 1));
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_resolve_vote', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_resolve_vote(uuid, uuid) from public, anon;
grant execute on function public.api_resolve_vote(uuid, uuid) to authenticated;

create or replace function public.api_advance_game_round(
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
  v_remaining integer;
  v_start_count integer;
  v_capacity integer;
  v_next_round integer;
  v_crisis public.card_instances%rowtype;
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
  from public.command_receipts cr where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_advance_game_round' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room from public.rooms r
  where r.id = p_room_id and r.created_by_user_id = v_user_id for update;
  if v_room.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN_OR_ROOM_NOT_FOUND';
  end if;

  select * into v_session from public.game_sessions s
  where s.room_id = p_room_id for update;
  if v_session.phase <> 'elimination' then
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select count(*) into v_remaining
  from public.room_members m
  where m.room_id = p_room_id and m.membership_status = 'active' and m.is_alive;

  select (p.payload->>'active_players_at_start')::integer,
         coalesce((p.payload->>'bunker_capacity')::integer, 2)
    into v_start_count, v_capacity
  from public.public_game_state p where p.room_id = p_room_id;

  if v_remaining <= v_capacity or v_session.round_number >= v_session.max_rounds then
    update public.game_sessions
    set phase = 'audit', deadline_at = null,
        state_version = state_version + 1, updated_at = now()
    where id = v_session.id returning state_version into v_new_version;

    update public.public_game_state
    set payload = payload || jsonb_build_object('phase', 'audit', 'survivors', v_remaining),
        state_version = v_new_version, updated_at = now()
    where room_id = p_room_id;

    insert into public.public_game_events (room_id, session_id, event_type, public_payload)
    values (p_room_id, v_session.id, 'final_audit_started',
            jsonb_build_object('survivors', v_remaining, 'bunker_capacity', v_capacity,
                               'round', v_session.round_number));

    v_result := jsonb_build_object('ok', true, 'phase', 'audit', 'survivors', v_remaining,
                                   'bunker_capacity', v_capacity);
  else
    v_next_round := v_session.round_number + 1;

    if v_next_round in (2, 4) then
      select * into v_crisis
      from public.card_instances ci
      where ci.room_id = p_room_id and ci.zone = 'crisis_deck'
      order by ci.deck_position
      limit 1 for update;

      if v_crisis.id is not null then
        update public.card_instances
        set zone = 'active_crisis', instance_status = 'revealed', revealed_at = now()
        where id = v_crisis.id;
        insert into public.public_game_events (room_id, session_id, event_type, public_payload)
        values (p_room_id, v_session.id, 'crisis_added',
                jsonb_build_object('card_id', v_crisis.card_id, 'round', v_next_round));
      end if;
    end if;

    update public.game_sessions
    set round_number = v_next_round, phase = 'reveal', deadline_at = null,
        state_version = state_version + 1, updated_at = now()
    where id = v_session.id returning state_version into v_new_version;

    update public.public_game_state
    set payload = payload - 'eliminated_member_id' - 'eliminated_name' - 'eliminated_vote_count' - 'tie_break_used'
                  || jsonb_build_object('phase', 'reveal', 'round', v_next_round),
        state_version = v_new_version, updated_at = now()
    where room_id = p_room_id;

    insert into public.public_game_events (room_id, session_id, event_type, public_payload)
    values (p_room_id, v_session.id, 'round_started',
            jsonb_build_object('round', v_next_round, 'survivors', v_remaining));

    v_result := jsonb_build_object('ok', true, 'phase', 'reveal', 'round', v_next_round);
  end if;

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_advance_game_round', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_advance_game_round(uuid, uuid) from public, anon;
grant execute on function public.api_advance_game_round(uuid, uuid) to authenticated;

commit;
