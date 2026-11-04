import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const paths = {
  manifest: 'assets/manifest.json',
  generatorMigration: 'supabase/migrations/202611040008_action_effects_phase_one.sql',
  hotfixMigration: 'supabase/migrations/202611040009_hotfix_action_effect.sql',
  unifiedMigration: 'supabase/migrations/202611040010_unified_action_engine.sql',
  service: 'src/services/onlineRooms.ts',
  gameView: 'src/components/OnlineGameView.tsx',
  actionControls: 'src/components/ActionCardControls.tsx',
  localApp: 'src/App.tsx',
  importer: 'scripts/import-cards-to-supabase.mjs',
  seed: 'supabase/seeds/20261104_card_catalog_v1.sql',
  handView: 'src/components/PersonalHand.tsx',
  rosterView: 'src/components/PlayerRoster.tsx',
};

const entries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(resolve(root, path), 'utf8')]),
);
const files = Object.fromEntries(entries);
const manifest = JSON.parse(files.manifest.replace(/^\uFEFF/, ''));
const actions = (manifest.assets || []).filter((card) => card.category === 'actions');
const expectedIds = Array.from({ length: 30 }, (_, index) => `action_${String(index + 1).padStart(2, '0')}`);
const supportedHandlers = {
  action_03: 'hot_swap_baggage',
  action_04: 'hotfix_discard_own_vulnerability',
  action_06: 'vmotion_swap_roles',
  action_08: 'smart_peek_future_crisis',
  action_10: 'cmdb_reveal_all_baggage',
  action_12: 'write_off_target_baggage',
  action_15: 'cr_replace_selected_crisis',
  action_16: 'confiscate_expelled_baggage',
  action_17: 'watchdog_30_second_briefing',
  action_18: 'session_hijacking_swap_vulnerabilities',
  action_20: 'memory_dump_private_peek',
  action_21: 'workaround_ignore_crisis_in_audit',
  action_24: 'kernel_driver_draw_second_baggage',
  action_25: 'safe_boot_disable_vulnerabilities_round',
  action_28: 'emergency_generator_capacity_plus_one',
};
const unresolvedIds = expectedIds.filter((id) => !Object.hasOwn(supportedHandlers, id));
const failures = [];
const requireText = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};

if (actions.length !== 30) failures.push(`Expected 30 action cards, found ${actions.length}.`);
for (const id of expectedIds) {
  if (!actions.some((card) => card.card_id === id)) failures.push(`Missing source action card: ${id}.`);
}

const generator = actions.find((card) => card.card_id === 'action_28');
if (!generator || !/вместимость Бункера на \+1 место/i.test(generator.source_description)) {
  failures.push('The source description of action_28 changed; review it before changing the effect.');
}
const hotfix = actions.find((card) => card.card_id === 'action_04');
if (!hotfix || !/сброс своей Уязвимости в отбой/i.test(hotfix.source_description)) {
  failures.push('The source description of action_04 changed; review it before changing the effect.');
}

requireText(files.generatorMigration, /create table if not exists public\.game_action_uses/i, 'Action-use ledger table is missing.');
requireText(files.generatorMigration, /unique \(session_id, card_instance_id\)/i, 'Each action card must be one-use per session.');
requireText(files.generatorMigration, /alter table public\.game_action_uses enable row level security/i, 'Action-use ledger RLS is missing.');
requireText(files.generatorMigration, /revoke all on public\.game_action_uses from public, anon, authenticated/i, 'Clients must not access the action-use ledger directly.');
requireText(files.generatorMigration, /create or replace function public\.api_use_action_card/i, 'Emergency Generator RPC is missing.');
requireText(files.generatorMigration, /v_new_capacity := v_old_capacity \+ 1/i, 'Emergency Generator must add exactly one place.');
requireText(files.hotfixMigration, /create or replace function public\.api_use_hotfix_card/i, 'Hotfix RPC is missing.');
requireText(files.hotfixMigration, /set zone = 'discard',[\s\S]*?owner_member_id = null/i, "Hotfix must discard the owner's Vulnerability.");
requireText(files.hotfixMigration, /grant execute on function public\.api_use_hotfix_card\(uuid, uuid, uuid, uuid\) to authenticated/i, 'Hotfix RPC grant is missing.');

requireText(files.unifiedMigration, /zone in \('hand', 'crisis_deck', 'active_crisis', 'category_deck', 'discard'\)/i, 'Category-deck zone is missing.');
requireText(files.unifiedMigration, /populate_category_decks_after_start/i, 'Unused source cards must be populated into category decks after game start.');
requireText(files.unifiedMigration, /create or replace function public\.api_use_action_effect/i, 'Unified action RPC is missing.');
requireText(files.unifiedMigration, /cc\.effect_status = 'approved'/i, 'Unified RPC must verify catalog approval.');
requireText(files.unifiedMigration, /create or replace function public\.api_get_my_action_private_data/i, 'Private action result RPC is missing.');
requireText(files.unifiedMigration, /create trigger game_sessions_watchdog_deadline/i, 'Watchdog deadline trigger is missing.');
requireText(files.unifiedMigration, /ignored_crisis_ids/i, 'Workaround must persist the selected crisis.');
requireText(files.unifiedMigration, /vulnerabilities_disabled_round/i, 'Safe Boot round state is missing.');

for (const [id, handler] of Object.entries(supportedHandlers)) {
  if (id === 'action_04' || id === 'action_28') continue;
  if (!files.unifiedMigration.includes(`when '${id}' then '${handler}'`)) {
    failures.push(`Unified migration does not map ${id} to ${handler}.`);
  }
  if (!files.importer.includes(`${id}: '${handler}'`)) {
    failures.push(`Importer does not preserve the approved handler for ${id}.`);
  }
  const row = files.seed.split('\n').find((line) => line.trimStart().startsWith(`('${id}'`));
  if (!row || !row.includes(`'approved', '${handler}'`)) {
    failures.push(`Seed does not mark ${id} approved with handler ${handler}.`);
  }
}

for (const id of unresolvedIds) {
  const row = files.seed.split('\n').find((line) => line.trimStart().startsWith(`('${id}'`));
  if (!row || !row.includes("'draft', null")) {
    failures.push(`Unresolved card ${id} must remain draft in the seed.`);
  }
}

const approvedFromSql = [
  ...[...files.generatorMigration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]),
  ...[...files.hotfixMigration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]),
  ...[...files.unifiedMigration.matchAll(/when '(action_\d+)' then '/gi)].map((match) => match[1]),
].sort();
const expectedApproved = Object.keys(supportedHandlers).sort();
if (approvedFromSql.join(',') !== expectedApproved.join(',')) {
  failures.push('SQL migrations do not map exactly the 15 approved action cards.');
}

requireText(files.service, /export async function useOnlineActionEffect/i, 'Generic action RPC client is missing.');
requireText(files.service, /api_get_my_action_private_data/i, 'Client does not fetch the player's private action results.');
requireText(files.gameView, /ActionCardControls/i, 'Online game view does not render action controls.');
requireText(files.gameView, /onUseActionEffect/i, 'Online game view does not pass the generic action callback.');
requireText(files.actionControls, /AVAILABLE_EFFECTS/i, 'Action controls do not define supported action cards.');
requireText(files.actionControls, /action_20/i, 'Memory Dump target selection is missing.');
requireText(files.actionControls, /privateEvents\.slice/i, 'Private action results are not rendered.');
requireText(files.actionControls, /myMemberId/i, 'Target selection must exclude the acting player.');
requireText(files.localApp, /vulnerabilityDiscarded: true/i, 'Local demo Hotfix effect is missing.');
requireText(files.handView, /player\.vulnerabilityDiscarded/i, 'Local hand must hide a discarded Vulnerability.');
requireText(files.rosterView, /player\.vulnerabilityDiscarded/i, 'Local public roster must hide a discarded Vulnerability.');
requireText(files.importer, /action_04: 'hotfix_discard_own_vulnerability'/i, 'Importer must preserve the Hotfix handler.');
requireText(files.importer, /action_28: 'emergency_generator_capacity_plus_one'/i, 'Importer must preserve Emergency Generator handler.');
requireText(files.seed, /'approved', 'hotfix_discard_own_vulnerability'/i, 'Seed must preserve Hotfix approval.');
requireText(files.seed, /'approved', 'emergency_generator_capacity_plus_one'/i, 'Seed must preserve Emergency Generator approval.');

if (failures.length) {
  console.error('Action-effect validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Action-effect validation passed.');
console.log('30 source action cards verified; 15 have server-side handlers registered.');
console.log('15 additional cards remain draft until their rule wording and edge cases are approved.');
