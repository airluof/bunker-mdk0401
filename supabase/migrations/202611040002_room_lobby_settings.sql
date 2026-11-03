begin;

create or replace function public.api_update_room_settings(
  p_room_id uuid,
  p_max_players integer,
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
  v_member_count integer;
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

  if p_max_players is null or p_max_players not between 8 and 16 then
    raise exception using errcode = '22023', message = 'INVALID_MAX_PLAYERS';
  end if;

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if v_existing_name <> 'api_update_room_settings' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select *
    into v_room
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

  select count(*)::integer
    into v_member_count
  from public.room_members m
  where m.room_id = p_room_id
    and m.membership_status = 'active';

  if p_max_players < v_member_count then
    raise exception using errcode = '22023', message = 'ROOM_CAPACITY_BELOW_CURRENT';
  end if;

  update public.rooms
  set max_players = p_max_players::smallint,
      updated_at = now()
  where id = p_room_id;

  v_result := jsonb_build_object(
    'ok', true,
    'room_id', p_room_id,
    'max_players', p_max_players
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_update_room_settings', v_result);

  return v_result;
end;
$$;

revoke all on function public.api_update_room_settings(uuid, integer, uuid) from public, anon;
grant execute on function public.api_update_room_settings(uuid, integer, uuid) to authenticated;


do $
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.rooms;
    exception when duplicate_object then null;
    end;
  end if;
end;
$;

alter table public.rooms replica identity full;

commit;
