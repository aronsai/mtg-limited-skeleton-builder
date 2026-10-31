import { deduplicateCards } from './cards.js';
const API = 'https://api.scryfall.com';
const setCache = new Map();
let lastRequest = 0;
let requestQueue = Promise.resolve();

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Request canceled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}
async function request(url, signal) {
  const turn = requestQueue.then(async () => {
    signal?.throwIfAborted();
    await pause(Math.max(0, 600 - (Date.now() - lastRequest)), signal);
    signal?.throwIfAborted();
    lastRequest = Date.now();
  });
  requestQueue = turn.catch(() => {});
  await turn;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    if (response.status === 404) return { data: [], has_more: false };
    throw new Error(response.status === 429 ? 'Scryfall is busy. Please wait a moment and retry.' : `Scryfall returned ${response.status}. Please retry.`);
  }
  return response.json();
}
export async function loadSets(signal) {
  const result = await request(`${API}/sets`, signal);
  return result.data.filter(set => set.card_count > 0 && !['token', 'memorabilia'].includes(set.set_type))
    .sort((a, b) => (b.released_at || '').localeCompare(a.released_at || '') || a.name.localeCompare(b.name));
}
export function defaultSet(sets, today = new Date().toISOString().slice(0, 10)) {
  return sets.find(set => set.set_type === 'expansion' && set.released_at <= today) || sets.find(set => set.released_at <= today) || sets[0];
}
export async function loadSetCards(code, { signal, onProgress = () => {} } = {}) {
  if (setCache.has(code)) return setCache.get(code);
  const query = new URLSearchParams({ q: `set:${code} lang:en`, unique: 'prints', include_variations: 'true', order: 'set' });
  let url = `${API}/cards/search?${query}`;
  const printings = [];
  while (url) {
    const result = await request(url, signal);
    printings.push(...result.data);
    onProgress(printings.length, result.total_cards || printings.length);
    url = result.has_more ? result.next_page : null;
    if (url && !url.startsWith(`${API}/`)) throw new Error('Unexpected pagination URL from Scryfall.');
  }
  signal?.throwIfAborted();
  const cards = deduplicateCards(printings);
  setCache.set(code, cards);
  return cards;
}
