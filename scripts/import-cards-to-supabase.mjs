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
    effect_status: ['action_04', 'action_28'].includes(card.card_id) ? 'approved' : card.category === 'actions' ? 'draft' : 'not_applicable',
    effect_handler_id: card.card_id === 'action_04'
      ? 'hotfix_discard_own_vulnerability'
      : card.card_id === 'action_28'
        ? 'emergency_generator_capacity_plus_one'
        : null,
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
