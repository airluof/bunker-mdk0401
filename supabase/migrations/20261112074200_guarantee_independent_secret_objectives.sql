-- Guarantee each active player receives an independently randomized objective.
begin;

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
      randomized.member_id,
      randomized.objective_key
    from (
      select
        m.id as member_id,
        c.objective_key,
        row_number() over (partition by m.id order by random()) as objective_rank
      from public.room_members m
      cross join private.secret_objective_catalog c
      where m.room_id = new.room_id
        and m.membership_status = 'active'
        and c.active
    ) randomized
    where randomized.objective_rank = 1
    on conflict (session_id, member_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.assign_secret_objectives() from public, anon, authenticated;

commit;