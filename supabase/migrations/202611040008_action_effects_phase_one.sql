begin;

-- Phase one of the action-card engine.
-- The source text for action_28 explicitly allows activation at any time before
-- the final phase and increases bunker capacity by exactly one place.

create table if not exists public.game_action_uses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_member_id uuid not null references public.room_members(id) on delete restrict,
  card_instance_id uuid not null references public.card_instances(id) on delete restrict,
  action_id text not null,
  effect_id text not null,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, card_instance_id)
);

create index if not exists game_action_uses_room_created_idx
  on public.game_action_uses(room_id, created_at);

alter table public.game_action_uses enable row level security;
revoke all on public.game_action_uses from public, anon, authenticated;

-- Only this effect is approved in this phase. The remaining 29 cards stay
-- unapproved until their timing, targets and conflict rules are settled.
update public.card_catalog
set effect_handler_id = 'emergency_generator_capacity_plus_one',
    effect_status = 'approved'
where card_id = 'action_28'
  and category = 'actions'
  and catalog_version = 'v1';

create or replace function public.api_use_action_card(
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
  v_room public.rooms%rowtype;
  v_session public.game_sessions%rowtype;
  v_member_id uuid;
  v_member_name text;
  v_card public.card_instances%rowtype;
  v_state jsonb;
  v_old_capacity integer;
  v_new_capacity integer;
  v_new_version bigint;
  v_result jsonb;
  v_existing jsonb;
  v_existing_name text;
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
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if v_existing_name <> 'api_use_action_card' then
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
    into v_member_id, v_member_name
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

  select ci.*
    into v_card
  from public.card_instances ci
  join public.card_catalog cc
    on cc.card_id = ci.card_id
   and cc.catalog_version = ci.catalog_version
  where ci.id = p_card_instance_id
    and ci.session_id = v_session.id
    and ci.room_id = p_room_id
    and ci.owner_member_id = v_member_id
    and ci.zone = 'hand'
    and ci.card_id = 'action_28'
    and cc.category = 'actions'
    and cc.effect_status = 'approved'
    and cc.effect_handler_id = 'emergency_generator_capacity_plus_one'
  for update of ci;

  if v_card.id is null then
    raise exception using errcode = 'P0001', message = 'ACTION_CARD_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from public.game_action_uses u
    where u.session_id = v_session.id
      and u.card_instance_id = v_card.id
  ) then
    raise exception using errcode = 'P0001', message = 'ACTION_ALREADY_USED';
  end if;

  select p.payload
    into v_state
  from public.public_game_state p
  where p.room_id = p_room_id
  for update;

  if v_state is null then
    raise exception using errcode = 'P0001', message = 'GAME_STATE_NOT_FOUND';
  end if;

  v_old_capacity := coalesce(nullif(v_state->>'bunker_capacity', '')::integer, 2);
  v_new_capacity := v_old_capacity + 1;

  -- Playing the card makes it public, including when it was still hidden.
  update public.card_instances
  set instance_status = 'revealed',
      revealed_at = coalesce(revealed_at, now()),
      revealed_by_member_id = coalesce(revealed_by_member_id, v_member_id)
  where id = v_card.id;

  insert into public.game_action_uses (
    session_id, room_id, actor_member_id, card_instance_id,
    action_id, effect_id, result_payload
  )
  values (
    v_session.id, p_room_id, v_member_id, v_card.id,
    'action_28', 'emergency_generator_capacity_plus_one',
    jsonb_build_object(
      'capacity_before', v_old_capacity,
      'capacity_after', v_new_capacity
    )
  );

  update public.game_sessions
  set state_version = state_version + 1,
      updated_at = now()
  where id = v_session.id
  returning state_version into v_new_version;

  update public.public_game_state
  set payload = jsonb_set(
        jsonb_set(
          payload,
          '{bunker_capacity}',
          to_jsonb(v_new_capacity),
          true
        ),
        '{used_action_cards}',
        coalesce(payload->'used_action_cards', '[]'::jsonb)
          || jsonb_build_array(v_card.id::text),
        true
      ),
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
      'action_id', 'action_28',
      'effect_id', 'emergency_generator_capacity_plus_one',
      'card_instance_id', v_card.id,
      'actor_member_id', v_member_id,
      'actor_name', v_member_name,
      'capacity_before', v_old_capacity,
      'capacity_after', v_new_capacity,
      'round', v_session.round_number,
      'phase', v_session.phase
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'action_id', 'action_28',
    'effect_id', 'emergency_generator_capacity_plus_one',
    'card_instance_id', v_card.id,
    'capacity_before', v_old_capacity,
    'capacity_after', v_new_capacity,
    'state_version', v_new_version
  );

  insert into public.command_receipts (
    user_id, command_id, command_name, response_json
  )
  values (
    v_user_id, p_command_id, 'api_use_action_card', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.api_use_action_card(uuid, uuid, uuid) from public, anon;
grant execute on function public.api_use_action_card(uuid, uuid, uuid) to authenticated;

commit;
