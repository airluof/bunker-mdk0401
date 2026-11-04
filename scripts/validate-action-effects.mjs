import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const [manifestText, migration, service, gameView, localApp] = await Promise.all([
  readFile(resolve(root, 'assets/manifest.json'), 'utf8'),
  readFile(resolve(root, 'supabase/migrations/202611040008_action_effects_phase_one.sql'), 'utf8'),
  readFile(resolve(root, 'src/services/onlineRooms.ts'), 'utf8'),
  readFile(resolve(root, 'src/components/OnlineGameView.tsx'), 'utf8'),
  readFile(resolve(root, 'src/App.tsx'), 'utf8'),
]);

const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
const actions = (manifest.assets || []).filter((card) => card.category === 'actions');
const expectedIds = Array.from({ length: 30 }, (_, index) => `action_${String(index + 1).padStart(2, '0')}`);
const failures = [];
const requireText = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};

if (actions.length !== 30) failures.push(`Expected 30 action cards, found ${actions.length}.`);
for (const id of expectedIds) {
  if (!actions.some((card) => card.card_id === id)) failures.push(`Missing action card in source catalog: ${id}.`);
}

const generator = actions.find((card) => card.card_id === 'action_28');
if (!generator || !/вместимость Бункера на \+1 место/i.test(generator.source_description)) {
  failures.push('The source catalog description for action_28 has changed; review its effect before altering the implementation.');
}

requireText(migration, /create table if not exists public\.game_action_uses/i, 'Action-use ledger table is missing.');
requireText(migration, /unique \(session_id, card_instance_id\)/i, 'An action card must be usable only once per session.');
requireText(migration, /alter table public\.game_action_uses enable row level security/i, 'RLS must be enabled for the action-use ledger.');
requireText(migration, /revoke all on public\.game_action_uses from public, anon, authenticated/i, 'Clients must not read or modify the action-use ledger directly.');
requireText(migration, /create or replace function public\.api_use_action_card/i, 'Server RPC for action-card use is missing.');
requireText(migration, /ci\.card_id = 'action_28'/i, 'The RPC must only accept the approved Emergency Generator card in this phase.');
requireText(migration, /cc\.effect_status = 'approved'/i, 'The RPC must check the catalog effect approval status.');
requireText(migration, /v_session\.phase in \('lobby', 'audit', 'gameover'\)/i, 'The RPC must reject use after the final audit begins.');
requireText(migration, /v_member_id is null[\s\S]*?NOT_ACTIVE_PLAYER/i, 'Only an active living participant may use the card.');
requireText(migration, /v_new_capacity := v_old_capacity \+ 1/i, 'Emergency Generator must increase capacity by exactly one.');
requireText(migration, /set instance_status = 'revealed'/i, 'Using the action must reveal the card publicly.');
requireText(migration, /insert into public\.game_action_uses/i, 'The action use must be recorded on the server.');
requireText(migration, /'used_action_cards'/i, 'The public state must record consumed action instances.');
requireText(migration, /grant execute on function public\.api_use_action_card\(uuid, uuid, uuid\) to authenticated/i, 'Authenticated execution grant is missing.');

const approvals = [...migration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]);
if (approvals.length !== 1 || approvals[0] !== 'action_28') {
  failures.push('Only action_28 may be marked approved by this first-phase migration.');
}

requireText(service, /export async function useOnlineActionCard/i, 'Client service wrapper for the action RPC is missing.');
requireText(gameView, /canUseEmergencyGenerator/i, 'Online game UI must gate the action button by player/card/session state.');
requireText(gameView, /onUseActionCard\(emergencyGeneratorInstanceId\)/i, 'Online game UI must call the action handler with the player card instance.');
requireText(localApp, /const newCapacity = gameState\.bunkerCapacity \+ 1/i, 'Local demo must apply the same +1 capacity effect.');
requireText(localApp, /actionCard\.card_id !== 'action_28'/i, 'Local demo must not consume unimplemented action cards.');

if (failures.length) {
  console.error('Action-effect validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Action-effect validation passed.');
console.log('30 source action cards verified; action_28 has a server-side one-use effect.');
console.log('The other 29 effects remain unapproved until their rules are resolved.');
