begin;

-- Expose only synthetic bot hands and the crisis deck to the room host.
-- Human players' private hands remain hidden from this test helper.
create or replace function public.api_get_test_bot_data(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_status text;
  v_result jsonb;
  v_bot_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select r.status into v_room_status
  from public.rooms r
  where r.id = p_room_id and r.created_by_user_id = v_user_id;

  if v_room_status is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN_OR_ROOM_NOT_FOUND';
  end if;
  if v_room_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'GAME_NOT_STARTED';
  end if;

  select count(*) into v_bot_count
  from public.room_members m
  where m.room_id = p_room_id
    and m.membership_status = 'active'
    and m.is_bot = true;

  if v_bot_count < 1 then
    raise exception using errcode = 'P0001', message = 'TEST_BOTS_REQUIRED';
  end if;

  select jsonb_build_object(
    'bot_hands', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'member_id', m.id,
          'cards', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'card_id', cc.card_id,
                'category', cc.category,
                'title', cc.title_original,
                'description', cc.description_original,
                'image_path', cc.image_path
              ) order by cc.source_number
            )
            from public.card_instances ci
            join public.card_catalog cc
              on cc.card_id = ci.card_id
             and cc.catalog_version = ci.catalog_version
            where ci.room_id = p_room_id
              and ci.owner_member_id = m.id
              and ci.zone = 'hand'
          ), '[]'::jsonb)
        ) order by m.joined_at, m.id
      )
      from public.room_members m
      where m.room_id = p_room_id
        and m.membership_status = 'active'
        and m.is_bot = true
    ), '[]'::jsonb),
    'crisis_deck', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'card_id', cc.card_id,
          'category', cc.category,
          'title', cc.title_original,
          'description', cc.description_original,
          'image_path', cc.image_path
        ) order by ci.deck_position
      )
      from public.card_instances ci
      join public.card_catalog cc
        on cc.card_id = ci.card_id
       and cc.catalog_version = ci.catalog_version
      where ci.room_id = p_room_id
        and ci.zone = 'crisis_deck'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.api_get_test_bot_data(uuid) from public, anon;
grant execute on function public.api_get_test_bot_data(uuid) to authenticated;

commit;
