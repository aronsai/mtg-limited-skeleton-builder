export const testSets = [
  { code: 'fut', name: 'Future Set', set_type: 'expansion', released_at: '2099-01-01', card_count: 1 },
  { code: 'tst', name: 'The Test Wilds', set_type: 'expansion', released_at: '2020-01-01', card_count: 11 },
  { code: 'old', name: 'Older Horizons', set_type: 'expansion', released_at: '2010-01-01', card_count: 1 },
];
function card(id, name, colors, cmc, mana_cost, type_line, extra = {}) {
  return { id: `print-${id}`, oracle_id: id, name, colors, cmc, mana_cost, type_line, oracle_text: 'A test card. Flying.', rarity: 'common', collector_number: String(cmc + 1), set: 'tst', booster: true, image_uris: { normal: `https://cards.scryfall.io/test/${id}.jpg`, art_crop: `https://cards.scryfall.io/test/${id}-art.jpg` }, ...extra };
}
export const testPrintings = [
  card('elf', 'Llanowar Elves', ['G'], 1, '{G}', 'Creature — Elf Druid'),
  card('mystic', 'Elvish Mystic', ['G'], 1, '{G}', 'Creature — Elf Druid'),
  card('overseer', 'Inspiring Overseer', ['W'], 3, '{2}{W}', 'Creature — Angel', { rarity: 'uncommon' }),
  card('terror', 'Tolarian Terror', ['U'], 7, '{6}{U}', 'Creature — Serpent'),
  card('negate', 'Negate', ['U'], 2, '{1}{U}', 'Instant'),
  card('strike', 'Lightning Strike', ['R'], 2, '{1}{R}', 'Instant', { booster: false }),
  card('gold', 'Sky Patrol', ['W', 'U'], 3, '{1}{W}{U}', 'Creature — Bird', { rarity: 'rare' }),
  card('rock', 'Prismatic Rock', [], 2, '{2}', 'Artifact', { image_uris: undefined }),
  card('forest', 'Forest', [], 0, '', 'Basic Land — Forest'),
  card('dfc', 'Day Scholar // Night Sage', undefined, 2, '', 'Creature — Human // Creature — Wizard', { image_uris: undefined, oracle_text: undefined, rarity: 'mythic', card_faces: [{ name: 'Day Scholar', type_line: 'Creature — Human', mana_cost: '{1}{U}', colors: ['U'], oracle_text: 'Read by day.', image_uris: { normal: 'https://cards.scryfall.io/test/day.jpg' } }, { name: 'Night Sage', type_line: 'Creature — Wizard', colors: ['U'], oracle_text: 'Think by night.', image_uris: { normal: 'https://cards.scryfall.io/test/night.jpg' } }] }),
  card('elf', 'Llanowar Elves', ['G'], 1, '{G}', 'Creature — Elf Druid', { id: 'alternate-elf', collector_number: '299', booster: false }),
];
export const oldPrintings = [card('old-card', 'Ancient Possibility', ['B'], 4, '{3}{B}', 'Sorcery', { set: 'old' })];
