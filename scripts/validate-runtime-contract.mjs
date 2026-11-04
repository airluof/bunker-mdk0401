import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const paths = {
  migration: 'supabase/migrations/202611040012_controller_failover_and_shared_audit.sql',
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
const expected = Array.from({ length: 12 }, (_, index) => '20261104' + String(index + 1).padStart(4, '0'));
for (const prefix of expected) {
  if (!migrationFiles.some((name) => name.startsWith(prefix))) {
    failures.push('Missing sequential migration ' + prefix + '.');
  }
}

if (failures.length) {
  console.error('Runtime contract validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Runtime contracts validated.');
console.log('Controller heartbeat/takeover, creator-elimination failover and shared survivor audit are present.');
console.log('Restored design assets and all 180 source cards remain present.');
console.log('All 12 sequential migrations are present.');
