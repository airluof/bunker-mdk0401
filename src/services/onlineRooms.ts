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


export interface OnlineTestBotCard {
  card_id: string;
  category: string;
  title: string;
  description: string;
  image_path: string | null;
}

export interface OnlineTestBotData {
  bot_hands: Array<{
    member_id: string;
    cards: OnlineTestBotCard[];
  }>;
  crisis_deck: OnlineTestBotCard[];
}

export async function getOnlineTestBotData(roomId: string): Promise<OnlineTestBotData> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_get_test_bot_data', {
    p_room_id: roomId,
  });
  throwIfError(error);

  return data as OnlineTestBotData;
}

export async function getOnlineRoomSnapshot(roomId: string): Promise<RoomSnapshot> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_get_room_snapshot', {
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
