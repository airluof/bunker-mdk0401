begin;

-- A selected card stays private during the reveal phase.
-- All selected cards become public together when the host starts the briefing.
-- Any hidden hand category may be selected in every round; there is no Role-first rule.

alter table public.card_instances
  drop constraint if exists card_instances_instance_status_check;

alter table public.card_instances
  add constraint card_instances_instance_status_check
  check (instance_status in ('hidden', 'pending_reveal', 'revealed'));

create or replace function private.guard_pending_reveal_card()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.instance_status = 'pending_reveal'
     and (
       new.instance_status is distinct from 'revealed'
       or new.zone is distinct from 'hand'
       or new.owner_member_id is distinct from old.owner_member_id
       or new.session_id is distinct from old.session_id
       or new.room_id is distinct from old.room_id
       or new.card_id is distinct from old.card_id
     ) then
    raise exception using errcode = 'P0001', message = 'CARD_PENDING_SIMULTANEOUS_REVEAL';
  end if;

  return new;
end;
$$;

drop trigger if exists pending_reveal_card_guard on public.card_instances;
create trigger pending_reveal_card_guard
before update on public.card_instances
for each row execute function private.guard_pending_reveal_card();

revoke all on function private.guard_pending_reveal_card() from public, anon, authenticated;

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
  v_new_version bigint;
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
  if v_session.id is null or v_session.phase <> 'reveal' then
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
    raise exception using errcode = 'P0001', message = 'ALREADY_SELECTED_CARD_THIS_ROUND';
  end if;

  insert into public.game_round_reveals (
    session_id, room_id, round_number, member_id, card_instance_id
  ) values (
    v_session.id, p_room_id, v_session.round_number, v_member_id, v_card.id
  );

  update public.card_instances
  set instance_status = 'pending_reveal'
  where id = v_card.id;

  -- Publish only readiness, never the selected card or its category.
  update public.game_sessions
  set state_version = state_version + 1, updated_at = now()
  where id = v_session.id
  returning state_version into v_new_version;

  update public.public_game_state
  set payload = payload || jsonb_build_object(
        'last_event', 'reveal_selection_saved',
        'round', v_session.round_number
      ),
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  v_result := jsonb_build_object('ok', true, 'selected', true, 'round', v_session.round_number);
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
      raise exception using errcode = 'P0001', message = 'PLAYERS_MUST_SELECT_CARD_FIRST';
    end if;

    if v_is_test then
      for v_bot in
        select m.id
        from public.room_members m
        where m.room_id = p_room_id and m.membership_status = 'active'
          and m.is_alive and m.is_bot
          and exists (
            select 1 from public.card_instances ci
            where ci.room_id = p_room_id and ci.owner_member_id = m.id
              and ci.zone = 'hand' and ci.instance_status = 'hidden'
          )
          and not exists (
            select 1 from public.game_round_reveals rr
            where rr.session_id = v_session.id and rr.round_number = v_session.round_number
              and rr.member_id = m.id
          )
      loop
        select ci.* into v_card
        from public.card_instances ci
        where ci.room_id = p_room_id
          and ci.owner_member_id = v_bot.id
          and ci.zone = 'hand'
          and ci.instance_status = 'hidden'
        order by random()
        limit 1
        for update;

        if v_card.id is not null then
          insert into public.game_round_reveals (
            session_id, room_id, round_number, member_id, card_instance_id
          ) values (
            v_session.id, p_room_id, v_session.round_number, v_bot.id, v_card.id
          );

          update public.card_instances
          set instance_status = 'pending_reveal'
          where id = v_card.id;
        end if;
      end loop;
    end if;

    -- Publish all human and bot selections in one transaction.
    update public.card_instances ci
    set instance_status = 'revealed',
        revealed_at = now(),
        revealed_by_member_id = rr.member_id
    from public.game_round_reveals rr
    where rr.session_id = v_session.id
      and rr.room_id = p_room_id
      and rr.round_number = v_session.round_number
      and rr.card_instance_id = ci.id
      and ci.zone = 'hand'
      and ci.instance_status = 'pending_reveal';

    insert into public.public_game_events (room_id, session_id, event_type, public_payload)
    select
      p_room_id,
      v_session.id,
      case when m.is_bot then 'bot_card_revealed' else 'card_revealed' end,
      jsonb_build_object(
        'member_id', rr.member_id,
        'card_instance_id', ci.id,
        'card_id', ci.card_id,
        'title', cc.title_original,
        'round', v_session.round_number
      )
    from public.game_round_reveals rr
    join public.card_instances ci on ci.id = rr.card_instance_id
    join public.card_catalog cc
      on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    join public.room_members m on m.id = rr.member_id
    where rr.session_id = v_session.id
      and rr.room_id = p_room_id
      and rr.round_number = v_session.round_number
      and ci.zone = 'hand'
      and ci.instance_status = 'revealed';

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
                  jsonb_build_object(
                    'voter_member_id', v_bot.id,
                    'target_member_id', v_target_member_id,
                    'round', v_session.round_number
                  ));
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
  values (
    p_room_id, v_session.id, 'phase_changed',
    jsonb_build_object('phase', p_next_phase, 'round', v_session.round_number, 'state_version', v_new_version)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'phase', p_next_phase,
    'round', v_session.round_number,
    'state_version', v_new_version
  );
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_transition_game_phase', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_transition_game_phase(uuid, text, uuid) from public, anon;
grant execute on function public.api_transition_game_phase(uuid, text, uuid) to authenticated;

commit;
