import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSet, loadSetCards, loadSets } from '../scryfall.js';
const originalFetch = globalThis.fetch;
const card = (id, extra = {}) => ({ id, oracle_id: id, name: id, type_line: 'Instant', cmc: 1, colors: ['U'], collector_number: '1', ...extra });

test('Scryfall pagination, caching, pacing, cancellation, retry and default set', async t => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async url => {
    calls.push({ url: String(url), time: Date.now() });
    return { ok: true, json: async () => String(url).endsWith('/page2') ? { data: [card('B')], has_more: false } : { data: [card('A')], has_more: true, next_page: 'https://api.scryfall.com/page2', total_cards: 2 } };
  };
  const progress = [];
  const loaded = await loadSetCards('pagination-test', { onProgress: (...args) => progress.push(args) });
  assert.deepEqual(loaded.map(c => c.name), ['A', 'B']);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.ok(calls[1].time - calls[0].time >= 580);
  assert.equal(await loadSetCards('pagination-test'), loaded);
  assert.equal(calls.length, 2);
  const aborter = new AbortController(); aborter.abort();
  await assert.rejects(loadSetCards('aborted-test', { signal: aborter.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 2);
  let attempts = 0;
  globalThis.fetch = async () => { attempts++; return attempts === 1 ? { ok: false, status: 429 } : { ok: true, json: async () => ({ data: [card('Retry')], has_more: false }) }; };
  await assert.rejects(loadSetCards('retry-test'), /wait a moment/);
  assert.equal((await loadSetCards('retry-test'))[0].name, 'Retry');
  assert.equal(attempts, 2);
  const sets = [{ name: 'Future', code: 'fut', set_type: 'expansion', released_at: '2099-01-01', card_count: 10 }, { name: 'Core', code: 'cor', set_type: 'core', released_at: '2025-01-01', card_count: 10 }, { name: 'Expansion', code: 'exp', set_type: 'expansion', released_at: '2024-01-01', card_count: 10 }, { name: 'Tokens', code: 'tok', set_type: 'token', released_at: '2026-01-01', card_count: 10 }];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: sets }) });
  const available = await loadSets();
  assert.equal(available.length, 3);
  assert.equal(defaultSet(available, '2026-10-31').code, 'exp');
});
