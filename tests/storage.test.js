import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckStorage, emptyDraft, isDirty, clone, STORAGE_KEY } from '../storage.js';
import { BASIC_LANDS } from '../cards.js';
const memory = () => { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) }; };
const draftDeck = () => ({ ...emptyDraft({ code: 'tst', name: 'Test Set' }), name: 'Green idea', entries: [{ card: BASIC_LANDS[4], quantity: 17 }] });

test('drafts and complete card metadata survive refresh', () => {
  const storage = memory(), store = new DeckStorage(storage), draft = draftDeck();
  store.write(draft);
  const restored = new DeckStorage(storage); restored.read();
  assert.deepEqual(restored.draft, draft);
  assert.equal(restored.decks.length, 0);
});
test('save/update/save-as, dirty detection, rename and delete keep independent snapshots', () => {
  const store = new DeckStorage(memory());
  const saved = store.save(draftDeck());
  assert.equal(isDirty(saved, store.decks), false);
  const changed = clone(saved); changed.entries[0].quantity++;
  assert.equal(isDirty(changed, store.decks), true);
  assert.equal(store.decks[0].entries[0].quantity, 17);
  const updated = store.save(changed);
  assert.equal(store.decks.length, 1); assert.equal(store.decks[0].entries[0].quantity, 18);
  const copy = store.save(updated, true);
  assert.notEqual(copy.id, updated.id); assert.equal(store.decks.length, 2);
  const renamed = store.rename(copy.id, 'New name', copy);
  assert.equal(renamed.name, 'New name'); assert.equal(store.decks[0].name, 'New name');
  const detached = store.delete(copy.id, renamed);
  assert.equal(detached.id, null); assert.equal(detached.entries[0].quantity, 18); assert.equal(store.decks.length, 1);
});
test('clearing working draft preserves saved deck and allows a full undo', () => {
  const store = new DeckStorage(memory()), saved = store.save(draftDeck());
  store.write(emptyDraft(saved.set));
  assert.equal(store.decks.length, 1); assert.equal(store.draft.id, null); assert.equal(store.draft.entries.length, 0);
  store.write(saved); assert.deepEqual(store.draft, saved);
});
test('failed writes never claim saved state or commit partial changes', () => {
  const storage = memory(), store = new DeckStorage(storage), saved = store.save(draftDeck());
  const before = clone(store.decks), oldDraft = clone(store.draft);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => store.save({ ...saved, name: 'Changed' }), /Quota/);
  assert.throws(() => store.delete(saved.id, saved), /Quota/);
  assert.throws(() => store.rename(saved.id, 'Changed', saved), /Quota/);
  assert.deepEqual(store.decks, before); assert.deepEqual(store.draft, oldDraft);
});
test('malformed data stays untouched and cannot be loaded as a deck', () => {
  const storage = memory(); storage.setItem(STORAGE_KEY, '{oops');
  assert.throws(() => new DeckStorage(storage).read()); assert.equal(storage.getItem(STORAGE_KEY), '{oops');
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, decks: [], draft: { ...draftDeck(), entries: [{ card: BASIC_LANDS[0], quantity: -1 }] } }));
  assert.throws(() => new DeckStorage(storage).read(), /could not be read/);
});
