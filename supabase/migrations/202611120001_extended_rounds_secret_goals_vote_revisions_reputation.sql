-- Extended rounds, private objectives, vote revisions, and match reputation.
begin;
alter table public.game_sessions drop constraint if exists game_sessions_round_number_check;
alter table public.game_sessions drop constraint if exists game_sessions_max_rounds_check;
alter table public.game_sessions
 add constraint game_sessions_round_number_check check (round_number between 1 and 30),
 add constraint game_sessions_max_rounds_check check (max_rounds between 1 and 30);
alter table public.game_round_reveals drop constraint if exists game_round_reveals_round_number_check;
alter table public.game_round_reveals
 add constraint game_round_reveals_round_number_check check (round_number between 1 and 30);
alter table public.votes add column if not exists revision_count smallint not null default 0;
alter table public.votes drop constraint if exists votes_revision_count_check;
alter table public.votes add constraint votes_revision_count_check check (revision_count between 0 and 1);

create table if not exists private.secret_objective_catalog (
 objective_key text primary key, title text not null, description text not null,
 active boolean not null default true
);
create table if not exists private.game_secret_objectives (
 session_id uuid not null references public.game_sessions(id) on delete cascade,
 room_id uuid not null references public.rooms(id) on delete cascade,
 member_id uuid not null references public.room_members(id) on delete cascade,
 objective_key text not null references private.secret_objective_catalog(objective_key),
 assigned_at timestamptz not null default clock_timestamp(),
 completed boolean, completed_at timestamptz,
 primary key(session_id,member_id)
);
create table if not exists private.game_reputation_history (
 session_id uuid not null references public.game_sessions(id) on delete cascade,
 room_id uuid not null references public.rooms(id) on delete cascade,
 member_id uuid not null references public.room_members(id) on delete cascade,
 display_name text not null, points integer not null default 0,
 awards text[] not null default array[]::text[],
 objective_completed boolean not null default false,
 correct_votes integer not null default 0, votes_received integer not null default 0,
 survived boolean not null default false, created_at timestamptz not null default clock_timestamp(),
 primary key(session_id,member_id)
);
create table if not exists private.player_reputation_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 total_points integer not null default 0, games_played integer not null default 0,
 completed_objectives integer not null default 0, correct_votes integer not null default 0,
 survivals integer not null default 0, updated_at timestamptz not null default clock_timestamp()
);
alter table private.secret_objective_catalog enable row level security;
alter table private.game_secret_objectives enable row level security;
alter table private.game_reputation_history enable row level security;
alter table private.player_reputation_profiles enable row level security;
revoke all on table private.secret_objective_catalog, private.game_secret_objectives,
 private.game_reputation_history, private.player_reputation_profiles
 from public, anon, authenticated;

insert into private.secret_objective_catalog(objective_key,title,description) values
 ('reveal_role','Раскрыть свою роль','Раскрой карту «Роль» не позднее второго раунда.'),
 ('reveal_skill','Показать мастерство','Раскрой карту «Навык» не позднее третьего раунда.'),
 ('reveal_baggage','Полезный багаж','Раскрой карту «Багаж» не позднее третьего раунда.'),
 ('reveal_vulnerability','Честность под угрозой','Раскрой карту «Уязвимость» не позднее четвёртого раунда.'),
 ('reveal_action','План Б','Раскрой карту «Действие» не позднее пятого раунда.'),
 ('correct_vote','Холодный расчёт','Хотя бы раз проголосуй за участника, который выбыл в том же раунде.'),
 ('avoid_votes','Остаться незамеченным','Заверши партию, не получив ни одного голоса против себя.'),
 ('survive_under_pressure','Выстоять под давлением','Останься в игре до финала, получив не менее двух голосов против себя.')
on conflict(objective_key) do update set
 title=excluded.title,description=excluded.description,active=true;

create or replace function private.set_dynamic_game_round_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_player_count integer; v_capacity integer;
begin
 if old.status='waiting' and new.status='active' then
  select count(*) into v_player_count from public.room_members m
  where m.room_id=new.room_id and m.membership_status='active';
  v_capacity:=greatest(2,floor(v_player_count::numeric/2)::integer);
  new.max_rounds:=least(30,greatest(5,v_player_count-v_capacity));
 end if;
 return new;
end;
$$;
drop trigger if exists trg_game_sessions_round_limit_before_start on public.game_sessions;
create trigger trg_game_sessions_round_limit_before_start
before update of status on public.game_sessions
for each row execute function private.set_dynamic_game_round_limit();

create or replace function private.assign_secret_objectives()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if old.status='waiting' and new.status='active' then
  insert into private.game_secret_objectives(session_id,room_id,member_id,objective_key)
  select new.id,new.room_id,m.id,
   (select c.objective_key from private.secret_objective_catalog c where c.active order by random() limit 1)
  from public.room_members m
  where m.room_id=new.room_id and m.membership_status='active'
  on conflict(session_id,member_id) do nothing;
 end if;
 return new;
end;
$$;
drop trigger if exists trg_game_sessions_assign_secret_objectives on public.game_sessions;
create trigger trg_game_sessions_assign_secret_objectives
after update of status on public.game_sessions
for each row when (old.status='waiting' and new.status='active')
execute function private.assign_secret_objectives();

create or replace function private.open_vote_revision_window()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_session public.game_sessions%rowtype; v_pending integer;
begin
 select * into v_session from public.game_sessions s where s.id=new.session_id for update;
 if v_session.id is null or v_session.phase<>'voting'
    or v_session.round_number<>new.round_number or v_session.deadline_at is not null then
  return new;
 end if;
 select count(*) into v_pending
 from public.room_members m
 where m.room_id=new.room_id and m.membership_status='active' and m.is_alive and not m.is_bot
  and not exists (
   select 1 from public.votes v where v.session_id=new.session_id
    and v.round_number=new.round_number and v.voter_member_id=m.id
  );
 if v_pending=0 then
  update public.game_sessions
  set deadline_at=clock_timestamp()+interval '20 seconds'
  where id=v_session.id and deadline_at is null;
  if found then
   insert into public.public_game_events(room_id,session_id,event_type,public_payload)
   values(new.room_id,new.session_id,'vote_revision_opened',
    jsonb_build_object('round',new.round_number,'seconds',20));
  end if;
 end if;
 return new;
end;
$$;
drop trigger if exists trg_votes_open_revision_window on public.votes;
create trigger trg_votes_open_revision_window
after insert on public.votes
for each row execute function private.open_vote_revision_window();

create or replace function private.finalize_game_reputation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
 v_player record; v_objective_key text; v_completed boolean;
 v_correct_votes integer; v_votes_received integer; v_actions_used integer;
 v_points integer; v_awards text[]; v_inserted integer;
begin
 if new.status<>'finished' or old.status='finished' then return new; end if;
 for v_player in
  select m.id,m.user_id,m.display_name,m.is_alive,m.is_bot
  from public.room_members m
  where m.room_id=new.room_id and m.membership_status in ('active','left')
 loop
  select g.objective_key into v_objective_key from private.game_secret_objectives g
  where g.session_id=new.id and g.member_id=v_player.id;

  select count(*)::integer into v_correct_votes
  from public.votes v join public.room_members target
   on target.id=v.target_member_id and target.room_id=new.room_id
  where v.session_id=new.id and v.voter_member_id=v_player.id
   and target.eliminated_in_round=v.round_number;

  select count(*)::integer into v_votes_received from public.votes v
  where v.session_id=new.id and v.target_member_id=v_player.id;
  select count(*)::integer into v_actions_used from public.game_action_uses u
  where u.session_id=new.id and u.actor_member_id=v_player.id;

  v_completed:=case v_objective_key
   when 'reveal_role' then exists (
    select 1 from public.game_round_reveals rr
    join public.card_instances ci on ci.id=rr.card_instance_id
    join public.card_catalog cc on cc.card_id=ci.card_id and cc.catalog_version=ci.catalog_version
    where rr.session_id=new.id and rr.member_id=v_player.id and rr.round_number<=2 and cc.category='roles')
   when 'reveal_skill' then exists (
    select 1 from public.game_round_reveals rr
    join public.card_instances ci on ci.id=rr.card_instance_id
    join public.card_catalog cc on cc.card_id=ci.card_id and cc.catalog_version=ci.catalog_version
    where rr.session_id=new.id and rr.member_id=v_player.id and rr.round_number<=3 and cc.category='skills')
   when 'reveal_baggage' then exists (
    select 1 from public.game_round_reveals rr
    join public.card_instances ci on ci.id=rr.card_instance_id
    join public.card_catalog cc on cc.card_id=ci.card_id and cc.catalog_version=ci.catalog_version
    where rr.session_id=new.id and rr.member_id=v_player.id and rr.round_number<=3 and cc.category='baggage')
   when 'reveal_vulnerability' then exists (
    select 1 from public.game_round_reveals rr
    join public.card_instances ci on ci.id=rr.card_instance_id
    join public.card_catalog cc on cc.card_id=ci.card_id and cc.catalog_version=ci.catalog_version
    where rr.session_id=new.id and rr.member_id=v_player.id and rr.round_number<=4 and cc.category='vulnerabilities')
   when 'reveal_action' then exists (
    select 1 from public.game_round_reveals rr
    join public.card_instances ci on ci.id=rr.card_instance_id
    join public.card_catalog cc on cc.card_id=ci.card_id and cc.catalog_version=ci.catalog_version
    where rr.session_id=new.id and rr.member_id=v_player.id and rr.round_number<=5 and cc.category='actions')
   when 'correct_vote' then v_correct_votes>0
   when 'avoid_votes' then v_votes_received=0
   when 'survive_under_pressure' then v_player.is_alive and v_votes_received>=2
   else false end;

  update private.game_secret_objectives set completed=v_completed,
   completed_at=case when v_completed then clock_timestamp() else null end
  where session_id=new.id and member_id=v_player.id;

  v_points:=(case when v_player.is_alive then 3 else 0 end)
   +(case when v_completed then 5 else 0 end)
   +least(v_correct_votes,3)
   +(case when v_player.is_alive and v_votes_received>=2 then 2 else 0 end)
   +(case when v_actions_used>0 then 1 else 0 end);

  v_awards:=array[]::text[];
  if v_player.is_alive then v_awards:=array_append(v_awards,'Выживший'); end if;
  if v_completed then v_awards:=array_append(v_awards,'Секретная цель выполнена'); end if;
  if v_correct_votes>0 then v_awards:=array_append(v_awards,'Точный прогноз'); end if;
  if v_player.is_alive and v_votes_received>=2 then
   v_awards:=array_append(v_awards,'Под давлением');
  elsif v_player.is_alive and v_votes_received=0 then
   v_awards:=array_append(v_awards,'Незаметный');
  end if;
  if v_actions_used>0 then v_awards:=array_append(v_awards,'Оперативник'); end if;

  insert into private.game_reputation_history(session_id,room_id,member_id,display_name,
   points,awards,objective_completed,correct_votes,votes_received,survived)
  values(new.id,new.room_id,v_player.id,v_player.display_name,v_points,v_awards,
   v_completed,v_correct_votes,v_votes_received,v_player.is_alive)
  on conflict(session_id,member_id) do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=1 and v_player.user_id is not null and not v_player.is_bot then
   insert into private.player_reputation_profiles(user_id,total_points,games_played,
    completed_objectives,correct_votes,survivals,updated_at)
   values(v_player.user_id,v_points,1,case when v_completed then 1 else 0 end,
    v_correct_votes,case when v_player.is_alive then 1 else 0 end,clock_timestamp())
   on conflict(user_id) do update set
    total_points=private.player_reputation_profiles.total_points+excluded.total_points,
    games_played=private.player_reputation_profiles.games_played+1,
    completed_objectives=private.player_reputation_profiles.completed_objectives+excluded.completed_objectives,
    correct_votes=private.player_reputation_profiles.correct_votes+excluded.correct_votes,
    survivals=private.player_reputation_profiles.survivals+excluded.survivals,
    updated_at=clock_timestamp();
  end if;
 end loop;
 return new;
end;
$$;
drop trigger if exists trg_game_sessions_finalize_reputation on public.game_sessions;
create trigger trg_game_sessions_finalize_reputation
after update of status on public.game_sessions
for each row when (old.status is distinct from 'finished' and new.status='finished')
execute function private.finalize_game_reputation();

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
        select 1 from public.card_instances ci
        where ci.session_id = v_session.id and ci.owner_member_id = m.id
          and ci.zone = 'hand' and ci.instance_status = 'hidden'
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
        select * into v_card
        from public.card_instances ci
        where ci.room_id = p_room_id and ci.owner_member_id = v_bot.id
          and ci.zone = 'hand' and ci.instance_status = 'hidden'
        order by random() limit 1 for update;

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

create or replace function public.api_advance_game_round(
  p_room_id uuid,
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
  v_remaining integer;
  v_start_count integer;
  v_capacity integer;
  v_required_rounds integer;
  v_next_round integer;
  v_crisis public.card_instances%rowtype;
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
  from public.command_receipts cr where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_advance_game_round' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room from public.rooms r
  where r.id = p_room_id and r.created_by_user_id = v_user_id for update;
  if v_room.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN_OR_ROOM_NOT_FOUND';
  end if;

  select * into v_session from public.game_sessions s
  where s.room_id = p_room_id for update;
  if v_session.phase <> 'elimination' then
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select count(*) into v_remaining
  from public.room_members m
  where m.room_id = p_room_id and m.membership_status = 'active' and m.is_alive;

  select (p.payload->>'active_players_at_start')::integer,
         coalesce((p.payload->>'bunker_capacity')::integer, 2)
    into v_start_count, v_capacity
  from public.public_game_state p where p.room_id = p_room_id;

  -- Preserve enough rounds to reach capacity after ties or Rollback.
  v_required_rounds := least(30, greatest(
    v_session.max_rounds::integer,
    v_session.round_number::integer + greatest(0, v_remaining - v_capacity)
  ));
  update public.game_sessions set max_rounds = v_required_rounds where id = v_session.id;
  v_session.max_rounds := v_required_rounds;

  if v_remaining <= v_capacity or v_session.round_number >= v_session.max_rounds then
    update public.game_sessions
    set phase = 'audit', deadline_at = null,
        state_version = state_version + 1, updated_at = now()
    where id = v_session.id returning state_version into v_new_version;

    update public.public_game_state
    set payload = payload || jsonb_build_object('phase', 'audit', 'survivors', v_remaining),
        state_version = v_new_version, updated_at = now()
    where room_id = p_room_id;

    insert into public.public_game_events (room_id, session_id, event_type, public_payload)
    values (p_room_id, v_session.id, 'final_audit_started',
            jsonb_build_object('survivors', v_remaining, 'bunker_capacity', v_capacity,
                               'round', v_session.round_number));

    v_result := jsonb_build_object('ok', true, 'phase', 'audit', 'survivors', v_remaining,
                                   'bunker_capacity', v_capacity);
  else
    v_next_round := v_session.round_number + 1;

    if v_next_round in (2, 4) or v_next_round >= 6 then
      select * into v_crisis
      from public.card_instances ci
      where ci.room_id = p_room_id and ci.zone = 'crisis_deck'
      order by ci.deck_position
      limit 1 for update;

      if v_crisis.id is not null then
        update public.card_instances
        set zone = 'active_crisis', instance_status = 'revealed', revealed_at = now()
        where id = v_crisis.id;
        insert into public.public_game_events (room_id, session_id, event_type, public_payload)
        values (p_room_id, v_session.id, 'crisis_added',
                jsonb_build_object('card_id', v_crisis.card_id, 'round', v_next_round));
      end if;
    end if;

    update public.game_sessions
    set round_number = v_next_round, phase = 'reveal', deadline_at = null,
        state_version = state_version + 1, updated_at = now()
    where id = v_session.id returning state_version into v_new_version;

    update public.public_game_state
    set payload = payload - 'eliminated_member_id' - 'eliminated_name' - 'eliminated_vote_count' - 'tie_break_used'
                  || jsonb_build_object('phase', 'reveal', 'round', v_next_round),
        state_version = v_new_version, updated_at = now()
    where room_id = p_room_id;

    insert into public.public_game_events (room_id, session_id, event_type, public_payload)
    values (p_room_id, v_session.id, 'round_started',
            jsonb_build_object('round', v_next_round, 'survivors', v_remaining));

    v_result := jsonb_build_object('ok', true, 'phase', 'reveal', 'round', v_next_round);
  end if;

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_advance_game_round', v_result);

  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION public.api_resolve_vote(p_room_id uuid, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_tie_no_elimination boolean := false;
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
  if v_session.deadline_at is not null and v_session.deadline_at > now() then
    raise exception using errcode = 'P0001', message = 'VOTE_REVISION_WINDOW_RUNNING';
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
      -- A tied ordinary vote does not remove anyone; the party continues.
      v_tie_no_elimination := true;
    end if;

    if not v_tie_no_elimination then
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
    end if;
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
      'tie_no_elimination', v_tie_no_elimination,
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
    case
      when v_cancelled then 'vote_cancelled'
      when v_tie_no_elimination then 'vote_tied_no_elimination'
      else 'player_eliminated'
    end,
    jsonb_build_object(
      'member_id', v_eliminated_id,
      'display_name', v_eliminated_name,
      'votes', v_max_votes,
      'tie_break_used', (v_initial_tied_count > 1),
      'tie_saved', v_tie_save_applied,
      'tie_no_elimination', v_tie_no_elimination,
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
    'tie_no_elimination', v_tie_no_elimination,
    'no_elimination', v_cancelled
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_resolve_vote', v_result);

  return v_result;
end;
$function$;

create or replace function public.api_change_vote(p_room_id uuid,p_target_member_id uuid,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_user_id uuid:=auth.uid(); v_member_id uuid; v_session public.game_sessions%rowtype;
 v_vote_id uuid; v_old_target_id uuid; v_revision_count smallint; v_target_alive boolean;
 v_existing jsonb; v_existing_name text; v_new_version bigint; v_result jsonb;
begin
 if v_user_id is null then raise exception using errcode='28000',message='UNAUTHENTICATED'; end if;
 if p_room_id is null or p_target_member_id is null or p_command_id is null then
  raise exception using errcode='22023',message='VALIDATION_ERROR';
 end if;
 select cr.response_json,cr.command_name into v_existing,v_existing_name
 from public.command_receipts cr where cr.user_id=v_user_id and cr.command_id=p_command_id;
 if found then
  if v_existing_name<>'api_change_vote' then
   raise exception using errcode='22023',message='COMMAND_ID_REUSED';
  end if;
  return v_existing;
 end if;
 select m.id into v_member_id from public.room_members m
 where m.room_id=p_room_id and m.user_id=v_user_id and m.membership_status='active'
  and m.is_alive and not m.is_bot for update;
 if v_member_id is null then raise exception using errcode='P0001',message='NOT_ELIGIBLE_TO_VOTE'; end if;
 select * into v_session from public.game_sessions s where s.room_id=p_room_id for update;
 if v_session.phase<>'voting' then raise exception using errcode='P0001',message='VOTING_NOT_OPEN'; end if;
 if v_session.deadline_at is null or v_session.deadline_at<=now() then
  raise exception using errcode='P0001',message='VOTE_REVISION_WINDOW_CLOSED';
 end if;
 select m.is_alive into v_target_alive from public.room_members m
 where m.room_id=p_room_id and m.id=p_target_member_id and m.membership_status='active';
 if v_target_alive is distinct from true then
  raise exception using errcode='P0001',message='VOTE_TARGET_NOT_AVAILABLE';
 end if;
 select v.id,v.target_member_id,v.revision_count into v_vote_id,v_old_target_id,v_revision_count
 from public.votes v where v.session_id=v_session.id and v.round_number=v_session.round_number
  and v.voter_member_id=v_member_id for update;
 if v_vote_id is null then raise exception using errcode='P0001',message='VOTE_NOT_FOUND'; end if;
 if v_revision_count>=1 then raise exception using errcode='P0001',message='VOTE_ALREADY_CHANGED'; end if;
 if v_old_target_id=p_target_member_id then
  raise exception using errcode='P0001',message='VOTE_TARGET_UNCHANGED';
 end if;
 update public.votes set target_member_id=p_target_member_id,revision_count=revision_count+1
 where id=v_vote_id;
 update public.game_sessions set state_version=state_version+1,updated_at=clock_timestamp()
 where id=v_session.id returning state_version into v_new_version;
 update public.public_game_state set payload=payload||jsonb_build_object('last_event','vote_changed'),
  state_version=v_new_version,updated_at=clock_timestamp() where room_id=p_room_id;
 insert into public.public_game_events(room_id,session_id,event_type,public_payload)
 values(p_room_id,v_session.id,'vote_changed',
  jsonb_build_object('voter_member_id',v_member_id,'previous_target_member_id',v_old_target_id,
   'target_member_id',p_target_member_id,'round',v_session.round_number));
 v_result:=jsonb_build_object('ok',true,'target_member_id',p_target_member_id,
  'revision_count',1,'round',v_session.round_number);
 insert into public.command_receipts(user_id,command_id,command_name,response_json)
 values(v_user_id,p_command_id,'api_change_vote',v_result);
 return v_result;
end;
$$;

create or replace function public.api_get_my_game_meta(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
 v_user_id uuid:=auth.uid(); v_member_id uuid; v_session_id uuid; v_status text;
 v_objective jsonb; v_results jsonb:='[]'::jsonb; v_profile jsonb:='{}'::jsonb;
 v_revision_count integer:=0;
begin
 if v_user_id is null then raise exception using errcode='28000',message='UNAUTHENTICATED'; end if;
 select m.id into v_member_id from public.room_members m
 where m.room_id=p_room_id and m.user_id=v_user_id and m.membership_status='active';
 if v_member_id is null then raise exception using errcode='P0001',message='NOT_ROOM_MEMBER'; end if;
 select s.id,s.status into v_session_id,v_status from public.game_sessions s where s.room_id=p_room_id;
 if v_session_id is null then raise exception using errcode='P0001',message='GAME_SESSION_NOT_FOUND'; end if;
 select jsonb_build_object('objective_key',c.objective_key,'title',c.title,
  'description',c.description,'completed',g.completed,'completed_at',g.completed_at)
 into v_objective
 from private.game_secret_objectives g join private.secret_objective_catalog c
  on c.objective_key=g.objective_key
 where g.session_id=v_session_id and g.member_id=v_member_id;
 select coalesce(v.revision_count,0)::integer into v_revision_count
 from public.votes v join public.game_sessions s on s.id=v.session_id
 where v.room_id=p_room_id and v.voter_member_id=v_member_id and v.round_number=s.round_number
 limit 1;
 if v_status='finished' then
  select coalesce(jsonb_agg(jsonb_build_object('member_id',h.member_id,
   'display_name',h.display_name,'points',h.points,'awards',h.awards,
   'objective_completed',h.objective_completed,'correct_votes',h.correct_votes,
   'votes_received',h.votes_received,'survived',h.survived)
   order by h.points desc,h.display_name),'[]'::jsonb)
  into v_results from private.game_reputation_history h where h.session_id=v_session_id;
 end if;
 select jsonb_build_object('total_points',p.total_points,'games_played',p.games_played,
  'completed_objectives',p.completed_objectives,'correct_votes',p.correct_votes,'survivals',p.survivals)
 into v_profile from private.player_reputation_profiles p where p.user_id=v_user_id;
 return jsonb_build_object('my_secret_objective',v_objective,
  'my_vote_revision_count',coalesce(v_revision_count,0),
  'reputation_results',v_results,'reputation_profile',coalesce(v_profile,'{}'::jsonb));
end;
$$;

revoke all on function public.api_change_vote(uuid,uuid,uuid) from public,anon;
grant execute on function public.api_change_vote(uuid,uuid,uuid) to authenticated;
revoke all on function public.api_get_my_game_meta(uuid) from public,anon;
grant execute on function public.api_get_my_game_meta(uuid) to authenticated;
revoke all on function private.set_dynamic_game_round_limit() from public,anon,authenticated;
revoke all on function private.assign_secret_objectives() from public,anon,authenticated;
revoke all on function private.open_vote_revision_window() from public,anon,authenticated;
revoke all on function private.finalize_game_reputation() from public,anon,authenticated;
commit;