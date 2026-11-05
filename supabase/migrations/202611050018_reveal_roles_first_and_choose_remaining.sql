begin;

-- Adopt the following digital-game rule without altering the original source workbook:
-- Round 1: each living player reveals their Role.
-- Rounds 2-5: each living player reveals one remaining hidden card of their choice.
-- Players act independently; the card becomes public immediately after selection.
-- A player with no hidden hand cards is skipped and cannot block the phase transition.

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
      ),
      'has_hidden_cards', exists (
        select 1
        from public.card_instances ci
        where ci.room_id = p_room_id
          and ci.owner_member_id = m.id
          and ci.zone = 'hand'
          and ci.instance_status = 'hidden'
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
  v_snapshot := jsonb_set(v_snapshot, '{audit_plan}', coalesce((
    select jsonb_build_object(
      'plan_text', a.submission_payload->>'plan_text',
      'status', a.status,
      'submitted_by_member_id', a.submitted_by_member_id,
      'submitted_by_name', m.display_name,
      'updated_at', a.updated_at
    )
    from public.audit_submissions a
    join public.room_members m on m.id = a.submitted_by_member_id
    join public.game_sessions s on s.id = a.session_id
    where a.room_id = p_room_id
    order by a.updated_at desc
    limit 1
  ), '{}'::jsonb), true);

  return v_snapshot;
end;
$$;

revoke all on function public.api_get_game_snapshot(uuid) from public, anon;
grant execute on function public.api_get_game_snapshot(uuid) to authenticated;

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
  v_card public.card_instances%rowtype;
  v_existing jsonb;
  v_existing_name text;
  v_result jsonb;
  v_card_title text;
  v_card_category text;
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

  if exists (
    select 1
    from public.game_round_reveals rr
    where rr.session_id = v_session.id
      and rr.round_number = v_session.round_number
      and rr.member_id = v_member_id
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_REVEALED_THIS_ROUND';
  end if;

  select cc.category into v_card_category
  from public.card_catalog cc
  where cc.card_id = v_card.card_id
    and cc.catalog_version = v_card.catalog_version;

  if v_session.round_number = 1 and v_card_category <> 'roles' then
    raise exception using errcode = 'P0001', message = 'FIRST_ROUND_REQUIRES_ROLE';
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
  v_target_member_id uuid;
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
      and exists (
        select 1
        from public.card_instances ci
        where ci.room_id = p_room_id
          and ci.owner_member_id = m.id
          and ci.zone = 'hand'
          and ci.instance_status = 'hidden'
      )
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
        select ci.* into v_card
        from public.card_instances ci
        join public.card_catalog cc
          on cc.card_id = ci.card_id
         and cc.catalog_version = ci.catalog_version
        where ci.room_id = p_room_id
          and ci.owner_member_id = v_bot.id
          and ci.zone = 'hand'
          and ci.instance_status = 'hidden'
          and (
            (v_session.round_number = 1 and cc.category = 'roles')
            or (v_session.round_number > 1 and cc.category <> 'roles')
          )
        order by random()
        limit 1
        for update of ci;

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

commit;
