begin;

create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'lobby'
    check (status in ('lobby', 'in_progress', 'finished', 'archived')),
  min_players smallint not null default 8 check (min_players between 2 and 16),
  max_players smallint not null default 16 check (max_players between min_players and 16),
  ruleset_version text not null default 'source-1',
  catalog_version text not null default 'v1',
  schema_version integer not null default 1 check (schema_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  technical_role text not null default 'player'
    check (technical_role in ('host', 'player')),
  membership_status text not null default 'active'
    check (membership_status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (room_id, user_id)
);

create unique index room_members_one_active_room_per_user
  on public.room_members(user_id)
  where membership_status = 'active';

create unique index room_members_active_display_name_unique
  on public.room_members(room_id, lower(display_name))
  where membership_status = 'active';

create index room_members_room_status_idx
  on public.room_members(room_id, membership_status, joined_at);

create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  code_hash text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index room_invites_one_active_per_room
  on public.room_invites(room_id)
  where is_active = true;

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished')),
  round_number smallint not null default 1 check (round_number between 1 and 5),
  max_rounds smallint not null default 5 check (max_rounds between 1 and 5),
  phase text not null default 'lobby'
    check (phase in ('lobby', 'reveal', 'briefing', 'voting', 'elimination', 'audit', 'gameover')),
  state_version bigint not null default 0 check (state_version >= 0),
  deadline_at timestamptz,
  ruleset_version text not null default 'source-1',
  catalog_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_game_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  session_id uuid not null unique references public.game_sessions(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  state_version bigint not null default 0 check (state_version >= 0),
  updated_at timestamptz not null default now()
);

create table public.card_catalog (
  card_id text not null,
  source_number integer not null check (source_number between 1 and 30),
  category text not null
    check (category in ('roles', 'skills', 'baggage', 'vulnerabilities', 'crises', 'actions')),
  title_original text not null,
  description_original text not null,
  illustration_idea_original text,
  image_path text,
  source_sheet text,
  catalog_version text not null default 'v1',
  effect_handler_id text,
  effect_status text not null default 'draft'
    check (effect_status in ('not_applicable', 'draft', 'approved', 'disabled')),
  imported_at timestamptz not null default now(),
  primary key (card_id, catalog_version)
);

create index card_catalog_category_version_idx
  on public.card_catalog(category, catalog_version);

create table public.card_instances (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  owner_member_id uuid references public.room_members(id) on delete restrict,
  card_id text not null,
  catalog_version text not null default 'v1',
  zone text not null check (zone in ('hand', 'crisis_deck', 'active_crisis', 'discard')),
  instance_status text not null default 'hidden'
    check (instance_status in ('hidden', 'revealed')),
  deck_position smallint,
  revealed_at timestamptz,
  revealed_by_member_id uuid references public.room_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, card_id),
  foreign key (card_id, catalog_version)
    references public.card_catalog(card_id, catalog_version) on delete restrict,
  check ((zone = 'hand' and owner_member_id is not null)
      or (zone <> 'hand' and owner_member_id is null))
);

create index card_instances_owner_zone_idx
  on public.card_instances(session_id, owner_member_id, zone);

create index card_instances_public_zone_idx
  on public.card_instances(session_id, zone, instance_status, deck_position);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 5),
  voter_member_id uuid not null references public.room_members(id) on delete cascade,
  target_member_id uuid not null references public.room_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (session_id, round_number, voter_member_id)
);

create index votes_round_target_idx
  on public.votes(session_id, round_number, target_member_id);

create table public.published_vote_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 5),
  result_payload jsonb not null,
  published_at timestamptz not null default now(),
  unique (session_id, round_number)
);

create table public.public_game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  session_id uuid references public.game_sessions(id) on delete cascade,
  event_type text not null,
  public_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index public_game_events_room_created_idx
  on public.public_game_events(room_id, created_at);

create table public.player_private_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null references public.room_members(id) on delete cascade,
  event_type text not null,
  private_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  submitted_by_member_id uuid not null references public.room_members(id) on delete restrict,
  submission_payload jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.command_receipts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  command_name text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, command_id)
);

create index command_receipts_created_idx
  on public.command_receipts(created_at);

create or replace function private.is_active_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
      and m.membership_status = 'active'
  );
$$;

revoke all on function private.is_active_room_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_room_member(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.game_sessions enable row level security;
alter table public.public_game_state enable row level security;
alter table public.card_catalog enable row level security;
alter table public.card_instances enable row level security;
alter table public.votes enable row level security;
alter table public.published_vote_results enable row level security;
alter table public.public_game_events enable row level security;
alter table public.player_private_events enable row level security;
alter table public.audit_submissions enable row level security;
alter table public.command_receipts enable row level security;

create policy rooms_read_room_members
  on public.rooms for select to authenticated
  using (private.is_active_room_member(id));

create policy room_members_read_same_room
  on public.room_members for select to authenticated
  using (private.is_active_room_member(room_id));

create policy game_sessions_read_room_members
  on public.game_sessions for select to authenticated
  using (private.is_active_room_member(room_id));

create policy public_game_state_read_room_members
  on public.public_game_state for select to authenticated
  using (private.is_active_room_member(room_id));

revoke all on public.rooms,
  public.room_members,
  public.room_invites,
  public.game_sessions,
  public.public_game_state,
  public.card_catalog,
  public.card_instances,
  public.votes,
  public.published_vote_results,
  public.public_game_events,
  public.player_private_events,
  public.audit_submissions,
  public.command_receipts
from public, anon, authenticated;

grant select, insert, update, delete on public.card_catalog to service_role;

grant select (id, status, min_players, max_players, ruleset_version, catalog_version, schema_version, created_at, updated_at)
  on public.rooms to authenticated;

grant select (id, room_id, display_name, technical_role, membership_status, joined_at, last_seen_at)
  on public.room_members to authenticated;

grant select (id, room_id, status, round_number, max_rounds, phase, state_version, deadline_at, ruleset_version, catalog_version, created_at, updated_at)
  on public.game_sessions to authenticated;

grant select (room_id, session_id, payload, state_version, updated_at)
  on public.public_game_state to authenticated;

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
  v_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  v_hash := encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

  insert into public.rooms (id, created_by_user_id)
  values (v_room_id, v_user_id);

  insert into public.room_members (
    id, room_id, user_id, display_name, technical_role, membership_status
  )
  values (
    v_member_id, v_room_id, v_user_id, btrim(p_display_name), 'host', 'active'
  );

  insert into public.room_invites (room_id, code_hash)
  values (v_room_id, v_hash);

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

  if p_command_id is null
     or p_invite_code is null
     or p_invite_code !~ '^[0-9A-Fa-f]{32}$'
     or p_display_name is null
     or char_length(btrim(p_display_name)) not between 2 and 24 then
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
    extensions.digest(convert_to(upper(p_invite_code), 'UTF8'), 'sha256'),
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

create or replace function public.api_get_room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_snapshot jsonb;
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

  select jsonb_build_object(
    'my_member_id', v_member_id,
    'room', (
      select jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'min_players', r.min_players,
        'max_players', r.max_players,
        'ruleset_version', r.ruleset_version,
        'catalog_version', r.catalog_version,
        'created_at', r.created_at
      )
      from public.rooms r
      where r.id = p_room_id
    ),
    'session', (
      select jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'round_number', s.round_number,
        'max_rounds', s.max_rounds,
        'phase', s.phase,
        'state_version', s.state_version,
        'deadline_at', s.deadline_at
      )
      from public.game_sessions s
      where s.room_id = p_room_id
    ),
    'public_state', (
      select p.payload
      from public.public_game_state p
      where p.room_id = p_room_id
    ),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'member_id', m.id,
          'display_name', m.display_name,
          'technical_role', m.technical_role,
          'membership_status', m.membership_status,
          'joined_at', m.joined_at,
          'last_seen_at', m.last_seen_at
        ) order by m.joined_at, m.id
      )
      from public.room_members m
      where m.room_id = p_room_id and m.membership_status = 'active'
    ), '[]'::jsonb),
    'my_cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'instance_id', ci.id,
          'card_id', cc.card_id,
          'category', cc.category,
          'title', cc.title_original,
          'description', cc.description_original,
          'image_path', cc.image_path,
          'status', ci.instance_status
        ) order by cc.category, cc.source_number
      )
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.room_id = p_room_id
        and ci.owner_member_id = v_member_id
        and ci.zone = 'hand'
        and ci.instance_status <> 'revealed'
    ), '[]'::jsonb),
    'revealed_cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'instance_id', ci.id,
          'owner_member_id', ci.owner_member_id,
          'card_id', cc.card_id,
          'category', cc.category,
          'title', cc.title_original,
          'description', cc.description_original,
          'image_path', cc.image_path,
          'revealed_at', ci.revealed_at
        ) order by ci.revealed_at
      )
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.room_id = p_room_id
        and ci.zone = 'hand'
        and ci.instance_status = 'revealed'
    ), '[]'::jsonb),
    'active_crises', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'instance_id', ci.id,
          'card_id', cc.card_id,
          'title', cc.title_original,
          'description', cc.description_original,
          'image_path', cc.image_path
        ) order by ci.deck_position
      )
      from public.card_instances ci
      join public.card_catalog cc on cc.card_id = ci.card_id and cc.catalog_version = ci.catalog_version
      where ci.room_id = p_room_id and ci.zone = 'active_crisis'
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

create or replace function public.api_start_game(
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
  v_member_count integer;
  v_catalog_ok boolean;
  v_category text;
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

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;

  if found then
    if v_existing_name <> 'api_start_game' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select * into v_room
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
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select * into v_session
  from public.game_sessions s
  where s.room_id = p_room_id
  for update;

  if v_session.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'INVALID_PHASE';
  end if;

  select count(*) into v_member_count
  from public.room_members m
  where m.room_id = p_room_id and m.membership_status = 'active';

  if v_member_count < v_room.min_players or v_member_count > v_room.max_players then
    raise exception using errcode = 'P0001', message = 'PLAYER_COUNT_OUT_OF_RANGE';
  end if;

  select (
    count(*) = 180
    and count(*) filter (where category = 'roles') = 30
    and count(*) filter (where category = 'skills') = 30
    and count(*) filter (where category = 'baggage') = 30
    and count(*) filter (where category = 'vulnerabilities') = 30
    and count(*) filter (where category = 'crises') = 30
    and count(*) filter (where category = 'actions') = 30
  ) into v_catalog_ok
  from public.card_catalog cc
  where cc.catalog_version = v_room.catalog_version;

  if not coalesce(v_catalog_ok, false) then
    raise exception using errcode = 'P0001', message = 'CARD_CATALOG_INCOMPLETE';
  end if;

  for v_category in
    select unnest(array['roles', 'skills', 'baggage', 'vulnerabilities', 'actions']::text[])
  loop
    insert into public.card_instances (
      session_id, room_id, owner_member_id, card_id, catalog_version, zone, instance_status
    )
    with ranked_players as (
      select
        m.id,
        row_number() over (order by m.joined_at, m.id) as rn
      from public.room_members m
      where m.room_id = p_room_id and m.membership_status = 'active'
    ),
    ranked_cards as (
      select
        cc.card_id,
        row_number() over (order by random()) as rn
      from public.card_catalog cc
      where cc.catalog_version = v_room.catalog_version
        and cc.category = v_category
    )
    select
      v_session.id,
      p_room_id,
      p.id,
      c.card_id,
      v_room.catalog_version,
      'hand',
      'hidden'
    from ranked_players p
    join ranked_cards c on c.rn = p.rn;
  end loop;

  insert into public.card_instances (
    session_id, room_id, owner_member_id, card_id, catalog_version, zone, instance_status, deck_position
  )
  select
    v_session.id,
    p_room_id,
    null,
    ranked.card_id,
    v_room.catalog_version,
    case when ranked.rn = 1 then 'active_crisis' else 'crisis_deck' end,
    case when ranked.rn = 1 then 'revealed' else 'hidden' end,
    ranked.rn
  from (
    select
      cc.card_id,
      row_number() over (order by random()) as rn
    from public.card_catalog cc
    where cc.catalog_version = v_room.catalog_version
      and cc.category = 'crises'
  ) ranked;

  update public.game_sessions
  set status = 'active',
      round_number = 1,
      phase = 'reveal',
      state_version = state_version + 1,
      updated_at = now()
  where id = v_session.id
  returning state_version into v_new_version;

  update public.rooms
  set status = 'in_progress', updated_at = now()
  where id = p_room_id;

  update public.public_game_state
  set payload = jsonb_build_object(
        'status', 'in_progress',
        'phase', 'reveal',
        'round', 1
      ),
      state_version = v_new_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, session_id, event_type, public_payload)
  values (
    p_room_id,
    v_session.id,
    'game_started',
    jsonb_build_object('round', 1, 'phase', 'reveal', 'state_version', v_new_version)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'started',
    'round', 1,
    'phase', 'reveal',
    'state_version', v_new_version
  );

  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_start_game', v_result);

  return v_result;
end;
$$;


create or replace function public.api_leave_room(
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
  v_room_status text;
  v_member_id uuid;
  v_technical_role text;
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

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_leave_room' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select r.status into v_room_status
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room_status is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room_status not in ('lobby', 'archived') then
    raise exception using errcode = 'P0001', message = 'RULE_NOT_APPROVED: leaving an active game is not automated';
  end if;

  select m.id, m.technical_role into v_member_id, v_technical_role
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
    and m.membership_status = 'active'
  for update;
  if v_member_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ROOM_MEMBER';
  end if;
  if v_technical_role = 'host' and v_room_status = 'lobby' then
    raise exception using errcode = 'P0001', message = 'HOST_MUST_CLOSE_ROOM';
  end if;

  update public.room_members
  set membership_status = 'left', last_seen_at = now()
  where id = v_member_id;

  insert into public.public_game_events (room_id, event_type, public_payload)
  values (p_room_id, 'member_left_lobby', jsonb_build_object('member_id', v_member_id));

  v_result := jsonb_build_object('ok', true, 'room_id', p_room_id, 'status', 'left');
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_leave_room', v_result);
  return v_result;
end;
$$;

create or replace function public.api_close_room(
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
  v_room_status text;
  v_state_version bigint;
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

  select cr.response_json, cr.command_name
    into v_existing, v_existing_name
  from public.command_receipts cr
  where cr.user_id = v_user_id and cr.command_id = p_command_id;
  if found then
    if v_existing_name <> 'api_close_room' then
      raise exception using errcode = '22023', message = 'COMMAND_ID_REUSED';
    end if;
    return v_existing;
  end if;

  select r.status into v_room_status
  from public.rooms r
  where r.id = p_room_id
    and r.created_by_user_id = v_user_id
  for update;
  if v_room_status is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN_OR_ROOM_NOT_FOUND';
  end if;
  if v_room_status <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'RULE_NOT_APPROVED: active game cannot be closed by lobby command';
  end if;

  update public.rooms
  set status = 'archived', updated_at = now()
  where id = p_room_id;

  update public.room_invites
  set is_active = false, revoked_at = now()
  where room_id = p_room_id and is_active = true;

  update public.game_sessions
  set status = 'finished', phase = 'gameover', state_version = state_version + 1, updated_at = now()
  where room_id = p_room_id
  returning state_version into v_state_version;

  update public.public_game_state
  set payload = jsonb_build_object('status', 'archived', 'phase', 'gameover'),
      state_version = v_state_version,
      updated_at = now()
  where room_id = p_room_id;

  insert into public.public_game_events (room_id, event_type, public_payload)
  values (p_room_id, 'room_archived', jsonb_build_object('status', 'archived'));

  v_result := jsonb_build_object('ok', true, 'room_id', p_room_id, 'status', 'archived');
  insert into public.command_receipts (user_id, command_id, command_name, response_json)
  values (v_user_id, p_command_id, 'api_close_room', v_result);
  return v_result;
end;
$$;

revoke all on function public.api_create_room(text, uuid) from public, anon;
revoke all on function public.api_join_room(text, text, uuid) from public, anon;
revoke all on function public.api_get_room_snapshot(uuid) from public, anon;
revoke all on function public.api_start_game(uuid, uuid) from public, anon;
revoke all on function public.api_leave_room(uuid, uuid) from public, anon;
revoke all on function public.api_close_room(uuid, uuid) from public, anon;

grant execute on function public.api_create_room(text, uuid) to authenticated;
grant execute on function public.api_join_room(text, text, uuid) to authenticated;
grant execute on function public.api_get_room_snapshot(uuid) to authenticated;
grant execute on function public.api_start_game(uuid, uuid) to authenticated;
grant execute on function public.api_leave_room(uuid, uuid) to authenticated;
grant execute on function public.api_close_room(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.room_members;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.game_sessions;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.public_game_state;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

alter table public.public_game_state replica identity full;
alter table public.room_members replica identity full;

commit;
