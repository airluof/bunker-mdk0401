import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const paths = {
  migration: 'supabase/migrations/202611040012_controller_failover_and_shared_audit.sql',
  shortInviteMigration: 'supabase/migrations/202611040014_short_room_invite_codes.sql',
  fullAlphabetMigration: 'supabase/migrations/202611040015_full_alphabet_invite_codes.sql',
  alphanumericMigration: 'supabase/migrations/202611040016_alphanumeric_room_codes.sql',
  actionReviewMigration: 'supabase/migrations/202611040017_disable_incomplete_card_effects.sql',
  revealRuleMigration: 'supabase/migrations/202611050018_reveal_roles_first_and_choose_remaining.sql',
  simultaneousRevealMigration: 'supabase/migrations/202611060019_simultaneous_free_card_reveal.sql',
  testModeGuardsMigration: 'supabase/migrations/20261106124439_test_runtime_mode_guards.sql',
  rulesModal: 'src/components/GameRulesModal.tsx',
  cardGuidance: 'src/data/cardGuidance.ts',
  service: 'src/services/onlineRooms.ts',
  app: 'src/App.tsx',
  gameView: 'src/components/OnlineGameView.tsx',
  lobby: 'src/components/OnlineRoomLobby.tsx',
  main: 'src/main.tsx',
  referenceCss: 'src/bunker-reference.css',
  polishCss: 'src/bunker-polish.css',
  manifest: 'assets/manifest.json',
};

const files = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(resolve(root, path), 'utf8')]),
));

const failures = [];
const requireText = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};

const sql = files.migration;
const shortInviteSql = files.shortInviteMigration;
const fullAlphabetSql = files.fullAlphabetMigration;
const alphanumericSql = files.alphanumericMigration;
const revealRuleSql = files.revealRuleMigration;
const simultaneousRevealSql = files.simultaneousRevealMigration;
const testModeGuardsSql = files.testModeGuardsMigration;

const sqlFunctions = [
  'public.api_heartbeat_room',
  'public.api_takeover_room_control',
  'private.promote_room_controller_after_elimination',
  'public.api_submit_audit_plan',
  'public.api_finish_game',
];
for (const name of sqlFunctions) {
  requireText(sql, new RegExp('create or replace function\\s+' + name.replace('.', '\\.') + '\\b', 'i'),
    'Missing migration function: ' + name);
}

requireText(shortInviteSql, /v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'/i,
  'Migration 014 must retain its original five-letter codes.');
requireText(fullAlphabetSql, /v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'/i,
  'Migration 015 must allow the full A-Z alphabet.');
requireText(fullAlphabetSql, /v_random_byte < 234/i,
  'Migration 015 must use unbiased 26-letter sampling.');
requireText(fullAlphabetSql, /v_random_byte % 26/i,
  'Migration 015 must select from all 26 letters.');

requireText(alphanumericSql, /v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'/i,
  'Migration 016 must use A-Z and 0-9.');
requireText(alphanumericSql, /v_random_byte < 252/i,
  'Migration 016 must use unbiased 36-character sampling.');
requireText(alphanumericSql, /v_random_byte % 36/i,
  'Migration 016 must select from all 36 alphanumeric characters.');
if (!alphanumericSql.includes("upper(btrim(p_invite_code)) !~ '^([A-Z0-9]{5}|[0-9A-F]{32})$'")) {
  failures.push('Latest join RPC must accept five-character alphanumeric codes and legacy hexadecimal codes.');
}
if (!alphanumericSql.includes("extensions.digest(convert_to(upper(btrim(p_invite_code)), 'UTF8'), 'sha256')")) {
  failures.push('Latest join RPC must hash normalized invite codes before lookup.');
}

requireText(files.app, /replace\(\/\[\^A-Z0-9\]\/g/i,
  'Invite input must accept all Latin letters and digits.');
requireText(files.cardGuidance, /export function getCardGuidance/, 'Card inspection guidance is missing.');
requireText(files.cardGuidance, /validateCardGuidanceCoverage/, 'Card guidance coverage validation is missing.');
requireText(files.actionReviewMigration, /effect_status = 'draft'/i, 'Incomplete action effects must be demoted to draft.');
requireText(revealRuleSql, /FIRST_ROUND_REQUIRES_ROLE/i, 'Migration 018 must remain as the historical Role-first implementation superseded by migration 019.');
requireText(revealRuleSql, /has_hidden_cards/i, 'Snapshot must report whether a player still has hidden cards.');
requireText(revealRuleSql, /cc\.category = 'roles'/i, 'Migration 018 historical bot logic must remain documented.');
requireText(revealRuleSql, /PLAYERS_MUST_REVEAL_FIRST/i, 'The reveal phase must wait for players who still have hidden cards.');
if (/snapshot\.session\.round_number !== 1 \|\| card\.category === 'roles'/.test(files.gameView)) {
  failures.push('The client must not restrict first-round choices to the Role category.');
}
requireText(files.gameView, /pendingReveal: source\.status === 'pending_reveal'/i, 'The client must identify its own pending reveal card.');
requireText(files.gameView, /Выборы сделаны:/i, 'The reveal phase must show player selection progress.');
requireText(files.rulesModal, /каждый живой игрок выбирает любую ещё не раскрытую карту/i, 'Game rules must explain free card selection in every round.');

requireText(simultaneousRevealSql, /pending_reveal/i, 'The latest reveal migration must stage each choice privately.');
requireText(simultaneousRevealSql, /CARD_PENDING_SIMULTANEOUS_REVEAL/i, 'Pending cards must not be changed before simultaneous publication.');
requireText(simultaneousRevealSql, /PLAYERS_MUST_SELECT_CARD_FIRST/i, 'The host must wait until eligible players have selected a card.');
requireText(simultaneousRevealSql, /update public\.card_instances ci[\s\S]*?set instance_status = 'revealed'/i, 'All selected cards must be published at phase transition.');
if (/FIRST_ROUND_REQUIRES_ROLE|round_number\s*=\s*1[\s\S]{0,160}category\s*<>\s*'roles'/i.test(simultaneousRevealSql)) {
  failures.push('The latest migration must not enforce a Role-first reveal.');
}
const stagedRevealFunction = simultaneousRevealSql.match(/create or replace function public\.api_reveal_card[\s\S]*?\$\$;/i)?.[0] || '';
if (/insert into public\.public_game_events/i.test(stagedRevealFunction)) {
  failures.push('A selected card must not enter public events before simultaneous publication.');
}
if (!files.actionReviewMigration.includes("card_id = 'action_21'") || !files.actionReviewMigration.includes("card_id = 'action_25'")) {
  failures.push('Migration 017 must demote both Workaround and Safe Boot.');
}

requireText(files.app, /return \/\^\[A-Z0-9\]\{5\}\$\/\.test\(normalized\)/,
  'Client-side validation must accept five-character alphanumeric codes.');

requireText(sql, /create trigger room_controller_failover_after_elimination/i, 'Controller failover trigger is missing.');
requireText(sql, /interval '90 seconds'/i, 'Controller takeover must use a server-side 90 second heartbeat grace period.');
requireText(sql, /revoke all on function public\.api_heartbeat_room\(uuid\) from public, anon/i, 'Heartbeat RPC must not be callable by anon/PUBLIC.');
requireText(sql, /grant execute on function public\.api_heartbeat_room\(uuid\) to authenticated/i, 'Authenticated heartbeat RPC grant is missing.');
requireText(sql, /revoke all on function public\.api_takeover_room_control\(uuid, uuid\) from public, anon/i, 'Takeover RPC must not be callable by anon/PUBLIC.');
requireText(sql, /grant execute on function public\.api_takeover_room_control\(uuid, uuid\) to authenticated/i, 'Authenticated takeover RPC grant is missing.');

const auditFunction = sql.match(/create or replace function public\.api_submit_audit_plan[\s\S]*?\$\$;/i)?.[0] || '';
const finishFunction = sql.match(/create or replace function public\.api_finish_game[\s\S]*?\$\$;/i)?.[0] || '';
requireText(auditFunction, /m\.is_alive\s*=\s*true/i, 'Audit plan must be restricted to surviving participants.');
requireText(finishFunction, /m\.is_alive\s*=\s*true/i, 'Only a surviving participant may finish the game.');
if (/created_by_user_id\s*=\s*v_user_id/i.test(auditFunction)) failures.push('Audit plan must not require the original room creator.');
if (/created_by_user_id\s*=\s*v_user_id/i.test(finishFunction)) failures.push('Finishing the game must not require the original room creator.');

requireText(files.service, /export async function heartbeatOnlineRoom/i, 'Client heartbeat wrapper is missing.');
requireText(files.service, /export async function takeoverOnlineRoomControl/i, 'Client takeover wrapper is missing.');
requireText(files.service, /status === 'SUBSCRIBED'/i, 'Realtime resubscription must refresh the server snapshot.');
requireText(files.app, /heartbeatOnlineRoom\(roomId\)/i, 'The app does not send room heartbeats.');
requireText(files.app, /20_000/i, 'Client heartbeat interval is missing.');
requireText(files.app, /takeoverOnlineRoomControl\(onlineRoom!/i, 'The app does not call the takeover RPC.');
requireText(files.gameView, /onTakeover: \(\) => void/i, 'Game view takeover callback is missing.');
requireText(files.gameView, /!isHost && isAlive/i, 'Living non-host participants cannot request controller takeover.');
requireText(files.gameView, /\{isAlive \? \(/i, 'The final plan editor must be available to any surviving participant.');
requireText(files.lobby, /onTakeover: \(\) => void/i, 'Lobby takeover callback is missing.');
requireText(files.lobby, /!isHost && snapshot\.room\.status === 'lobby'/i, 'Lobby takeover action is missing.');

requireText(files.main, /\.\/bunker-reference\.css/, 'The restored reference theme is no longer loaded.');
requireText(files.main, /\.\/bunker-polish\.css/, 'The restored polish layer is no longer loaded.');
requireText(files.polishCss, /\.bunker-brand-mark svg/, 'Logo icon alignment styles are missing.');
requireText(files.polishCss, /\.bunker-nav-actions/, 'Navigation icon alignment styles are missing.');
if (!files.referenceCss.length || !files.polishCss.length) failures.push('Restored design stylesheets must not be empty.');

const manifest = JSON.parse(files.manifest.replace(/^\uFEFF/, ''));
const cards = manifest.assets || [];
if (cards.length !== 180) failures.push('Expected 180 source cards; found ' + cards.length + '.');
for (const category of ['roles', 'skills', 'baggage', 'vulnerabilities', 'crises', 'actions']) {
  const count = cards.filter((card) => card.category === category).length;
  if (count !== 30) failures.push('Expected 30 cards in ' + category + '; found ' + count + '.');
}

const migrationFiles = (await readdir(resolve(root, 'supabase/migrations')))
  .filter((name) => name.endsWith('.sql'))
  .sort();
for (let index = 1; index <= 17; index += 1) {
  const prefix = '20261104' + String(index).padStart(4, '0');
  if (!migrationFiles.some((name) => name.startsWith(prefix))) {
    failures.push('Missing sequential migration ' + prefix + '.');
  }
}
if (!migrationFiles.some((name) => name.startsWith('202611050018'))) {
  failures.push('Missing migration 202611050018 for the initial reveal implementation.');
}
if (!migrationFiles.some((name) => name.startsWith('202611060019'))) {
  failures.push('Missing migration 202611060019 for simultaneous free card reveal.');
}

if (failures.length) {
  console.error('Runtime contract validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Runtime contracts validated.');
console.log('Controller heartbeat/takeover, creator-elimination failover and shared survivor audit are present.');
console.log('Restored design assets and all 180 source cards remain present.');
console.log('All 20 migrations are present, including simultaneous free reveal and test-room RPC mode guards.');
