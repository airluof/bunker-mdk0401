import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const migrationPath = resolve(root, 'supabase/migrations/202611040001_initial_multiplayer_schema.sql');
const invite014Path = resolve(root, 'supabase/migrations/202611040014_short_room_invite_codes.sql');
const invite015Path = resolve(root, 'supabase/migrations/202611040015_full_alphabet_invite_codes.sql');
const invite016Path = resolve(root, 'supabase/migrations/202611040016_alphanumeric_room_codes.sql');

const [sql, invite014, invite015, invite016] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(invite014Path, 'utf8'),
  readFile(invite015Path, 'utf8'),
  readFile(invite016Path, 'utf8'),
]);

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
const count = (source, pattern) => [...source.matchAll(pattern)].length;
const requireText = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};

const beginCount = count(sql, /^begin;$/gim);
const commitCount = count(sql, /^commit;$/gim);
if (beginCount !== 1) failures.push('Expected exactly one BEGIN;');
if (commitCount !== 1) failures.push('Expected exactly one COMMIT;');

for (const table of expectedTables) {
  const createPattern = new RegExp('^create table public\\.' + table + '\\s*\\(', 'gim');
  const rlsPattern = new RegExp('^alter table public\\.' + table + ' enable row level security;', 'gim');
  if (count(sql, createPattern) !== 1) failures.push('Table must be created exactly once: ' + table);
  if (count(sql, rlsPattern) !== 1) failures.push('RLS must be enabled exactly once: ' + table);
}

for (const fn of expectedFunctions) {
  const pattern = new RegExp('^create or replace function ' + fn.replace('.', '\\.') + '\\s*\\(', 'gim');
  if (count(sql, pattern) !== 1) failures.push('Function must be defined exactly once: ' + fn);
}

const functionOpeners = count(sql, /^as \$\$$/gim);
const anonymousBlockOpeners = count(sql, /^do \$\$$/gim);
const dollarClosers = count(sql, /^\$\$;$/gim);
if (functionOpeners !== expectedFunctions.length) {
  failures.push('Unexpected count of function dollar-quote openers: ' + functionOpeners);
}
if (anonymousBlockOpeners !== 1) failures.push('Expected exactly one DO $$ block.');
if (dollarClosers !== functionOpeners + anonymousBlockOpeners) failures.push('Dollar-quoted SQL blocks are not balanced.');

requireText(sql, /extensions\.gen_random_bytes\(16\)/, 'Initial room invite must use 128 bits of random data.');
requireText(sql, /p_invite_code !~ '\^\[0-9A-Fa-f\]\{32\}\$'/, 'Initial join RPC must validate legacy 32-character hexadecimal invite codes.');
requireText(sql, /extensions\.digest\(convert_to\(upper\(p_invite_code\), 'UTF8'\), 'sha256'\)/, 'Initial invite codes must be hashed before lookup.');
requireText(sql, /v_result - 'invite_code'/, 'Raw invite codes must not be stored in command receipts.');
requireText(sql, /primary key \(card_id, catalog_version\)/, 'Catalog records must preserve immutable catalog versions.');
requireText(sql, /foreign key \(card_id, catalog_version\)/, 'Card instances must reference a specific catalog version.');
requireText(sql, /revoke all on public\.rooms[\s\S]*?from public, anon, authenticated;/i, 'Direct table privileges must be revoked from public/anon/authenticated.');
requireText(sql, /grant select, insert, update, delete on public\.card_catalog to service_role;/i, 'Only the service role should receive direct catalog import privileges.');
requireText(sql, /revoke all on function public\.api_create_room\(text, uuid\) from public, anon;/i, 'RPC execute privileges must be revoked from PUBLIC and anon.');
requireText(sql, /grant execute on function public\.api_create_room\(text, uuid\) to authenticated;/i, 'Authenticated room creation RPC grant is missing.');

requireText(invite014, /v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'/i, 'Migration 014 must include five-letter invite generation.');
requireText(invite014, /for v_char_index in 1\.\.5 loop/i, 'Migration 014 must generate five-letter invite codes.');
requireText(invite014, /v_random_byte < 240/i, 'Migration 014 invite generation must use unbiased rejection sampling.');
requireText(invite014, /v_random_byte % 24/i, 'Migration 014 must select from all 24 configured letters.');
requireText(invite014, /\[A-HJ-NP-Z\]\{5\}/i, 'Migration 014 must accept its five-letter alphabet.');
requireText(invite014, /extensions\.digest\(convert_to\(upper\(btrim\(p_invite_code\)\), 'UTF8'\), 'sha256'\)/i, 'Migration 014 must hash normalized invite codes.');

requireText(invite015, /v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'/i, 'Migration 015 must use the full A-Z alphabet.');
requireText(invite015, /v_random_byte < 234/i, 'Migration 015 must use unbiased rejection sampling.');
requireText(invite015, /v_random_byte % 26/i, 'Migration 015 must select from all 26 letters.');
requireText(invite015, /\[A-Z\]\{5\}/i, 'Migration 015 must accept any five-letter A-Z code.');
if (!invite015.includes("upper(btrim(p_invite_code)) !~ '^([A-Z]{5}|[0-9A-F]{32})$'")) {
  failures.push('Migration 015 must use a complete five-letter A-Z validation pattern.');
}
requireText(invite015, /extensions\.digest\(convert_to\(upper\(btrim\(p_invite_code\)\), 'UTF8'\), 'sha256'\)/i, 'Migration 015 must hash normalized invite codes.');
requireText(invite015, /revoke all on function public\.api_create_room\(text, uuid\) from public, anon;/i, 'Migration 015 must revoke room creation from PUBLIC and anon.');
requireText(invite015, /grant execute on function public\.api_create_room\(text, uuid\) to authenticated;/i, 'Migration 015 must grant room creation to authenticated users.');
requireText(invite016, /v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'/i, 'Migration 016 must use A-Z and 0-9.');
requireText(invite016, /v_random_byte < 252/i, 'Migration 016 must use unbiased rejection sampling.');
requireText(invite016, /v_random_byte % 36/i, 'Migration 016 must generate from 36 alphanumeric characters.');
requireText(invite016, /\[A-Z0-9\]\{5\}/i, 'Migration 016 must accept any five-character alphanumeric code.');
if (!invite016.includes("upper(btrim(p_invite_code)) !~ '^([A-Z0-9]{5}|[0-9A-F]{32})

if (/grant\s+[^;]+?\s+to\s+anon\s*;/i.test(sql)) {
  failures.push('The base schema migration must not grant database access to anon.');
}

if (failures.length) {
  console.error('Supabase migration validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Supabase migration structure validated.');
console.log(expectedTables.length + ' tables with RLS; ' + expectedFunctions.length + ' protected functions.');
console.log('Five-character alphanumeric invite generation, legacy-code compatibility and versioned catalog constraints are present.');
")) {
  failures.push('Migration 016 must use a complete five-character alphanumeric validation pattern.');
}


if (/grant\s+[^;]+?\s+to\s+anon\s*;/i.test(sql)) {
  failures.push('The base schema migration must not grant database access to anon.');
}

if (failures.length) {
  console.error('Supabase migration validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Supabase migration structure validated.');
console.log(expectedTables.length + ' tables with RLS; ' + expectedFunctions.length + ' protected functions.');
console.log('Five-letter full A-Z invite generation, legacy-code compatibility and versioned catalog constraints are present.');
