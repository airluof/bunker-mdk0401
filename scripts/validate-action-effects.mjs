import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const paths = {
  manifest: 'assets/manifest.json',
  generatorMigration: 'supabase/migrations/202611040008_action_effects_phase_one.sql',
  hotfixMigration: 'supabase/migrations/202611040009_hotfix_action_effect.sql',
  unifiedMigration: 'supabase/migrations/202611040010_unified_action_engine.sql',
  phaseTwoMigration: 'supabase/migrations/20261109110000_action_card_rules_phase_two.sql',
  exploitMigration: 'supabase/migrations/202611040011_exploit_second_skill.sql',
  reviewMigration: 'supabase/migrations/202611040017_disable_incomplete_card_effects.sql',
  service: 'src/services/onlineRooms.ts',
  gameView: 'src/components/OnlineGameView.tsx',
  actionControls: 'src/components/ActionCardControls.tsx',
  localApp: 'src/App.tsx',
  importer: 'scripts/import-cards-to-supabase.mjs',
  seed: 'supabase/seeds/20261104_card_catalog_v1.sql',
  handView: 'src/components/PersonalHand.tsx',
  finalAudit: 'src/components/FinalAuditView.tsx',
  cardsData: 'src/data/cards.ts',
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
  action_02: 'rollback_cancel_voting_round',
  action_03: 'hot_swap_baggage',
  action_04: 'hotfix_discard_own_vulnerability',
  action_05: 'gpupdate_force_reveal_hidden_card',
  action_06: 'vmotion_swap_roles',
  action_07: 'sudo_double_vote_or_tie_save',
  action_08: 'smart_peek_future_crisis',
  action_09: 'security_sandbox_protect_targeted_actions',
  action_10: 'cmdb_reveal_all_baggage',
  action_11: 'exploit_draw_second_skill',
  action_12: 'write_off_target_baggage',
  action_14: 'clone_neighbour_skill_until_game_end',
  action_15: 'cr_replace_selected_crisis',
  action_16: 'confiscate_expelled_baggage',
  action_17: 'watchdog_30_second_briefing',
  action_18: 'session_hijacking_swap_vulnerabilities',
  action_20: 'memory_dump_private_peek',
  action_24: 'kernel_driver_draw_second_baggage',
  action_28: 'emergency_generator_capacity_plus_one',
  action_29: 'factory_reset_redraw_four_core_cards',
};
const blockedHandlers = {
  action_21: 'workaround_ignore_crisis_in_audit',
  action_25: 'safe_boot_disable_vulnerabilities_round',
};
const blockedIds = Object.keys(blockedHandlers);
const unresolvedIds = expectedIds.filter((id) => !Object.hasOwn(supportedHandlers, id) && !Object.hasOwn(blockedHandlers, id));
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
requireText(files.phaseTwoMigration, /create or replace function public\.api_use_action_effect/i, 'Phase two action RPC is missing.');
requireText(files.phaseTwoMigration, /cc\.effect_status = 'approved'/i, 'Phase two RPC must verify catalog approval.');
requireText(files.unifiedMigration, /create or replace function public\.api_get_my_action_private_data/i, 'Private action result RPC is missing.');
requireText(files.unifiedMigration, /create trigger game_sessions_watchdog_deadline/i, 'Watchdog deadline trigger is missing.');
requireText(files.unifiedMigration, /ignored_crisis_ids/i, 'Workaround must persist the selected crisis.');
requireText(files.unifiedMigration, /vulnerabilities_disabled_round/i, 'Safe Boot round state is missing.');
requireText(files.exploitMigration, /create or replace function public\.api_use_exploit_skill_card/i, 'Exploit RPC is missing.');
requireText(files.exploitMigration, /effect_handler_id = 'exploit_draw_second_skill'/i, 'Exploit handler approval is missing.');
requireText(files.exploitMigration, /cc\.category = 'skills'/i, 'Exploit must draw from the Skills category.');
requireText(files.exploitMigration, /ci\.zone = 'category_deck'/i, 'Exploit must draw from the server-owned Skills deck.');
requireText(files.exploitMigration, /set zone = 'hand',[\s\S]*?owner_member_id = v_actor_id/i, 'Exploit must assign the drawn Skill to its owner.');
requireText(files.exploitMigration, /instance_status = 'hidden'/i, 'The additional Skill must remain hidden after drawing.');

for (const [id, handler] of Object.entries(supportedHandlers)) {
  if (id === 'action_04' || id === 'action_28') continue;
  const migration = id === 'action_11' ? files.exploitMigration : files.phaseTwoMigration;
  const handlerIsRegistered = id === 'action_11'
    ? migration.includes(`effect_handler_id = '${handler}'`)
    : migration.includes(`when '${id}' then '${handler}'`);
  if (!handlerIsRegistered) {
    failures.push(`SQL migration does not register ${id} with ${handler}.`);
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

const approvedFromSql = [...new Set([
  ...[...files.generatorMigration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]),
  ...[...files.hotfixMigration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]),
  ...[...files.unifiedMigration.matchAll(/when '(action_\d+)' then '/gi)].map((match) => match[1]),
  ...[...files.exploitMigration.matchAll(/where card_id = '(action_\d+)'/gi)].map((match) => match[1]),
  ...[...files.phaseTwoMigration.matchAll(/when '(action_\d+)' then '/gi)].map((match) => match[1]),
])].sort();
const expectedRegistered = [...Object.keys(supportedHandlers), ...blockedIds].sort();
if (approvedFromSql.join(',') !== expectedRegistered.join(',')) {
  failures.push('SQL migrations must register exactly 22 action handlers (20 ready, 2 blocked pending completion).');
}

const reviewMigration = files.reviewMigration;
requireText(reviewMigration, /update public\.card_catalog/i, 'Action review migration must update the catalog statuses.');
for (const [id, handler] of Object.entries(blockedHandlers)) {
  const seedRow = files.seed.split('\n').find((line) => line.trimStart().startsWith(`('${id}'`));
  if (!seedRow || !seedRow.includes("'draft', null")) {
    failures.push(`Blocked card ${id} must be draft in the seed.`);
  }
  if (files.importer.includes(`${id}: '${handler}'`)) {
    failures.push(`Importer must not re-enable blocked action ${id}.`);
  }
  if (!reviewMigration.includes(`card_id = '${id}'`) || !reviewMigration.includes(`effect_handler_id = '${handler}'`)) {
    failures.push(`Migration 017 must demote ${id} from approved until its effect is complete.`);
  }
}
const availableEffects = files.actionControls.match(/const AVAILABLE_EFFECTS:[\s\S]*?\n};/)?.[0] || '';
const pendingEffects = files.actionControls.match(/const PENDING_RULES:[\s\S]*?\n};/)?.[0] || '';
for (const id of blockedIds) {
  if (availableEffects.includes(id)) failures.push(`Blocked action ${id} must not be playable in the UI.`);
  if (!pendingEffects.includes(id)) failures.push(`Blocked action ${id} must explain why it is disabled.`);
}


requireText(files.service, /export async function useOnlineActionEffect/i, 'Generic action RPC client is missing.');
requireText(files.service, /export async function useOnlineExploitSkillCard/i, 'Exploit RPC client is missing.');
requireText(files.service, /api_get_my_action_private_data/i, 'Client does not fetch private action results.');
requireText(files.gameView, /ActionCardControls/i, 'Online game view does not render action controls.');
requireText(files.gameView, /onUseActionEffect/i, 'Online game view does not pass the generic action callback.');
requireText(files.actionControls, /AVAILABLE_EFFECTS/i, 'Action controls do not define supported action cards.');
requireText(files.actionControls, /action_20/i, 'Memory Dump target selection is missing.');
requireText(files.actionControls, /action_11: \{ description: .*вторую карту Навыка/i, 'Exploit is missing from online action controls.');
requireText(files.actionControls, /privateEvents\.slice/i, 'Private action results are not rendered.');
requireText(files.actionControls, /myMemberId/i, 'Target selection must exclude the acting player.');
requireText(files.localApp, /vulnerabilityDiscarded: true/i, 'Local demo Hotfix effect is missing.');
requireText(files.localApp, /actionCard\.card_id === 'action_11'/i, 'Local demo Exploit effect is missing.');
requireText(files.handView, /player\.vulnerabilityDiscarded/i, 'Local hand must hide a discarded Vulnerability.');
requireText(files.rosterView, /player\.vulnerabilityDiscarded/i, 'Local public roster must hide a discarded Vulnerability.');
requireText(files.handView, /extraSkills/i, 'Local hand must display additional Skills.');
requireText(files.rosterView, /extraSkills/i, 'Local roster must display additional Skills.');
requireText(files.finalAudit, /extraSkills/i, 'The final audit must include additional Skills.');
requireText(files.cardsData, /skillDeck: shuffledSkills\.slice\(playerNames\.length\)/i, 'The local demo must retain the undrawn Skills deck.');
requireText(files.importer, /action_04: 'hotfix_discard_own_vulnerability'/i, 'Importer must preserve the Hotfix handler.');
requireText(files.importer, /action_28: 'emergency_generator_capacity_plus_one'/i, 'Importer must preserve Emergency Generator handler.');
requireText(files.seed, /'approved', 'hotfix_discard_own_vulnerability'/i, 'Seed must preserve Hotfix approval.');
requireText(files.seed, /'approved', 'emergency_generator_capacity_plus_one'/i, 'Seed must preserve Emergency Generator approval.');

requireText(files.phaseTwoMigration, /cancelled_vote_round/i, 'Rollback marker is missing.');
requireText(files.phaseTwoMigration, /GPUPDATE_REQUIRES_BRIEFING_OR_VOTING/i, 'gpupdate timing guard is missing.');
requireText(files.phaseTwoMigration, /VETO_CHOICE_REQUIRED/i, 'Veto must require one explicit mode.');
requireText(files.phaseTwoMigration, /action_07_modifier/i, 'Veto vote modifier is not persisted.');
requireText(files.phaseTwoMigration, /ACTION_TARGET_PROTECTED/i, 'Security Sandbox is not enforced on targeted actions.');
requireText(files.phaseTwoMigration, /CLONE_TARGET_NOT_ADJACENT/i, 'Clone VM must validate a circular neighbour target.');
requireText(files.phaseTwoMigration, /FACTORY_RESET_DECK_INCOMPLETE/i, 'Factory Reset must fail atomically when any of four decks is empty.');
requireText(files.phaseTwoMigration, /add column if not exists is_copy boolean/i, 'Cloned Skill instances need an explicit copy marker.');
requireText(files.phaseTwoMigration, /where is_copy = false/i, 'Only original source card instances should be unique in a session.');
requireText(files.phaseTwoMigration, /'hand', 'revealed', now\(\), v_actor_id, true/i, 'Clone VM must mark duplicated Skill instances as copies.');
requireText(files.phaseTwoMigration, /v_action.card_id <> 'action_03' or coalesce\(v_target_alive, false\)/i, 'Sandbox must not protect an expelled Baggage-trade target.');
requireText(files.phaseTwoMigration, /set zone = 'discard',[\s\S]*?owner_member_id = null/i, 'Factory Reset must discard the old four-category hand.');
requireText(files.phaseTwoMigration, /create or replace function public\.api_resolve_vote/i, 'Vote resolver must apply Rollback and Veto effects.');
requireText(files.phaseTwoMigration, /tie_saved/i, 'Vote result must expose Veto tie protection.');
requireText(files.service, /p_action_choice: actionChoice \?\? null/i, 'Client must pass the selected Veto mode.');
requireText(files.actionControls, /action_02: \{ description:/i, 'Rollback control is missing.');
requireText(files.actionControls, /action_05: \{ description:/i, 'gpupdate control is missing.');
requireText(files.actionControls, /action_07: \{ description:/i, 'Veto control is missing.');
requireText(files.actionControls, /action_09: \{ description:/i, 'Security Sandbox control is missing.');
requireText(files.actionControls, /action_14: \{ description:/i, 'Clone VM control is missing.');
requireText(files.actionControls, /action_29: \{ description:/i, 'Factory Reset control is missing.');


if (failures.length) {
  console.error('Action-effect validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Action-effect validation passed.');
console.log('30 source action cards verified; 20 effects are fully enabled.');
console.log('2 incomplete effects are disabled; 8 more remain draft pending rule clarification.');
