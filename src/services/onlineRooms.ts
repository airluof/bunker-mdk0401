import { isSupabaseConfigured, supabase } from './supabase';

export interface RoomCommandResult {
  ok: boolean;
  room_id: string;
  member_id: string;
  invite_code?: string;
  status: 'lobby' | 'started';
  round?: number;
  phase?: string;
  state_version?: number;
  test_mode?: boolean;
}

export interface RoomSnapshot {
  my_member_id: string;
  room: {
    id: string;
    status: string;
    min_players: number;
    max_players: number;
    ruleset_version: string;
    catalog_version: string;
    created_at: string;
    room_mode: 'players' | 'test';
  };
  session: {
    id: string;
    status: string;
    round_number: number;
    max_rounds: number;
    phase: string;
    state_version: number;
    deadline_at: string | null;
  };
  public_state: Record<string, unknown>;
  players: Array<{
    member_id: string;
    display_name: string;
    technical_role: 'host' | 'player';
    membership_status: 'active' | 'left';
    is_bot: boolean;
    is_alive: boolean;
    eliminated_in_round: number | null;
    votes_received: number;
    revealed_this_round: boolean;
    joined_at: string;
    last_seen_at: string | null;
  }>;
  my_cards: Array<{
    instance_id: string;
    card_id: string;
    category: string;
    title: string;
    description: string;
    image_path: string | null;
    status: string;
  }>;
  revealed_cards: Array<Record<string, unknown>>;
  active_crises: Array<Record<string, unknown>>;
  current_round_votes: Array<{
    voter_member_id: string;
    voter_name: string;
    target_member_id: string;
    target_name: string;
    created_at: string;
  }>;
  my_revealed_this_round: boolean;
  my_vote_target_member_id: string | null;
  current_result: {
    eliminated_member_id?: string | null;
    eliminated_name?: string | null;
    vote_count?: number | null;
    tie_break_used?: boolean;
  };
  bunker_capacity: number | null;
  events: Array<{
    event_type: string;
    public_payload: Record<string, unknown>;
    created_at: string;
  }>;
}

function getClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }
  return supabase;
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export async function ensureAnonymousSession(): Promise<string> {
  const client = getClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  throwIfError(sessionError);

  if (sessionData.session?.user.id) {
    return sessionData.session.user.id;
  }

  const { data, error } = await client.auth.signInAnonymously();
  throwIfError(error);

  if (!data.user?.id) {
    throw new Error('ANONYMOUS_SIGN_IN_FAILED');
  }

  return data.user.id;
}

export async function createOnlineRoom(displayName: string): Promise<RoomCommandResult> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_create_room', {
    p_display_name: displayName.trim(),
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as RoomCommandResult;
}

export async function createOnlineTestRoom(displayName: string): Promise<RoomCommandResult> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_create_test_room', {
    p_display_name: displayName.trim(),
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as RoomCommandResult;
}

export async function joinOnlineRoom(
  inviteCode: string,
  displayName: string,
): Promise<RoomCommandResult> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_join_room', {
    p_invite_code: inviteCode.trim().toUpperCase(),
    p_display_name: displayName.trim(),
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as RoomCommandResult;
}

export async function updateOnlineRoomSettings(
  roomId: string,
  maxPlayers: number,
): Promise<{ ok: boolean; room_id: string; max_players: number }> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_update_room_settings', {
    p_room_id: roomId,
    p_max_players: maxPlayers,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as { ok: boolean; room_id: string; max_players: number };
}

export async function startOnlineGame(roomId: string): Promise<RoomCommandResult> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_start_game', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as RoomCommandResult;
}


export async function addOnlineTestBots(roomId: string): Promise<{
  ok: boolean;
  added: number;
  active_players: number;
  test_bots: number;
}> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_add_test_bots', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as {
    ok: boolean;
    added: number;
    active_players: number;
    test_bots: number;
  };
}


export async function getOnlineRoomSnapshot(roomId: string): Promise<RoomSnapshot> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_get_game_snapshot', {
    p_room_id: roomId,
  });
  throwIfError(error);

  return data as RoomSnapshot;
}

export async function subscribeToOnlineRoom(
  roomId: string,
  onChange: (payload: unknown) => void,
): Promise<() => void> {
  const client = getClient();
  await ensureAnonymousSession();

  const channel = client
    .channel('room:' + roomId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'room_members',
      filter: 'room_id=eq.' + roomId,
    }, (payload) => onChange(payload))
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: 'id=eq.' + roomId,
    }, (payload) => onChange(payload))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'game_sessions',
      filter: 'room_id=eq.' + roomId,
    }, (payload) => onChange(payload))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'public_game_state',
      filter: 'room_id=eq.' + roomId,
    }, (payload) => onChange(payload))
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}


export async function leaveOnlineRoom(roomId: string): Promise<{ ok: boolean; room_id: string; status: 'left' }> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_leave_room', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as { ok: boolean; room_id: string; status: 'left' };
}

export async function exitOnlineTestRoom(roomId: string): Promise<{ ok: boolean; room_id: string; status: 'left' | 'archived' }> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_exit_test_room', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as { ok: boolean; room_id: string; status: 'left' | 'archived' };
}

export async function closeOnlineRoom(roomId: string): Promise<{ ok: boolean; room_id: string; status: 'archived' }> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_close_room', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as { ok: boolean; room_id: string; status: 'archived' };
}
