import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key || /YOUR_|placeholder/i.test(url + key)) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or their VITE_ equivalents) before running this smoke test.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const commandId = () => randomUUID();
let roomId = null;
let gameStarted = false;
let failed = false;

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(name + ': ' + error.message);
  return data;
}

try {
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
  if (authError) throw new Error('Anonymous sign-in failed: ' + authError.message);
  if (!authData.user?.id) throw new Error('Supabase did not return an anonymous user.');

  const displayName = 'QA-' + randomUUID().slice(0, 8);
  const created = await rpc('api_create_test_room', {
    p_display_name: displayName,
    p_command_id: commandId(),
  });
  roomId = created?.room_id;
  if (!roomId) throw new Error('api_create_test_room did not return room_id.');

  const bots = await rpc('api_add_test_bots', {
    p_room_id: roomId,
    p_command_id: commandId(),
  });
  if (!bots?.ok) throw new Error('api_add_test_bots did not succeed.');

  const started = await rpc('api_start_game', {
    p_room_id: roomId,
    p_command_id: commandId(),
  });
  if (!started?.ok || started.phase !== 'reveal') {
    throw new Error('api_start_game did not start the test game in reveal phase.');
  }
  gameStarted = true;

  let snapshot = await rpc('api_get_game_snapshot', { p_room_id: roomId });
  if (snapshot?.session?.phase !== 'reveal') throw new Error('Snapshot did not report reveal phase.');
  if (!Array.isArray(snapshot.players) || snapshot.players.length < 8) {
    throw new Error('Test room did not reach the minimum of eight participants.');
  }
  if (!Array.isArray(snapshot.my_cards) || snapshot.my_cards.length !== 5) {
    throw new Error('The player did not receive exactly five initial cards.');
  }
  if (!Array.isArray(snapshot.active_crises) || snapshot.active_crises.length !== 1) {
    throw new Error('The game did not start with exactly one active Crisis.');
  }

  const firstCard = snapshot.my_cards.find((card) => card.instance_id);
  if (!firstCard) throw new Error('No personal card instance was returned.');
  await rpc('api_reveal_card', {
    p_room_id: roomId,
    p_card_instance_id: firstCard.instance_id,
    p_command_id: commandId(),
  });

  const briefing = await rpc('api_transition_game_phase', {
    p_room_id: roomId,
    p_next_phase: 'briefing',
    p_command_id: commandId(),
  });
  if (!briefing?.ok || briefing.phase !== 'briefing') {
    throw new Error('The server did not advance to briefing.');
  }

  snapshot = await rpc('api_get_game_snapshot', { p_room_id: roomId });
  const deadline = snapshot?.session?.deadline_at ? Date.parse(snapshot.session.deadline_at) : NaN;
  if (snapshot?.session?.phase !== 'briefing' || !Number.isFinite(deadline) || deadline <= Date.now()) {
    throw new Error('The server did not set a valid future briefing deadline.');
  }

  console.log('Supabase multiplayer smoke test passed.');
  console.log('Anonymous auth, test room, bot fill, 5-card deal, Crisis deck, private reveal and server briefing timer verified.');
} catch (error) {
  failed = true;
  console.error('Supabase multiplayer smoke test failed:', error instanceof Error ? error.message : error);
} finally {
  if (roomId) {
    try {
      if (gameStarted) {
        await rpc('api_exit_test_room', {
          p_room_id: roomId,
          p_command_id: commandId(),
        });
      } else {
        await rpc('api_close_room', {
          p_room_id: roomId,
          p_command_id: commandId(),
        });
      }
    } catch (cleanupError) {
      console.error('Warning: test room cleanup failed:', cleanupError instanceof Error ? cleanupError.message : cleanupError);
      failed = true;
    }
  }
  await supabase.auth.signOut().catch(() => undefined);
}

if (failed) process.exit(1);
