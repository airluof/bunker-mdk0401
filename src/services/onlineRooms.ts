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

export interface ActionPrivateEvent {
  event_type: string;
  private_payload: Record<string, unknown>;
  created_at: string;
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
  audit_plan: {
    plan_text?: string;
    status?: string;
    submitted_by_member_id?: string;
    submitted_by_name?: string;
    updated_at?: string;
  };
  events: Array<{
    event_type: string;
    public_payload: Record<string, unknown>;
    created_at: string;
  }>;
  my_private_action_events?: ActionPrivateEvent[];
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

export async function heartbeatOnlineRoom(roomId: string): Promise<{ ok: boolean; last_seen_at: string }> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_heartbeat_room', {
    p_room_id: roomId,
  });
  throwIfError(error);

  return data as { ok: boolean; last_seen_at: string };
}

export async function takeoverOnlineRoomControl(roomId: string): Promise<{
  ok: boolean;
  room_id: string;
  controller_member_id: string;
  controller_name: string;
}> {
  const client = getClient();
  await ensureAnonymousSession();

  const { data, error } = await client.rpc('api_takeover_room_control', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);

  return data as {
    ok: boolean;
    room_id: string;
    controller_member_id: string;
    controller_name: string;
  };
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

  const { data: privateData, error: privateError } = await client.rpc('api_get_my_action_private_data', {
    p_room_id: roomId,
  });
  const privateEvents = !privateError && Array.isArray((privateData as { events?: unknown[] } | null)?.events)
    ? (privateData as { events: ActionPrivateEvent[] }).events
    : [];

  return {
    ...(data as RoomSnapshot),
    my_private_action_events: privateEvents,
  };
}


export async function revealOnlineCard(roomId: string, cardInstanceId: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_reveal_card', {
    p_room_id: roomId,
    p_card_instance_id: cardInstanceId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as { ok: boolean; card_instance_id: string; card_id: string; round: number };
}


export async function useOnlineActionCard(roomId: string, cardInstanceId: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_use_action_card', {
    p_room_id: roomId,
    p_card_instance_id: cardInstanceId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as {
    ok: boolean;
    action_id: 'action_28';
    effect_id: 'emergency_generator_capacity_plus_one';
    card_instance_id: string;
    capacity_before: number;
    capacity_after: number;
    state_version: number;
  };
}

export async function useOnlineActionEffect(
  roomId: string,
  cardInstanceId: string,
  targetMemberId?: string,
  targetCardInstanceId?: string,
) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_use_action_effect', {
    p_room_id: roomId,
    p_card_instance_id: cardInstanceId,
    p_target_member_id: targetMemberId ?? null,
    p_target_card_instance_id: targetCardInstanceId ?? null,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as {
    ok: boolean;
    action_id: string;
    effect_id: string;
    card_instance_id: string;
    target_member_id: string | null;
    target_name: string | null;
    state_version: number;
  };
}

export async function useOnlineExploitSkillCard(roomId: string, actionCardInstanceId: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_use_exploit_skill_card', {
    p_room_id: roomId,
    p_card_instance_id: actionCardInstanceId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as {
    ok: boolean;
    action_id: 'action_11';
    effect_id: 'exploit_draw_second_skill';
    card_instance_id: string;
    additional_skill_added: boolean;
    state_version: number;
  };
}

export async function useOnlineHotfixCard(
  roomId: string,
  actionCardInstanceId: string,
  vulnerabilityCardInstanceId: string,
) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_use_hotfix_card', {
    p_room_id: roomId,
    p_action_card_instance_id: actionCardInstanceId,
    p_vulnerability_card_instance_id: vulnerabilityCardInstanceId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as {
    ok: boolean;
    action_id: 'action_04';
    effect_id: 'hotfix_discard_own_vulnerability';
    card_instance_id: string;
    discarded_vulnerability_card_id: string;
    vulnerability_was_revealed: boolean;
    state_version: number;
  };
}

export async function transitionOnlineGamePhase(roomId: string, nextPhase: 'briefing' | 'voting') {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_transition_game_phase', {
    p_room_id: roomId,
    p_next_phase: nextPhase,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as { ok: boolean; phase: string; round: number; state_version: number };
}

export async function submitOnlineVote(roomId: string, targetMemberId: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_submit_vote', {
    p_room_id: roomId,
    p_target_member_id: targetMemberId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as { ok: boolean; target_member_id: string; round: number };
}

export async function resolveOnlineVote(roomId: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_resolve_vote', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as {
    ok: boolean;
    eliminated_member_id: string;
    eliminated_name: string;
    votes: number;
    tie_break_used: boolean;
  };
}

export async function advanceOnlineGameRound(roomId: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_advance_game_round', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as {
    ok: boolean;
    phase: 'reveal' | 'audit';
    round?: number;
    survivors?: number;
    bunker_capacity?: number;
  };
}


export async function submitOnlineAuditPlan(roomId: string, planText: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_submit_audit_plan', {
    p_room_id: roomId,
    p_plan_text: planText,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as { ok: boolean; submission_id: string; status: 'submitted' };
}

export async function finishOnlineGame(roomId: string) {
  const client = getClient();
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('api_finish_game', {
    p_room_id: roomId,
    p_command_id: crypto.randomUUID(),
  });
  throwIfError(error);
  return data as { ok: boolean; status: 'finished'; phase: 'gameover' };
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
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onChange({ type: 'reconnected' });
      }
    });

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
