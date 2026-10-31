import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCard, deduplicateCards, filterCards, category, deckStats, BASIC_LANDS } from '../cards.js';

const raw = (id, extra = {}) => ({ id: `print-${id}`, oracle_id: id, name: id, type_line: 'Creature — Elf', colors: ['G'], cmc: 2, mana_cost: '{1}{G}', rarity: 'common', collector_number: '2', booster: true, ...extra });
const defaults = extra => ({ search: '', colors: new Set(), type: '', rarity: '', mv: '', booster: false, sort: 'name', ...extra });

test('alternate printings collapse, prefer base art, and retain booster eligibility in either order', () => {
  const prints = [raw('elf', { collector_number: '202', booster: true }), raw('elf', { collector_number: '2', booster: false }), raw('token', { type_line: 'Token Creature — Elf', layout: 'token' })];
  for (const input of [prints, [...prints].reverse()]) {
    const cards = deduplicateCards(input);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].number, '2');
    assert.equal(cards[0].booster, true);
  }
});

test('color selection includes subsets and explicit colorless/multicolor categories', () => {
  const cards = [['white', ['W']], ['blue', ['U']], ['azorius', ['W', 'U']], ['dimir', ['U', 'B']], ['rock', []]].map(([name, colors]) => normalizeCard(raw(name, { colors })));
  const names = selected => filterCards(cards, defaults({ colors: new Set(selected) })).map(c => c.name);
  assert.deepEqual(names(['W', 'U']), ['azorius', 'blue', 'white']);
  assert.deepEqual(names(['C']), ['rock']);
  assert.deepEqual(names(['M']), ['azorius', 'dimir']);
  assert.deepEqual(names(['W', 'C']), ['rock', 'white']);
});

test('filters combine locally and collector numbers sort numerically', () => {
  const cards = [normalizeCard(raw('A', { oracle_text: 'Flying', cmc: 7, collector_number: '10' })), normalizeCard(raw('B', { oracle_text: 'Flying', cmc: 8, collector_number: '2', booster: false })), normalizeCard(raw('C', { cmc: 2, rarity: 'rare' }))];
  assert.deepEqual(filterCards(cards, defaults({ search: 'FLYING', mv: '7', booster: true, type: 'Creature', rarity: 'common' })).map(c => c.name), ['A']);
  assert.deepEqual(filterCards(cards, defaults({ mv: '7', sort: 'number' })).map(c => c.name), ['B', 'A']);
  assert.equal(filterCards(cards, defaults({ mv: '2', rarity: 'rare' }))[0].name, 'C');
});

test('multiface cards retain text/images and front-side land classification', () => {
  const card = normalizeCard(raw('Front // Back', { colors: undefined, mana_cost: undefined, type_line: 'Sorcery // Land', card_faces: [{ name: 'Front', colors: ['G'], mana_cost: '{2}{G}', oracle_text: 'Create a token.', image_uris: { normal: 'https://example.com/front.jpg' } }, { name: 'Back', type_line: 'Land', oracle_text: 'Add green.', image_uris: { normal: 'https://example.com/back.jpg' } }] }));
  assert.equal(card.image, 'https://example.com/front.jpg');
  assert.equal(card.faces[1].image, 'https://example.com/back.jpg');
  assert.equal(card.mana_cost, '{2}{G}');
  assert.equal(card.oracle_text, 'Create a token.\nAdd green.');
  assert.equal(category(card), 'spells');
  assert.deepEqual(card.colors, ['G']);
});

test('statistics count quantities, exclude lands from average, and group 7+', () => {
  const entries = [{ card: normalizeCard(raw('Elf')), quantity: 3 }, { card: normalizeCard(raw('Spell', { cmc: 9, type_line: 'Instant' })), quantity: 2 }, { card: BASIC_LANDS[4], quantity: 17 }];
  assert.deepEqual(deckStats(entries), { total: 22, creatures: 3, spells: 2, lands: 17, curve: [0, 0, 3, 0, 0, 0, 0, 2], average: 4.8 });
  assert.equal(deckStats([]).average, 0);
});
