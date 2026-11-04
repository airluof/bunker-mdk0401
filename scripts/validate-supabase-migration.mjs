import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/202611040001_initial_multiplayer_schema.sql',
);
const sql = await readFile(migrationPath, 'utf8');
const inviteMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/202611040014_short_room_invite_codes.sql',
);
const inviteSql = await readFile(inviteMigrationPath, 'utf8');

const expectedTables = [
  'rooms',
  'room_members',
  'room_invites',
  'game_sessions',
  'public_game_state',
  'card_catalog',
  'card_instances',
  'votes',
  'published_vote_results',
  'public_game_events',
  'player_private_events',
  'audit_submissions',
  'command_receipts',
];

const expectedFunctions = [
  'private.is_active_room_member',
  'public.api_create_room',
  'public.api_join_room',
  'public.api_get_room_snapshot',
  'public.api_start_game',
  'public.api_leave_room',
  'public.api_close_room',
];

const failures = [];
const count = (pattern) => [...sql.matchAll(pattern)].length;
const requireText = (pattern, message) => {
  if (!pattern.test(sql)) failures.push(message);
};
const requireInviteText = (pattern, message) => {
  if (!pattern.test(inviteSql)) failures.push(message);
};

const beginCount = count(/^begin;$/gim);
const commitCount = count(/^commit;$/gim);
if (beginCount !== 1) failures.push('Expected exactly one BEGIN;');
if (commitCount !== 1) failures.push('Expected exactly one COMMIT;');

for (const table of expectedTables) {
  const createPattern = new RegExp('^create table public\\.' + table + '\\s*\\(', 'gim');
  const rlsPattern = new RegExp('^alter table public\\.' + table + ' enable row level security;', 'gim');
  if (count(createPattern) !== 1) failures.push('Table must be created exactly once: ' + table);
  if (count(rlsPattern) !== 1) failures.push('RLS must be enabled exactly once: ' + table);
}

for (const fn of expectedFunctions) {
  const pattern = new RegExp('^create or replace function ' + fn.replace('.', '\\.') + '\\s*\\(', 'gim');
  if (count(pattern) !== 1) failures.push('Function must be defined exactly once: ' + fn);
}

const functionOpeners = count(/^as \$\$$/gim);
const anonymousBlockOpeners = count(/^do \$\$$/gim);
const dollarClosers = count(/^\$\$;$/gim);
if (functionOpeners !== expectedFunctions.length) {
  failures.push('Unexpected count of function dollar-quote openers: ' + functionOpeners);
}
if (anonymousBlockOpeners !== 1) {
  failures.push('Expected exactly one DO $$ block.');
}
if (dollarClosers !== functionOpeners + anonymousBlockOpeners) {
  failures.push('Dollar-quoted SQL blocks are not balanced.');
}

requireText(/extensions\.gen_random_bytes\(16\)/, 'Room invitation must use 128 bits of random data.');
requireText(/p_invite_code !~ '\^\[0-9A-Fa-f\]\{32\}\$'/, 'Join RPC must validate a 32-character hexadecimal invite code.');
requireText(/extensions\.digest\(convert_to\(upper\(p_invite_code\), 'UTF8'\), 'sha256'\)/, 'Invite codes must be hashed before lookup.');
requireText(/v_result - 'invite_code'/, 'Raw invite codes must not be stored in command receipts.');
requireText(/primary key \(card_id, catalog_version\)/, 'Catalog records must preserve immutable catalog versions.');
requireText(/foreign key \(card_id, catalog_version\)/, 'Card instances must reference a specific catalog version.');
requireText(/revoke all on public\.rooms[\s\S]*?from public, anon, authenticated;/i, 'Direct table privileges must be revoked from public/anon/authenticated.');
requireText(/grant select, insert, update, delete on public\.card_catalog to service_role;/i, 'Only the service role should receive direct catalog import privileges.');
requireText(/revoke all on function public\.api_create_room\(text, uuid\) from public, anon;/i, 'RPC execute privileges must be revoked from PUBLIC and anon.');
requireText(/grant execute on function public\.api_create_room\(text, uuid\) to authenticated;/i, 'Authenticated room creation RPC grant is missing.');
requireInviteText(/v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'/i, 'Short invite alphabet is missing or includes ambiguous letters.');
requireInviteText(/for v_char_index in 1\.\.5 loop/i, 'Room creation must generate exactly five letters.');
if (!inviteSql.includes("upper(btrim(p_invite_code)) !~ '^([A-HJ-NP-Z]{5}|[0-9A-F]{32})$'")) {
  failures.push('Join RPC must accept five-letter invite codes and keep legacy 32-character codes valid.');
}
if (!inviteSql.includes("extensions.digest(convert_to(upper(btrim(p_invite_code)), 'UTF8'), 'sha256')")) {
  failures.push('Updated join RPC must hash normalized invite codes before lookup.');
}
requireInviteText(/INVITE_CODE_GENERATION_FAILED/, 'Short invite collision handling is missing.');

if (/grant\s+[^;]+?\s+to\s+anon\s*;/i.test(sql)) {
  failures.push('The migration must not grant database access to anon.');
}

if (failures.length > 0) {
  console.error('Supabase migration validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Supabase migration structure validated.');
console.log(expectedTables.length + ' tables with RLS; ' + expectedFunctions.length + ' protected functions.');
console.log('Base schema hashing, five-letter invite generation, legacy-code compatibility and versioned catalog constraints are present.');
