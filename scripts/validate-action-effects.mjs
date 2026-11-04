import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const [manifestText, migration, hotfixMigration, service, gameView, localApp, importer, seed, handView, rosterView] = await Promise.all([
  readFile(resolve(root, 'assets/manifest.json'), 'utf8'),
  readFile(resolve(root, 'supabase/migrations/202611040008_action_effects_phase_one.sql'), 'utf8'),
  readFile(resolve(root, 'supabase/migrations/202611040009_hotfix_action_effect.sql'), 'utf8'),
  readFile(resolve(root, 'src/services/onlineRooms.ts'), 'utf8'),
  readFile(resolve(root, 'src/components/OnlineGameView.tsx'), 'utf8'),
  readFile(resolve(root, 'src/App.tsx'), 'utf8'),
  readFile(resolve(root, 'scripts/import-cards-to-supabase.mjs'), 'utf8'),
  readFile(resolve(root, 'supabase/seeds/20261104_card_catalog_v1.sql'), 'utf8'),
  readFile(resolve(root, 'src/components/PersonalHand.tsx'), 'utf8'),
  readFile(resolve(root, 'src/components/PlayerRoster.tsx'), 'utf8'),
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
const hotfix = actions.find((card) => card.card_id === 'action_04');
if (!hotfix || !/сброс своей Уязвимости в отбой/i.test(hotfix.source_description)) {
  failures.push('The source catalog description for action_04 has changed; review its effect before altering the implementation.');
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
requireText(hotfixMigration, /create or replace function public\.api_use_hotfix_card/i, 'Server RPC for Hotfix is missing.');
requireText(hotfixMigration, /ci\.card_id = 'action_04'/i, 'Hotfix RPC must only accept action_04.');
requireText(hotfixMigration, /cc\.effect_handler_id = 'hotfix_discard_own_vulnerability'/i, 'Hotfix RPC must verify the approved handler id.');
requireText(hotfixMigration, /cc\.category = 'vulnerabilities'/i, 'Hotfix may only discard a Vulnerability card.');
requireText(hotfixMigration, /set zone = 'discard',[\s\S]*?owner_member_id = null/i, 'Hotfix must move the Vulnerability to the discard zone.');
requireText(hotfixMigration, /grant execute on function public\.api_use_hotfix_card\(uuid, uuid, uuid, uuid\) to authenticated/i, 'Hotfix RPC execution grant is missing.');
requireText(hotfixMigration, /'used_action_cards'/i, 'Hotfix use must be recorded in public state.');

const approvals = [
  ...[...migration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]),
  ...[...hotfixMigration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]),
].sort();
if (approvals.join(',') !== 'action_04,action_28') {
  failures.push('Only action_04 and action_28 may be marked approved in this phase.');
}

requireText(service, /export async function useOnlineActionCard/i, 'Client service wrapper for the Emergency Generator RPC is missing.');
requireText(service, /export async function useOnlineHotfixCard/i, 'Client service wrapper for the Hotfix RPC is missing.');
requireText(gameView, /canUseEmergencyGenerator/i, 'Online game UI must gate the Emergency Generator button.');
requireText(gameView, /canUseHotfix/i, 'Online game UI must gate Hotfix by player/card state.');
requireText(gameView, /onUseHotfixCard\(hotfixInstanceId, vulnerabilityInstanceId\)/i, 'Online game UI must pass the owned Vulnerability card to Hotfix.');
requireText(localApp, /vulnerabilityDiscarded: true/i, "Local demo must apply Hotfix to the player\u0027s own Vulnerability.");
requireText(handView, /player\.vulnerabilityDiscarded/i, 'Local hand must hide the discarded Vulnerability.');
requireText(rosterView, /player\.vulnerabilityDiscarded/i, 'Local public roster must remove the discarded Vulnerability.');
requireText(importer, /\['action_04', 'action_28'\]\.includes\(card\.card_id\)/i, 'Catalog importer must preserve approved status for action_04 and action_28.');
requireText(importer, /hotfix_discard_own_vulnerability/i, 'Catalog importer must preserve the Hotfix handler id.');
requireText(seed, /\('action_04',[^\n]+'approved', 'hotfix_discard_own_vulnerability'\)/i, 'SQL seed must preserve approved metadata for action_04.');
requireText(seed, /\('action_28',[^\n]+'approved', 'emergency_generator_capacity_plus_one'\)/i, 'SQL seed must preserve approved metadata for action_28.');

if (failures.length) {
  console.error('Action-effect validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Action-effect validation passed.');
console.log('30 source action cards verified; action_04 (Hotfix) and action_28 (Emergency Generator) have server-side one-use effects.');
console.log('The other 28 effects remain unapproved until their rules are resolved.');
