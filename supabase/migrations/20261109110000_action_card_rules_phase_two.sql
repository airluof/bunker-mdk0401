begin;

-- Permit explicitly marked Skill copies while preserving one physical source
-- card instance per session for every regular deck card.
alter table public.card_instances
  add column if not exists is_copy boolean not null default false;

alter table public.card_instances
  drop constraint if exists card_instances_session_id_card_id_key;

create unique index if not exists card_instances_one_source_card_per_session
  on public.card_instances (session_id, card_id)
  where is_copy = false;


-- Enable six Action cards whose digital procedures are now explicit and testable.
update public.card_catalog
set effect_status = 'approved',
    effect_handler_id = case card_id
      when 'action_02' then 'rollback_cancel_voting_round'
      when 'action_05' then 'gpupdate_force_reveal_hidden_card'
      when 'action_07' then 'sudo_double_vote_or_tie_save'
      when 'action_09' then 'security_sandbox_protect_targeted_actions'
      when 'action_14' then 'clone_neighbour_skill_until_game_end'
      when 'action_29' then 'factory_reset_redraw_four_core_cards'
    end
where catalog_version = 'v1'
  and card_id in ('action_02', 'action_05', 'action_07', 'action_09', 'action_14', 'action_29')
  and category = 'actions';

-- The old five-argument RPC is replaced so action_07 can pass an explicit mode.
drop function if exists public.api_use_action_effect(uuid, uuid, uuid, uuid, uuid);

create or replace function public.api_use_action_effect(
  p_room_id uuid,
  p_card_instance_id uuid,
  p_target_member_id uuid,
  p_target_card_instance_id uuid,
  p_command_id uuid,
  p_action_choice text default null
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
  v_actor_id uuid;
  v_actor_name text;
  v_target_name text;
  v_target_alive boolean;
  v_action public.card_instances%rowtype;
  v_actor_card public.card_instances%rowtype;
  v_target_card public.card_instances%rowtype;
  v_drawn_card public.card_instances%rowtype;
  v_crisis_card public.card_instances%rowtype;
  v_state jsonb;
  v_private_cards jsonb;
  v_private_payload jsonb;
  v_new_version bigint;
  v_effect_id text;
  v_old_capacity integer;
  v_result jsonb;
  v_existing jsonb;
  v_existing_name text;
  v_card_count integer;
  v_deck_position integer;
  v_action_choice text;
  v_alive_member_ids uuid[];
  v_actor_position integer;
  v_role_card public.card_instances%rowtype;
  v_skill_card public.card_instances%rowtype;
  v_baggage_card public.card_instances%rowtype;
  v_vulnerability_card public.card_instances%rowtype;
  v_card_title text;
  v_card_description text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;

  if p_room_id is null or p_card_instance_id is null or p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id
    and cr.command_id = p_command_id;

  if found then
    if v_existing_name <> 'api_use_action_effect' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select *
    into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_room.id is null or v_room.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'GAME_NOT_ACTIVE';
  end if;

  select *
    into v_session
  from public.game_sessions s
  where s.room_id = p_room_id
  for update;

  if v_session.id is null
     or v_session.status <> 'active'
     or v_session.phase in ('lobby', 'audit', 'gameover') then
    raise exception using errcode = 'P0001', message = 'ACTION_WINDOW_CLOSED';
  end if;

  select m.id, m.display_name
    into v_actor_id, v_actor_name
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active'
    and m.is_alive = true
    and m.is_bot = false
  for update;

  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ACTIVE_PLAYER';
  end if;

  select ci.*
    into v_action
  from public.card_instances ci
  join public.card_catalog cc
    on cc.card_id = ci.card_id
   and cc.catalog_version = ci.catalog_version
  where ci.id = p_card_instance_id
    and ci.session_id = v_session.id
    and ci.room_id = p_room_id
    and ci.owner_member_id = v_actor_id
    and ci.zone = 'hand'
    and cc.category = 'actions'
    and cc.effect_status = 'approved'
    and ci.card_id in (
      'action_02', 'action_03', 'action_05', 'action_06', 'action_07',
      'action_08', 'action_09', 'action_10', 'action_12', 'action_14',
      'action_15', 'action_16', 'action_17', 'action_18', 'action_20',
      'action_21', 'action_24', 'action_25', 'action_29'
    )
  for update of ci;

  if v_action.id is null then
    raise exception using errcode = 'P0001', message = 'ACTION_CARD_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from public.game_action_uses u
    where u.session_id = v_session.id
      and u.card_instance_id = v_action.id
  ) then
    raise exception using errcode = 'P0001', message = 'ACTION_ALREADY_USED';
  end if;

  if p_target_member_id is not null then
    select m.display_name, m.is_alive
      into v_target_name, v_target_alive
    from public.room_members m
    where m.id = p_target_member_id
      and m.room_id = p_room_id
      and m.membership_status = 'active'
    for update;

    if v_target_name is null then
      raise exception using errcode = 'P0001', message = 'ACTION_TARGET_NOT_AVAILABLE';
    end if;
  end if;

  select p.payload
    into v_state
  from public.public_game_state p
  where p.room_id = p_room_id
  for update;

  if v_state is null then
    raise exception using errcode = 'P0001', message = 'GAME_STATE_NOT_FOUND';
  end if;

  v_effect_id := case v_action.card_id
    when 'action_02' then 'rollback_cancel_voting_round'
    when 'action_03' then 'hot_swap_baggage'
    when 'action_05' then 'gpupdate_force_reveal_hidden_card'
    when 'action_07' then 'sudo_double_vote_or_tie_save'
    when 'action_09' then 'security_sandbox_protect_targeted_actions'
    when 'action_14' then 'clone_neighbour_skill_until_game_end'
    when 'action_06' then 'vmotion_swap_roles'
    when 'action_08' then 'smart_peek_future_crisis'
    when 'action_10' then 'cmdb_reveal_all_baggage'
    when 'action_12' then 'write_off_target_baggage'
    when 'action_15' then 'cr_replace_selected_crisis'
    when 'action_16' then 'confiscate_expelled_baggage'
    when 'action_17' then 'watchdog_30_second_briefing'
    when 'action_18' then 'session_hijacking_swap_vulnerabilities'
    when 'action_20' then 'memory_dump_private_peek'
    when 'action_21' then 'workaround_ignore_crisis_in_audit'
    when 'action_24' then 'kernel_driver_draw_second_baggage'
    when 'action_25' then 'safe_boot_disable_vulnerabilities_round'
    when 'action_29' then 'factory_reset_redraw_four_core_cards'
    else null
  end;

  if v_action.card_id in ('action_03', 'action_05', 'action_06', 'action_12', 'action_14', 'action_18', 'action_20')
     and p_target_member_id is not null
     and (v_action.card_id <> 'action_03' or coalesce(v_target_alive, false))
     and exists (
       select 1
       from jsonb_array_elements(coalesce(v_state->'action_shields', '[]'::jsonb)) shield
       where shield->>'member_id' = p_target_member_id::text
         and nullif(shield->>'round', '')::integer = v_session.round_number
     ) then
    raise exception using errcode = 'P0001', message = 'ACTION_TARGET_PROTECTED';
  end if;

  if v_effect_id is null then
    raise exception using errcode = 'P0001', message = 'ACTION_EFFECT_NOT_IMPLEMENTED';
  end if;

  -- Rollback: cancel the current voting result before the host resolves it.
  if v_action.card_id = 'action_02' then
    if v_session.phase <> 'voting' then
      raise exception using errcode = 'P0001', message = 'ROLLBACK_REQUIRES_VOTING';
    end if;
    v_state := jsonb_set(v_state, '{cancelled_vote_round}', to_jsonb(v_session.round_number), true);

  -- gpupdate: force a living opponent to reveal one random hidden hand card.
  elsif v_action.card_id = 'action_05' then
    if v_session.phase not in ('briefing', 'voting') then
      raise exception using errcode = 'P0001', message = 'GPUPDATE_REQUIRES_BRIEFING_OR_VOTING';
    end if;
    if p_target_member_id is null or p_target_member_id = v_actor_id or not coalesce(v_target_alive, false) then
      raise exception using errcode = 'P0001', message = 'ACTION_TARGET_REQUIRED';
    end if;
    select ci.* into v_target_card
    from public.card_instances ci
    where ci.session_id = v_session.id
      and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand'
      and ci.instance_status = 'hidden'
    order by random()
    limit 1
    for update of ci skip locked;
    if v_target_card.id is null then
      raise exception using errcode = 'P0001', message = 'TARGET_HAS_NO_HIDDEN_CARD';
    end if;
    update public.card_instances
    set instance_status = 'revealed',
        revealed_at = now(),
        revealed_by_member_id = v_actor_id
    where id = v_target_card.id;
    select cc.title_original, cc.description_original
      into v_card_title, v_card_description
    from public.card_catalog cc
    where cc.card_id = v_target_card.card_id
      and cc.catalog_version = v_target_card.catalog_version;
    insert into public.public_game_events (room_id, session_id, event_type, public_payload)
    values (
      p_room_id, v_session.id, 'card_revealed',
      jsonb_build_object(
        'member_id', p_target_member_id,
        'card_instance_id', v_target_card.id,
        'card_id', v_target_card.card_id,
        'title', v_card_title,
        'description', v_card_description,
        'round', v_session.round_number,
        'forced_by_member_id', v_actor_id
      )
    );

  -- Veto: the card owner chooses one of the two meanings printed on the source card.
  elsif v_action.card_id = 'action_07' then
    if v_session.phase <> 'voting' then
      raise exception using errcode = 'P0001', message = 'VETO_REQUIRES_VOTING';
    end if;
    if p_action_choice not in ('double_vote', 'tie_save') then
      raise exception using errcode = '22023', message = 'VETO_CHOICE_REQUIRED';
    end if;
    v_state := jsonb_set(
      v_state,
      '{action_07_modifier}',
      jsonb_build_object(
        'member_id', v_actor_id,
        'round', v_session.round_number,
        'mode', p_action_choice
      ),
      true
    );

  -- Security Sandbox: protect one living participant from direct targeted Action effects
  -- for the current round. Global effects are intentionally unaffected.
  elsif v_action.card_id = 'action_09' then
    if p_target_member_id is null or not coalesce(v_target_alive, false) then
      raise exception using errcode = 'P0001', message = 'SANDBOX_LIVING_TARGET_REQUIRED';
    end if;
    v_state := jsonb_set(
      v_state,
      '{action_shields}',
      coalesce(v_state->'action_shields', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'member_id', p_target_member_id,
          'round', v_session.round_number,
          'source_member_id', v_actor_id
        )),
      true
    );

  -- Clone VM: copy the Skill of the immediate left or right living neighbour.
  elsif v_action.card_id = 'action_14' then
    if p_target_member_id is null or p_target_member_id = v_actor_id or not coalesce(v_target_alive, false) then
      raise exception using errcode = 'P0001', message = 'CLONE_NEIGHBOUR_REQUIRED';
    end if;
    select array_agg(m.id order by m.joined_at, m.id)
      into v_alive_member_ids
    from public.room_members m
    where m.room_id = p_room_id
      and m.membership_status = 'active'
      and m.is_alive = true;
    v_actor_position := array_position(v_alive_member_ids, v_actor_id);
    if coalesce(cardinality(v_alive_member_ids), 0) < 2 or v_actor_position is null then
      raise exception using errcode = 'P0001', message = 'CLONE_NEIGHBOUR_NOT_AVAILABLE';
    end if;
    if p_target_member_id <> v_alive_member_ids[
        case when v_actor_position = 1 then cardinality(v_alive_member_ids) else v_actor_position - 1 end
      ]
      and p_target_member_id <> v_alive_member_ids[
        case when v_actor_position = cardinality(v_alive_member_ids) then 1 else v_actor_position + 1 end
      ] then
      raise exception using errcode = 'P0001', message = 'CLONE_TARGET_NOT_ADJACENT';
    end if;
    select ci.* into v_target_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id
      and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand'
      and cc.category = 'skills'
    order by ci.created_at, ci.id
    limit 1
    for update of ci;
    if v_target_card.id is null then
      raise exception using errcode = 'P0001', message = 'NEIGHBOUR_SKILL_NOT_AVAILABLE';
    end if;
    update public.card_instances
    set instance_status = 'revealed',
        revealed_at = coalesce(revealed_at, now()),
        revealed_by_member_id = coalesce(revealed_by_member_id, v_actor_id)
    where id = v_target_card.id;
    insert into public.card_instances (
      session_id, room_id, owner_member_id, card_id, catalog_version,
      zone, instance_status, revealed_at, revealed_by_member_id, is_copy
    )
    values (
      v_session.id, p_room_id, v_actor_id, v_target_card.card_id, v_target_card.catalog_version,
      'hand', 'revealed', now(), v_actor_id, true
    );
    select cc.title_original, cc.description_original
      into v_card_title, v_card_description
    from public.card_catalog cc
    where cc.card_id = v_target_card.card_id
      and cc.catalog_version = v_target_card.catalog_version;
    insert into public.public_game_events (room_id, session_id, event_type, public_payload)
    values (
      p_room_id, v_session.id, 'action_skill_cloned',
      jsonb_build_object(
        'actor_member_id', v_actor_id,
        'source_member_id', p_target_member_id,
        'skill_card_id', v_target_card.card_id,
        'skill_title', v_card_title,
        'skill_description', v_card_description,
        'round', v_session.round_number
      )
    );

  -- Hot-Swap: exchange the owner's oldest Baggage with a card from the deck
  -- or the oldest Baggage held by an expelled player.
  elsif v_action.card_id = 'action_03' then
    select ci.* into v_actor_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = v_actor_id
      and ci.zone = 'hand' and cc.category = 'baggage'
    order by ci.created_at, ci.id
    limit 1
    for update of ci;
    if v_actor_card.id is null then
      raise exception using errcode = 'P0001', message = 'ACTOR_BAGGAGE_NOT_AVAILABLE';
    end if;

    if p_target_member_id is null then
      select ci.* into v_drawn_card
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.session_id = v_session.id and ci.zone = 'category_deck'
        and cc.category = 'baggage'
      order by ci.deck_position, ci.created_at
      limit 1
      for update of ci skip locked;

      if v_drawn_card.id is null then
        raise exception using errcode = 'P0001', message = 'BAGGAGE_DECK_EMPTY';
      end if;

      select coalesce(max(ci.deck_position), 0) + 1 into v_deck_position
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.session_id = v_session.id and ci.zone = 'category_deck' and cc.category = 'baggage';

      update public.card_instances
      set zone = 'category_deck',
          owner_member_id = null,
          instance_status = 'hidden',
          deck_position = v_deck_position,
          revealed_at = null,
          revealed_by_member_id = null
      where id = v_actor_card.id;

      update public.card_instances
      set zone = 'hand', owner_member_id = v_actor_id,
          instance_status = 'hidden', deck_position = null,
          revealed_at = null, revealed_by_member_id = null
      where id = v_drawn_card.id;

      v_private_payload := jsonb_build_object(
        'action_id', 'action_03',
        'drawn_card_id', v_drawn_card.card_id
      );
      insert into public.player_private_events (room_id, member_id, event_type, private_payload)
      values (p_room_id, v_actor_id, 'action_card_private_result', v_private_payload);
    else
      if p_target_member_id = v_actor_id or coalesce(v_target_alive, true) then
        raise exception using errcode = 'P0001', message = 'HOT_SWAP_TARGET_MUST_BE_EXPELLED';
      end if;

      select ci.* into v_target_card
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
        and ci.zone = 'hand' and cc.category = 'baggage'
      order by ci.created_at, ci.id
      limit 1
      for update of ci;
      if v_target_card.id is null then
        raise exception using errcode = 'P0001', message = 'HOT_SWAP_TARGET_HAS_NO_BAGGAGE';
      end if;

      update public.card_instances set owner_member_id = p_target_member_id where id = v_actor_card.id;
      update public.card_instances set owner_member_id = v_actor_id where id = v_target_card.id;
    end if;

  -- vMotion: exchange the two players' Role cards.
  elsif v_action.card_id = 'action_06' then
    if p_target_member_id is null or p_target_member_id = v_actor_id then
      raise exception using errcode = 'P0001', message = 'ACTION_TARGET_REQUIRED';
    end if;

    select ci.* into v_actor_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = v_actor_id
      and ci.zone = 'hand' and cc.category = 'roles'
    for update of ci;

    select ci.* into v_target_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'roles'
    for update of ci;

    if v_actor_card.id is null or v_target_card.id is null then
      raise exception using errcode = 'P0001', message = 'ROLE_CARD_NOT_AVAILABLE';
    end if;

    update public.card_instances set owner_member_id = p_target_member_id where id = v_actor_card.id;
    update public.card_instances set owner_member_id = v_actor_id where id = v_target_card.id;

  -- S.M.A.R.T.: privately inspect the next Crisis card without revealing it.
  elsif v_action.card_id = 'action_08' then
    select ci.* into v_drawn_card
    from public.card_instances ci
    where ci.session_id = v_session.id and ci.zone = 'crisis_deck'
    order by ci.deck_position
    limit 1
    for update;

    if v_drawn_card.id is null then
      raise exception using errcode = 'P0001', message = 'CRISIS_DECK_EMPTY';
    end if;

    select jsonb_build_object(
      'action_id', 'action_08',
      'card_id', cc.card_id,
      'title', cc.title_original,
      'description', cc.description_original
    ) into v_private_payload
    from public.card_catalog cc
    where cc.card_id = v_drawn_card.card_id and cc.catalog_version = v_drawn_card.catalog_version;

    insert into public.player_private_events (room_id, member_id, event_type, private_payload)
    values (p_room_id, v_actor_id, 'action_card_private_result', v_private_payload);

  -- CMDB: all held Baggage cards become public.
  elsif v_action.card_id = 'action_10' then
    update public.card_instances ci
    set instance_status = 'revealed',
        revealed_at = coalesce(ci.revealed_at, now()),
        revealed_by_member_id = coalesce(ci.revealed_by_member_id, v_actor_id)
    from public.card_catalog cc
    where cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      and ci.session_id = v_session.id and ci.room_id = p_room_id
      and ci.zone = 'hand' and cc.category = 'baggage'
      and ci.instance_status = 'hidden';

  -- Write-off: discard the target's only held Baggage.
  elsif v_action.card_id = 'action_12' then
    if p_target_member_id is null or p_target_member_id = v_actor_id then
      raise exception using errcode = 'P0001', message = 'ACTION_TARGET_REQUIRED';
    end if;

    select ci.* into v_target_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'baggage'
    order by ci.created_at, ci.id
    limit 1
    for update of ci;
    if v_target_card.id is null then
      raise exception using errcode = 'P0001', message = 'TARGET_HAS_NO_BAGGAGE';
    end if;

    update public.card_instances
    set zone = 'discard', owner_member_id = null
    where id = v_target_card.id;

  -- Change Request: the acting player explicitly chooses which active Crisis
  -- is replaced; this avoids guessing which of several active Crises is "current".
  elsif v_action.card_id = 'action_15' then
    if p_target_card_instance_id is null then
      raise exception using errcode = 'P0001', message = 'ACTIVE_CRISIS_TARGET_REQUIRED';
    end if;

    select ci.* into v_crisis_card
    from public.card_instances ci
    where ci.id = p_target_card_instance_id
      and ci.session_id = v_session.id
      and ci.room_id = p_room_id
      and ci.zone = 'active_crisis'
    for update;

    if v_crisis_card.id is null then
      raise exception using errcode = 'P0001', message = 'ACTIVE_CRISIS_NOT_AVAILABLE';
    end if;

    select ci.* into v_drawn_card
    from public.card_instances ci
    where ci.session_id = v_session.id and ci.zone = 'crisis_deck'
    order by ci.deck_position
    limit 1
    for update;

    if v_drawn_card.id is null then
      raise exception using errcode = 'P0001', message = 'CRISIS_DECK_EMPTY';
    end if;

    update public.card_instances
    set zone = 'discard', owner_member_id = null
    where id = v_crisis_card.id;

    -- A replaced Crisis can no longer remain marked by Workaround.
    v_state := jsonb_set(
      v_state,
      '{ignored_crisis_ids}',
      coalesce(v_state->'ignored_crisis_ids', '[]'::jsonb) - v_crisis_card.id::text,
      true
    );

    update public.card_instances
    set zone = 'active_crisis', instance_status = 'revealed',
        revealed_at = now(), revealed_by_member_id = v_actor_id
    where id = v_drawn_card.id;

  -- Confiscation: take the only Baggage from an expelled participant.
  elsif v_action.card_id = 'action_16' then
    if p_target_member_id is null or p_target_member_id = v_actor_id
       or coalesce(v_target_alive, true) then
      raise exception using errcode = 'P0001', message = 'EXPELLED_TARGET_REQUIRED';
    end if;

    select ci.* into v_target_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'baggage'
    order by ci.created_at, ci.id
    limit 1
    for update of ci;
    if v_target_card.id is null then
      raise exception using errcode = 'P0001', message = 'EXPELLED_PLAYER_HAS_NO_BAGGAGE';
    end if;

    update public.card_instances set owner_member_id = v_actor_id where id = v_target_card.id;

  -- Watchdog: shorten the current briefing or mark the coming briefing as 30s.
  elsif v_action.card_id = 'action_17' then
    if v_session.phase not in ('reveal', 'briefing') then
      raise exception using errcode = 'P0001', message = 'WATCHDOG_WINDOW_CLOSED';
    end if;

    v_state := jsonb_set(v_state, '{watchdog_round}', to_jsonb(v_session.round_number), true);

    if v_session.phase = 'briefing' then
      update public.game_sessions
      set deadline_at = case
            when deadline_at is null then now() + interval '30 seconds'
            else least(deadline_at, now() + interval '30 seconds')
          end,
          updated_at = now()
      where id = v_session.id;
    end if;

  -- Session Hijacking: exchange the two players' Vulnerability cards.
  elsif v_action.card_id = 'action_18' then
    if p_target_member_id is null or p_target_member_id = v_actor_id then
      raise exception using errcode = 'P0001', message = 'ACTION_TARGET_REQUIRED';
    end if;

    select ci.* into v_actor_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = v_actor_id
      and ci.zone = 'hand' and cc.category = 'vulnerabilities'
    for update of ci;

    select ci.* into v_target_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'vulnerabilities'
    for update of ci;

    if v_actor_card.id is null or v_target_card.id is null then
      raise exception using errcode = 'P0001', message = 'VULNERABILITY_CARD_NOT_AVAILABLE';
    end if;

    update public.card_instances set owner_member_id = p_target_member_id where id = v_actor_card.id;
    update public.card_instances set owner_member_id = v_actor_id where id = v_target_card.id;

  -- Memory Dump: privately view all hidden cards held by the selected player.
  elsif v_action.card_id = 'action_20' then
    if p_target_member_id is null or p_target_member_id = v_actor_id then
      raise exception using errcode = 'P0001', message = 'ACTION_TARGET_REQUIRED';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'card_id', cc.card_id,
      'category', cc.category,
      'title', cc.title_original,
      'description', cc.description_original
    ) order by cc.category, cc.source_number), '[]'::jsonb)
      into v_private_cards
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id
      and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand'
      and ci.instance_status = 'hidden';

    if jsonb_array_length(v_private_cards) = 0 then
      raise exception using errcode = 'P0001', message = 'TARGET_HAS_NO_HIDDEN_CARDS';
    end if;

    v_private_payload := jsonb_build_object(
      'action_id', 'action_20',
      'target_member_id', p_target_member_id,
      'target_name', v_target_name,
      'cards', v_private_cards
    );

    insert into public.player_private_events (room_id, member_id, event_type, private_payload)
    values (p_room_id, v_actor_id, 'action_card_private_result', v_private_payload);

  -- Workaround: mark one selected active Crisis as ignored by the final-audit UI.
  elsif v_action.card_id = 'action_21' then
    if p_target_card_instance_id is null then
      raise exception using errcode = 'P0001', message = 'ACTIVE_CRISIS_TARGET_REQUIRED';
    end if;

    select ci.* into v_crisis_card
    from public.card_instances ci
    where ci.id = p_target_card_instance_id
      and ci.session_id = v_session.id
      and ci.room_id = p_room_id
      and ci.zone = 'active_crisis'
    for update;

    if v_crisis_card.id is null then
      raise exception using errcode = 'P0001', message = 'ACTIVE_CRISIS_NOT_AVAILABLE';
    end if;

    v_state := jsonb_set(
      v_state,
      '{ignored_crisis_ids}',
      coalesce(v_state->'ignored_crisis_ids', '[]'::jsonb)
        || jsonb_build_array(v_crisis_card.id::text),
      true
    );

  -- Kernel Driver Injection: draw a second Baggage card from the Baggage deck.
  elsif v_action.card_id = 'action_24' then
    select ci.* into v_drawn_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.zone = 'category_deck'
      and cc.category = 'baggage'
    order by ci.deck_position, ci.created_at
    limit 1
    for update of ci skip locked;

    if v_drawn_card.id is null then
      raise exception using errcode = 'P0001', message = 'BAGGAGE_DECK_EMPTY';
    end if;

    update public.card_instances
    set zone = 'hand', owner_member_id = v_actor_id,
        instance_status = 'hidden', deck_position = null,
        revealed_at = null, revealed_by_member_id = null
    where id = v_drawn_card.id;

  -- Safe Boot remains disabled until Vulnerability effects are formalized.
  elsif v_action.card_id = 'action_25' then
    v_state := jsonb_set(
      v_state,
      '{vulnerabilities_disabled_round}',
      to_jsonb(v_session.round_number),
      true
    );

  -- Factory Reset: discard all held core cards and redraw one of each four categories.
  elsif v_action.card_id = 'action_29' then
    select ci.* into v_role_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.zone = 'category_deck' and cc.category = 'roles'
    order by ci.deck_position, ci.created_at
    limit 1 for update of ci skip locked;

    select ci.* into v_skill_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.zone = 'category_deck' and cc.category = 'skills'
    order by ci.deck_position, ci.created_at
    limit 1 for update of ci skip locked;

    select ci.* into v_baggage_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.zone = 'category_deck' and cc.category = 'baggage'
    order by ci.deck_position, ci.created_at
    limit 1 for update of ci skip locked;

    select ci.* into v_vulnerability_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.zone = 'category_deck' and cc.category = 'vulnerabilities'
    order by ci.deck_position, ci.created_at
    limit 1 for update of ci skip locked;

    if v_role_card.id is null or v_skill_card.id is null
       or v_baggage_card.id is null or v_vulnerability_card.id is null then
      raise exception using errcode = 'P0001', message = 'FACTORY_RESET_DECK_INCOMPLETE';
    end if;

    update public.card_instances ci
    set zone = 'discard', owner_member_id = null,
        instance_status = 'hidden', deck_position = null,
        revealed_at = null, revealed_by_member_id = null
    from public.card_catalog cc
    where cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      and ci.session_id = v_session.id and ci.room_id = p_room_id
      and ci.owner_member_id = v_actor_id and ci.zone = 'hand'
      and cc.category in ('roles', 'skills', 'baggage', 'vulnerabilities');

    update public.card_instances
    set zone = 'hand', owner_member_id = v_actor_id, instance_status = 'hidden',
        deck_position = null, revealed_at = null, revealed_by_member_id = null
    where id in (v_role_card.id, v_skill_card.id, v_baggage_card.id, v_vulnerability_card.id);
  end if;

  -- Using any action reveals the action card publicly.
  update public.card_instances
  set instance_status = 'revealed',
      revealed_at = coalesce(revealed_at, now()),
      revealed_by_member_id = coalesce(revealed_by_member_id, v_actor_id)
  where id = v_action.id;

  insert into public.game_action_uses (
    session_id, room_id, actor_member_id, card_instance_id,
    action_id, effect_id, result_payload
  )
  values (
    v_session.id, p_room_id, v_actor_id, v_action.id,
    v_action.card_id, v_effect_id,
    jsonb_build_object(
      'target_member_id', p_target_member_id,
      'target_name', v_target_name,
      'target_card_instance_id', p_target_card_instance_id,
      'round', v_session.round_number,
      'phase', v_session.phase
    )
  );

  update public.game_sessions
  set state_version = state_version + 1,
      updated_at = now()
  where id = v_session.id
  returning state_version into v_new_version;

  v_state := jsonb_set(
    v_state,
    '{used_action_cards}',
    coalesce(v_state->'used_action_cards', '[]'::jsonb)
      || jsonb_build_array(v_action.id::text),
    true
  );

  update public.public_game_state
  set payload = v_state,
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (
    room_id, session_id, event_type, public_payload
  )
  values (
    p_room_id,
    v_session.id,
    'action_card_used',
    jsonb_build_object(
      'action_id', v_action.card_id,
      'effect_id', v_effect_id,
      'card_instance_id', v_action.id,
      'actor_member_id', v_actor_id,
      'actor_name', v_actor_name,
      'target_member_id', p_target_member_id,
      'target_name', v_target_name,
      'round', v_session.round_number,
      'phase', v_session.phase
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'action_id', v_action.card_id,
    'effect_id', v_effect_id,
    'card_instance_id', v_action.id,
    'target_member_id', p_target_member_id,
    'target_name', v_target_name,
    'state_version', v_new_version
  );

  insert into public.command_receipts (
    user_id, command_id, command_name, response_json
  )
  values (
    v_user_id, p_command_id, 'api_use_action_effect', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.api_use_action_effect(uuid, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.api_use_action_effect(uuid, uuid, uuid, uuid, uuid, text) to authenticated;


-- Vote resolution now understands Rollback and both Veto modes.
create or replace function public.api_resolve_vote(
  p_room_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
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
      raise exception using errcode = 'P0001', message = 'VOTE_TIE_NEEDS_RULE';
    end if;

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
    case when v_cancelled then 'vote_cancelled' else 'player_eliminated' end,
    jsonb_build_object(
      'member_id', v_eliminated_id,
      'display_name', v_eliminated_name,
      'votes', v_max_votes,
      'tie_break_used', (v_initial_tied_count > 1),
      'tie_saved', v_tie_save_applied,
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
    'no_elimination', v_cancelled
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_resolve_vote', v_result);

  return v_result;
end;
$;

revoke all on function public.api_resolve_vote(uuid, uuid) from public, anon;
grant execute on function public.api_resolve_vote(uuid, uuid) to authenticated;


commit;
