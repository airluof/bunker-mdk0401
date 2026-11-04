-- Allow five-letter room invite codes with the full Latin A-Z alphabet.
-- Existing 32-character hexadecimal invite codes remain valid.

create or replace function public.api_create_room(
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
  v_room_id uuid;
  v_member_id uuid;
  v_session_id uuid;
  v_code text;
  v_hash text;
  v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_attempt integer;
  v_char_index integer;
  v_random_byte integer;
  v_existing jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;

  if p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR: command_id is required';
  end if;

  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 24 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR: display name must contain 2-24 characters';
  end if;

  select cr.response_json into v_existing
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if (select cr.command_name from public.command_receipts cr
        where cr.user_id = v_user_id and cr.command_id = p_command_id) <> 'api_create_room' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  v_room_id := gen_random_uuid();
  v_member_id := gen_random_uuid();
  v_session_id := gen_random_uuid();

  insert into public.rooms (id, created_by_user_id)
  values (v_room_id, v_user_id);

  insert into public.room_members (
    id, room_id, user_id, display_name, technical_role, membership_status
  )
  values (
    v_member_id, v_room_id, v_user_id, btrim(p_display_name), 'host', 'active'
  );

  -- Generate a readable five-letter code. Exclude I and O to avoid visual confusion.
  -- Rejection sampling keeps each of the 26 letters equally likely.
  for v_attempt in 1..100 loop
    v_code := '';
    for v_char_index in 1..5 loop
      loop
        v_random_byte := get_byte(extensions.gen_random_bytes(1), 0);
        exit when v_random_byte < 234;
      end loop;
      v_code := v_code || substr(v_alphabet, (v_random_byte % 26) + 1, 1);
    end loop;

    v_hash := encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

    begin
      insert into public.room_invites (room_id, code_hash)
      values (v_room_id, v_hash);
      exit;
    exception
      when unique_violation then
        -- A retired invite may already have used this code. Generate another one.
        if not exists (
          select 1 from public.room_invites where code_hash = v_hash
        ) then
          raise;
        end if;
        if v_attempt = 100 then
          raise exception using errcode = 'P0001', message = 'INVITE_CODE_GENERATION_FAILED';
        end if;
    end;
  end loop;

  insert into public.game_sessions (id, room_id)
  values (v_session_id, v_room_id);

  insert into public.public_game_state (room_id, session_id, payload)
  values (
    v_room_id,
    v_session_id,
    jsonb_build_object('status', 'lobby', 'phase', 'lobby', 'round', 1)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'room_id', v_room_id,
    'member_id', v_member_id,
    'invite_code', v_code,
    'status', 'lobby'
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_create_room', v_result - 'invite_code');

  return v_result;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'ACTIVE_ROOM_OR_DUPLICATE_NAME';
end;
$$;

create or replace function public.api_join_room(
  p_invite_code text,
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
  v_room_id uuid;
  v_room_status text;
  v_max_players integer;
  v_member_id uuid;
  v_existing_status text;
  v_active_count integer;
  v_hash text;
  v_existing_result jsonb;
  v_result jsonb;
  v_command_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;

  if p_command_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if p_invite_code is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if upper(btrim(p_invite_code)) !~ '^([A-Z]{5}|[0-9A-F]{32})$' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if p_display_name is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if char_length(btrim(p_display_name)) not between 2 and 24 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select cr.response_json, cr.command_name
    into v_existing_result, v_command_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if v_command_name <> 'api_join_room' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing_result;
  end if;

  v_hash := encode(
    extensions.digest(convert_to(upper(btrim(p_invite_code)), 'UTF8'), 'sha256'),
    'hex'
  );

  select r.id, r.status, r.max_players
    into v_room_id, v_room_status, v_max_players
  from public.room_invites i
  join public.rooms r on r.id = i.room_id
  where i.code_hash = v_hash and i.is_active = true
  for update of r;

  if v_room_id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;

  if v_room_status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_JOINABLE';
  end if;

  select m.id, m.membership_status
    into v_member_id, v_existing_status
  from public.room_members m
  where m.room_id = v_room_id and m.user_id = v_user_id
  for update;

  if v_member_id is not null then
    if v_existing_status = 'left' then
      update public.room_members
      set membership_status = 'active',
          display_name = btrim(p_display_name),
          last_seen_at = now()
      where id = v_member_id;
    else
      update public.room_members
      set last_seen_at = now()
      where id = v_member_id;
    end if;
  else
    select count(*) into v_active_count
    from public.room_members m
    where m.room_id = v_room_id and m.membership_status = 'active';

    if v_active_count >= v_max_players then
      raise exception using errcode = 'P0001', message = 'ROOM_FULL';
    end if;

    v_member_id := gen_random_uuid();
    insert into public.room_members (
      id, room_id, user_id, display_name, technical_role, membership_status, last_seen_at
    )
    values (
      v_member_id, v_room_id, v_user_id, btrim(p_display_name), 'player', 'active', now()
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'room_id', v_room_id,
    'member_id', v_member_id,
    'status', 'lobby'
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_join_room', v_result);

  return v_result;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'ACTIVE_ROOM_OR_DUPLICATE_NAME';
end;
$$;

revoke all on function public.api_create_room(text, uuid) from public, anon;
revoke all on function public.api_join_room(text, text, uuid) from public, anon;
grant execute on function public.api_create_room(text, uuid) to authenticated;
grant execute on function public.api_join_room(text, text, uuid) to authenticated;
