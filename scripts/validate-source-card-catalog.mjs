import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = await readFile(resolve('docs/Bunker_Source_Export_For_Audit.txt'), 'utf8');
const manifest = JSON.parse((await readFile(resolve('assets/manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
const cards = manifest.assets || [];
const sheets = [
  ['Роли (Синие)', 'roles'],
  ['Навыки (Зеленые)', 'skills'],
  ['Багаж (Оранжевые)', 'baggage'],
  ['Уязвимости (Алые)', 'vulnerabilities'],
  ['Кризисы (Фиолетовые)', 'crises'],
  ['Действия (Золотые)', 'actions'],
];
const failures = [];
const stats = [];
function parseSheet(name) {
  const marker = '## Лист: ' + name;
  const start = source.indexOf(marker);
  if (start < 0) {
    failures.push('Missing source sheet: ' + name);
    return [];
  }
  const next = source.indexOf('\n## Лист:', start + marker.length);
  const section = source.slice(start, next < 0 ? source.length : next);
  return section.split('\n').filter((line) => /^\|\s*\d+\s*\|/.test(line)).map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 4) {
      failures.push('Unparseable row in ' + name + ': ' + line);
      return null;
    }
    return {
      number: Number(cells[0]),
      title: cells[1].replace(/^\[|\]$/g, ''),
      description: cells[2],
      illustrationIdea: cells[3],
    };
  }).filter(Boolean);
}

if (cards.length !== 180 || manifest.total_assets !== 180) {
  failures.push('Expected exactly 180 manifest cards and total_assets=180.');
}
const ids = new Set();
for (const card of cards) {
  if (ids.has(card.card_id)) failures.push('Duplicate card_id: ' + card.card_id);
  ids.add(card.card_id);
}
for (const [sheetName, category] of sheets) {
  const sourceRows = parseSheet(sheetName);
  const manifestRows = cards.filter((card) => card.category === category)
    .sort((a, b) => a.card_number - b.card_number);
  stats.push(category + ': ' + sourceRows.length + ' source / ' + manifestRows.length + ' manifest');
  if (sourceRows.length !== 30 || manifestRows.length !== 30) {
    failures.push(category + ': expected 30 source and 30 manifest rows.');
  }
  for (const row of sourceRows) {
    const card = manifestRows.find((item) => item.card_number === row.number);
    if (!card) {
      failures.push(category + ' #' + row.number + ': missing manifest entry.');
      continue;
    }
    if (card.original_title !== row.title) failures.push(card.card_id + ': title differs.');
    if (card.source_description !== row.description) failures.push(card.card_id + ': description differs.');
    if ((card.source_illustration_idea || '') !== row.illustrationIdea) failures.push(card.card_id + ': illustration field differs.');
    if (card.format !== 'PNG' || card.width !== 1200 || card.height !== 1600) failures.push(card.card_id + ': unexpected image specification.');
    try {
      const info = await stat(resolve('public', card.relative_path));
      if (!info.isFile() || info.size === 0) failures.push(card.card_id + ': image file is empty or invalid.');
    } catch {
      failures.push(card.card_id + ': missing public asset ' + card.relative_path);
    }
  }
}
if (failures.length) {
  console.error('Source card catalog validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('Source card catalog validation passed: 180 exact card records and 180 image assets.');
console.log(stats.join('\n'));
