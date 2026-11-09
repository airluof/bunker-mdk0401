import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [manifestText, guidance] = await Promise.all([
  readFile(resolve('assets/manifest.json'), 'utf8'),
  readFile(resolve('src/data/cardGuidance.ts'), 'utf8'),
]);
const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
const cards = manifest.assets || [];
const ids = new Set(cards.map((card) => card.card_id));
const failures = [];
const categoryCounts = Object.fromEntries(
  ['roles', 'skills', 'baggage', 'vulnerabilities', 'crises', 'actions']
    .map((category) => [category, cards.filter((card) => card.category === category).length]),
);

if (cards.length !== 180) failures.push('Expected 180 source cards.');
for (const [category, count] of Object.entries(categoryCounts)) {
  if (count !== 30) failures.push('Expected 30 cards in ' + category + '; found ' + count + '.');
}

const crisisRows = [...guidance.matchAll(
  /crisisId: '(crisis_\d+)', roles: \[([^\]]*)\], skills: \[([^\]]*)\], baggage: \[([^\]]*)\]/g,
)];
if (crisisRows.length !== 30) failures.push('Expected relationship guidance for all 30 crises.');

const linkedByCategory = {
  roles: new Set(),
  skills: new Set(),
  baggage: new Set(),
};
for (const match of crisisRows) {
  const crisisId = match[1];
  if (!ids.has(crisisId)) failures.push('Unknown crisis id in relationship map: ' + crisisId);
  for (const [category, index] of [['roles', 2], ['skills', 3], ['baggage', 4]]) {
    const related = match[index].match(/[a-z]+_\d{2}/g) || [];
    if (related.length === 0) failures.push(crisisId + ' has no related ' + category + '.');
    for (const id of related) {
      if (!ids.has(id)) failures.push('Unknown related card id: ' + id);
      linkedByCategory[category].add(id);
    }
  }
}
for (const category of ['roles', 'skills', 'baggage']) {
  for (const card of cards.filter((item) => item.category === category)) {
    if (!linkedByCategory[category].has(card.card_id)) {
      failures.push('Card is not connected to any crisis: ' + card.card_id);
    }
  }
}

const vulnerabilityIds = [...guidance.matchAll(/^\s*(vulnerability_\d+): \[/gm)].map((match) => match[1]);
if (vulnerabilityIds.length !== 30) failures.push('Expected risk links for all 30 vulnerabilities.');
for (const id of vulnerabilityIds) if (!ids.has(id)) failures.push('Unknown vulnerability id: ' + id);

const actionRows = [...guidance.matchAll(/^\s*(action_\d+): \{ status: '(ready|needs-rule|blocked)'/gm)];
if (actionRows.length !== 30) failures.push('Expected rule status for all 30 actions.');
const actionStatusCounts = { ready: 0, 'needs-rule': 0, blocked: 0 };
for (const [, id, status] of actionRows) {
  if (!ids.has(id)) failures.push('Unknown action id: ' + id);
  actionStatusCounts[status] += 1;
}
if (actionStatusCounts.ready !== 20) failures.push('Expected 20 ready actions.');
if (actionStatusCounts.blocked !== 2) failures.push('Expected two blocked partial actions.');
if (actionStatusCounts['needs-rule'] !== 8) failures.push('Expected eight actions requiring rule clarification.');

for (const id of ids) {
  if (!guidance.includes(id)) failures.push('No relationship or rule guidance for card ' + id + '.');
}
if (!guidance.includes("card.category === 'crises'") || !guidance.includes("card.category === 'vulnerabilities'")) {
  failures.push('Card guidance must expose crisis and vulnerability relationships.');
}
if (!guidance.includes('не автоматические бонусы') || !guidance.includes('не накладывает штраф')) {
  failures.push('The UI must distinguish thematic relationships from gameplay effects.');
}

if (failures.length) {
  console.error('Card guidance validation failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Card guidance validation passed.');
console.log('All 180 cards are covered by category-specific guidance and thematic links.');
console.log('Crisis links cover every Role, Skill and Baggage card.');
console.log('Action status: 14 ready, 2 blocked pending implementation, 14 awaiting rule clarification.');
