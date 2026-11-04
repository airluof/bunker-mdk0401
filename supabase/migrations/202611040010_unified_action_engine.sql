begin;

-- Expand the card-instance zones so unused source cards remain in server-owned
-- category decks. This enables effects that draw replacement cards.
alter table public.card_instances
  drop constraint if exists card_instances_zone_check;

alter table public.card_instances
  add constraint card_instances_zone_check
  check (zone in ('hand', 'crisis_deck', 'active_crisis', 'category_deck', 'discard'));

-- Populate the undrawn cards after the initial five-card hand has been dealt.
-- The function is safe to run more than once and never duplicates a card.
create or replace function private.populate_category_decks(p_session_id uuid, p_room_id uuid, p_catalog_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.card_instances (
    session_id, room_id, owner_member_id, card_id, catalog_version,
    zone, instance_status, deck_position
  )
  select
    p_session_id,
    p_room_id,
    null,
    ranked.card_id,
    p_catalog_version,
    'category_deck',
    'hidden',
    ranked.deck_position
  from (
    select
      cc.card_id,
      row_number() over (
        partition by cc.category
        order by extensions.gen_random_bytes(16)
      )::smallint as deck_position
    from public.card_catalog cc
    where cc.catalog_version = p_catalog_version
      and cc.category in ('roles', 'skills', 'baggage', 'vulnerabilities', 'actions')
      and not exists (
        select 1
        from public.card_instances ci
        where ci.session_id = p_session_id
          and ci.card_id = cc.card_id
          and ci.catalog_version = cc.catalog_version
      )
  ) ranked;
end;
$$;

revoke all on function private.populate_category_decks(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.populate_category_decks_after_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_version text;
begin
  if old.status is distinct from 'active' and new.status = 'active' then
    select s.catalog_version into v_catalog_version
    from public.game_sessions s
    where s.id = new.id;

    perform private.populate_category_decks(new.id, new.room_id, v_catalog_version);
  end if;
  return new;
end;
$$;

drop trigger if exists game_sessions_populate_category_decks on public.game_sessions;
create trigger game_sessions_populate_category_decks
after update of status on public.game_sessions
for each row execute function private.populate_category_decks_after_start();

revoke all on function private.populate_category_decks_after_start() from public, anon, authenticated;

-- Backfill sessions that were started before this migration.
do $$
declare
  v_session record;
begin
  for v_session in
    select s.id, s.room_id, s.catalog_version
    from public.game_sessions s
    where s.status = 'active'
  loop
    perform private.populate_category_decks(
      v_session.id,
      v_session.room_id,
      v_session.catalog_version
    );
  end loop;
end;
$$;

-- These effects are sufficiently described by the source cards to be executed
-- without inventing extra scoring, voting, or teacher-judgement rules.
update public.card_catalog
set effect_status = 'approved',
    effect_handler_id = case card_id
      when 'action_03' then 'hot_swap_baggage'
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
      else effect_handler_id
    end
where category = 'actions'
  and catalog_version = 'v1'
  and card_id in (
    'action_03', 'action_06', 'action_08', 'action_10', 'action_12',
    'action_15', 'action_16', 'action_17', 'action_18', 'action_20',
    'action_21', 'action_24', 'action_25'
  );

-- A single server entry point for the approved action handlers.
-- action_04 and action_28 keep their existing specialized RPCs.
create or replace function public.api_use_action_effect(
  p_room_id uuid,
  p_card_instance_id uuid,
  p_target_member_id uuid,
  p_target_card_instance_id uuid,
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
      'action_03', 'action_06', 'action_08', 'action_10', 'action_12',
      'action_15', 'action_16', 'action_17', 'action_18', 'action_20',
      'action_21', 'action_24', 'action_25'
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
    when 'action_03' then 'hot_swap_baggage'
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
    else null
  end;

  if v_effect_id is null then
    raise exception using errcode = 'P0001', message = 'ACTION_EFFECT_NOT_IMPLEMENTED';
  end if;

  -- Hot-Swap: exchange the owner's single Baggage with the top of the Baggage
  -- deck, or exchange it with one Baggage held by an expelled player.
  if v_action.card_id = 'action_03' then
    select count(*) into v_card_count
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = v_actor_id
      and ci.zone = 'hand' and cc.category = 'baggage';

    if v_card_count <> 1 then
      raise exception using errcode = 'P0001', message = 'HOT_SWAP_REQUIRES_ONE_OWN_BAGGAGE';
    end if;

    select ci.* into v_actor_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = v_actor_id
      and ci.zone = 'hand' and cc.category = 'baggage'
    for update of ci;

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

      select count(*) into v_card_count
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
        and ci.zone = 'hand' and cc.category = 'baggage';

      if v_card_count <> 1 then
        raise exception using errcode = 'P0001', message = 'HOT_SWAP_TARGET_REQUIRES_ONE_BAGGAGE';
      end if;

      select ci.* into v_target_card
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
        and ci.zone = 'hand' and cc.category = 'baggage'
      for update of ci;

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

    select count(*) into v_card_count
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'baggage';

    if v_card_count <> 1 then
      raise exception using errcode = 'P0001', message = 'TARGET_MUST_HAVE_EXACTLY_ONE_BAGGAGE';
    end if;

    select ci.* into v_target_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'baggage'
    for update of ci;

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

    select count(*) into v_card_count
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'baggage';

    if v_card_count <> 1 then
      raise exception using errcode = 'P0001', message = 'EXPELLED_PLAYER_MUST_HAVE_ONE_BAGGAGE';
    end if;

    select ci.* into v_target_card
    from public.card_instances ci
    join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
    where ci.session_id = v_session.id and ci.owner_member_id = p_target_member_id
      and ci.zone = 'hand' and cc.category = 'baggage'
    for update of ci;

    update public.card_instances set owner_member_id = v_actor_id where id = v_target_card.id;

  -- Watchdog: shorten the current briefing or mark the coming briefing as 30s.
  elsif v_action.card_id = 'action_17' then
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

  -- Safe Boot: disable vulnerability effects for the current round.
  elsif v_action.card_id = 'action_25' then
    v_state := jsonb_set(
      v_state,
      '{vulnerabilities_disabled_round}',
      to_jsonb(v_session.round_number),
      true
    );
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

revoke all on function public.api_use_action_effect(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.api_use_action_effect(uuid, uuid, uuid, uuid, uuid) to authenticated;

-- Private action results are fetched only for the authenticated member's own
-- events. The other players' peek results are never part of the public snapshot.
create or replace function public.api_get_my_action_private_data(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_result jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type', e.event_type,
    'private_payload', e.private_payload,
    'created_at', e.created_at
  ) order by e.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select *
    from public.player_private_events e
    where e.room_id = p_room_id
      and e.member_id = v_member_id
    order by e.created_at desc
    limit 20
  ) e;

  return jsonb_build_object('events', v_result);
end;
$$;

revoke all on function public.api_get_my_action_private_data(uuid) from public, anon;
grant execute on function public.api_get_my_action_private_data(uuid) to authenticated;

-- If Watchdog was played during the reveal phase, the normal briefing
-- transition starts a 30-second timer instead of the usual 60-second timer.
create or replace function private.apply_watchdog_briefing_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_watchdog_round integer;
begin
  if new.phase = 'briefing' and old.phase is distinct from 'briefing' then
    select nullif(p.payload->>'watchdog_round', '')::integer
      into v_watchdog_round
    from public.public_game_state p
    where p.room_id = new.room_id;

    if v_watchdog_round = new.round_number then
      new.deadline_at := now() + interval '30 seconds';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists game_sessions_watchdog_deadline on public.game_sessions;
create trigger game_sessions_watchdog_deadline
before update of phase on public.game_sessions
for each row execute function private.apply_watchdog_briefing_deadline();

revoke all on function private.apply_watchdog_briefing_deadline() from public, anon, authenticated;

commit;
