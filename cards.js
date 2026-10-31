export const COLORS = ['W', 'U', 'B', 'R', 'G'];
export const COLOR_SYMBOLS = { W: '☀', U: '◉', B: '♠', R: '◆', G: '♣', C: '◇' };
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'];

export function normalizeCard(raw) {
  const faces = raw.card_faces?.map(face => ({
    name: face.name, mana_cost: face.mana_cost || '', type_line: face.type_line || '',
    oracle_text: face.oracle_text || '', image: face.image_uris?.normal || '',
    art: face.image_uris?.art_crop || '', colors: face.colors || [],
  })) || [];
  return {
    id: raw.oracle_id || raw.id, printingId: raw.id, name: raw.name,
    cmc: Number(raw.cmc) || 0, mana_cost: raw.mana_cost || faces[0]?.mana_cost || '',
    type_line: raw.type_line || faces[0]?.type_line || '',
    oracle_text: raw.oracle_text || faces.map(face => face.oracle_text).join('\n'),
    colors: raw.colors || [...new Set(faces.flatMap(face => face.colors))],
    rarity: raw.rarity || 'common', number: raw.collector_number || '',
    booster: Boolean(raw.booster), image: raw.image_uris?.normal || faces[0]?.image || '',
    art: raw.image_uris?.art_crop || faces[0]?.art || '', faces, set: raw.set,
  };
}

export function deduplicateCards(printings) {
  const cards = new Map();
  for (const raw of printings) {
    if (/Token|Emblem|Art Series/.test(raw.type_line || '') || ['token', 'double_faced_token', 'emblem', 'art_series'].includes(raw.layout)) continue;
    const card = normalizeCard(raw);
    const previous = cards.get(card.id);
    if (!previous) cards.set(card.id, card);
    else {
      const booster = previous.booster || card.booster;
      if (compareNumbers(card.number, previous.number) < 0) cards.set(card.id, card);
      cards.get(card.id).booster = booster;
    }
  }
  return [...cards.values()];
}

export function colorGroup(card) {
  if (card.colors.length > 1) return 'M';
  return card.colors[0] || 'C';
}
export function category(card) {
  // A modal spell with a land back remains a spell in the curve.
  const frontType = card.type_line.split(' // ')[0];
  return frontType.includes('Land') ? 'lands' : frontType.includes('Creature') ? 'creatures' : 'spells';
}
export function manaBucket(card) { return Math.min(7, Math.max(0, Math.floor(card.cmc))); }
export function compareNumbers(a, b) { return a.localeCompare(b, undefined, { numeric: true }); }

export function filterCards(cards, filters) {
  const search = filters.search.trim().toLocaleLowerCase();
  const selected = filters.colors;
  const regular = [...selected].filter(color => COLORS.includes(color));
  return cards.filter(card => {
    if (search && !`${card.name} ${card.oracle_text}`.toLocaleLowerCase().includes(search)) return false;
    if (filters.booster && !card.booster) return false;
    if (filters.type && !card.type_line.includes(filters.type)) return false;
    if (filters.rarity && card.rarity !== filters.rarity) return false;
    if (filters.mv !== '' && (filters.mv === '7' ? card.cmc < 7 : card.cmc !== Number(filters.mv))) return false;
    if (selected.size) {
      const matchesColors = card.colors.length > 0 && regular.length > 0 && card.colors.every(color => selected.has(color));
      const matchesSpecial = (selected.has('C') && !card.colors.length) || (selected.has('M') && card.colors.length > 1);
      if (!matchesColors && !matchesSpecial) return false;
    }
    return true;
  }).sort((a, b) => {
    let difference = 0;
    if (filters.sort === 'cmc') difference = a.cmc - b.cmc;
    if (filters.sort === 'rarity') difference = RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity);
    if (filters.sort === 'number') difference = compareNumbers(a.number, b.number);
    if (filters.sort === 'color') difference = [...COLORS, 'M', 'C'].indexOf(colorGroup(a)) - [...COLORS, 'M', 'C'].indexOf(colorGroup(b)) || a.cmc - b.cmc;
    return difference || a.name.localeCompare(b.name);
  });
}

export function deckStats(entries) {
  const stats = { total: 0, creatures: 0, spells: 0, lands: 0, curve: Array(8).fill(0), average: 0 };
  let mana = 0;
  for (const { card, quantity } of entries) {
    stats.total += quantity;
    const type = category(card);
    stats[type] += quantity;
    if (type !== 'lands') { stats.curve[manaBucket(card)] += quantity; mana += card.cmc * quantity; }
  }
  stats.average = mana / (stats.creatures + stats.spells) || 0;
  return stats;
}

export const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((name, i) => ({
  id: `basic-${COLORS[i]}`, printingId: '', name, cmc: 0, mana_cost: '',
  type_line: `Basic Land — ${name}`, oracle_text: `{T}: Add {${COLORS[i]}}.`,
  colors: [], rarity: 'common', number: '', booster: true, image: '', art: '', faces: [], set: '', basicColor: COLORS[i],
}));
