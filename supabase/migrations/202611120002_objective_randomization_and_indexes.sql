-- Ensure private goals are independently randomized and index their foreign keys.
begin;

create index if not exists game_secret_objectives_room_member_idx
  on private.game_secret_objectives(room_id, member_id);
create index if not exists game_secret_objectives_objective_key_idx
  on private.game_secret_objectives(objective_key);
create index if not exists game_reputation_history_room_id_idx
  on private.game_reputation_history(room_id);
create index if not exists game_reputation_history_member_id_idx
  on private.game_reputation_history(member_id);

create or replace function private.assign_secret_objectives()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'waiting' and new.status = 'active' then
    insert into private.game_secret_objectives (
      session_id, room_id, member_id, objective_key
    )
    select
      new.id,
      new.room_id,
      m.id,
      objective.objective_key
    from public.room_members m
    cross join lateral (
      select c.objective_key
      from private.secret_objective_catalog c
      where c.active
      order by random()
      limit 1
    ) objective
    where m.room_id = new.room_id
      and m.membership_status = 'active'
    on conflict (session_id, member_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.assign_secret_objectives() from public, anon, authenticated;

commit;