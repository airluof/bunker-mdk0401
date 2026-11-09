import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CATALOG_VERSION = 'v1';
const MANIFEST_PATH = resolve(process.env.BUNKER_CARD_MANIFEST_PATH || 'assets/manifest.json');

const manifestText = await readFile(MANIFEST_PATH, 'utf8');
const source = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
const assets = source.assets;

if (!Array.isArray(assets)) {
  throw new Error('assets/manifest.json must contain an assets array.');
}

const expectedCategories = ['roles', 'skills', 'baggage', 'vulnerabilities', 'crises', 'actions'];
const sourceSheets = {
  roles: 'Роли (Синие)',
  skills: 'Навыки (Зеленые)',
  baggage: 'Багаж (Оранжевые)',
  vulnerabilities: 'Уязвимости (Алые)',
  crises: 'Кризисы (Фиолетовые)',
  actions: 'Действия (Золотые)',
};

const approvedActionHandlers = {
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

const ids = new Set();
const counts = Object.fromEntries(expectedCategories.map((category) => [category, 0]));

const rows = assets.map((card) => {
  if (!card.card_id || ids.has(card.card_id)) {
    throw new Error('Missing or duplicate card_id in the manifest.');
  }
  ids.add(card.card_id);

  if (!expectedCategories.includes(card.category)) {
    throw new Error('Unexpected category for ' + card.card_id + ': ' + card.category);
  }

  if (!card.original_title || typeof card.source_description !== 'string') {
    throw new Error('Missing original text for ' + card.card_id);
  }

  counts[card.category] += 1;

  return {
    card_id: card.card_id,
    source_number: card.card_number,
    category: card.category,
    title_original: card.original_title,
    description_original: card.source_description,
    illustration_idea_original: card.source_illustration_idea ?? null,
    image_path: card.relative_path ?? null,
    source_sheet: sourceSheets[card.category],
    catalog_version: CATALOG_VERSION,
    effect_status: card.category === 'actions'
      ? (approvedActionHandlers[card.card_id] ? 'approved' : 'draft')
      : 'not_applicable',
    effect_handler_id: approvedActionHandlers[card.card_id] ?? null,
  };
});

if (rows.length !== 180 || expectedCategories.some((category) => counts[category] !== 30)) {
  throw new Error('Catalog validation failed. Total: ' + rows.length + '; categories: ' + JSON.stringify(counts));
}

console.log('Validated ' + rows.length + ' cards: ' + JSON.stringify(counts));

if (process.argv.includes('--dry-run')) {
  console.log('Dry run only. No data was sent to Supabase.');
  process.exit(0);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the current shell.');
  process.exit(1);
}

if (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Do not use a VITE_* variable for the service-role key.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (let offset = 0; offset < rows.length; offset += 30) {
  const batch = rows.slice(offset, offset + 30);
  const { error } = await supabase
    .from('card_catalog')
    .upsert(batch, { onConflict: 'card_id,catalog_version' });

  if (error) {
    throw new Error('Import failed at batch ' + (offset / 30 + 1) + ': ' + error.message);
  }
  console.log('Imported ' + Math.min(offset + batch.length, rows.length) + '/' + rows.length);
}

const { data: verification, error: verificationError } = await supabase
  .from('card_catalog')
  .select('card_id, category')
  .eq('catalog_version', CATALOG_VERSION);

if (verificationError) {
  throw new Error('Could not verify imported catalog: ' + verificationError.message);
}

const verifiedCounts = Object.fromEntries(expectedCategories.map((category) => [
  category,
  verification.filter((card) => card.category === category).length,
]));

if (verification.length !== 180 || expectedCategories.some((category) => verifiedCounts[category] !== 30)) {
  throw new Error('Supabase verification failed. Total: ' + verification.length + '; categories: ' + JSON.stringify(verifiedCounts));
}

console.log('Import verified: ' + verification.length + ' cards.');
console.log('The service-role key was used only in this local script process and was not written to a file.');
