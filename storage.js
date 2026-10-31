export const STORAGE_KEY = 'skeleton-builder.v1';
export function emptyDraft(set = null) { return { id: null, name: 'Untitled deck', set, entries: [], updatedAt: null }; }
export function clone(value) { return structuredClone(value); }
export function fingerprint(deck) {
  return JSON.stringify({ name: deck.name, set: deck.set?.code, entries: deck.entries.map(({ card, quantity }) => [card.id, quantity]).sort((a, b) => a[0].localeCompare(b[0])) });
}
export function isDirty(draft, decks) {
  const saved = decks.find(deck => deck.id === draft.id);
  return saved ? fingerprint(draft) !== fingerprint(saved) : draft.entries.length > 0 || draft.name !== 'Untitled deck';
}
export class DeckStorage {
  constructor(storage) { this.storage = storage; this.decks = []; this.draft = emptyDraft(); }
  read() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Array.isArray(parsed.decks) || !validDeck(parsed.draft) || !parsed.decks.every(validDeck)) throw new Error('Saved deck data could not be read. Browser data has been left untouched.');
    this.decks = parsed.decks;
    this.draft = parsed.draft;
  }
  write(draft, decks = this.decks) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, decks, draft }));
    this.decks = clone(decks);
    this.draft = clone(draft);
  }
  save(draft, asNew = false) {
    const now = new Date().toISOString();
    const deck = { ...clone(draft), id: asNew || !draft.id ? crypto.randomUUID() : draft.id, createdAt: asNew ? now : (draft.createdAt || now), updatedAt: now };
    const decks = this.decks.filter(item => item.id !== deck.id);
    decks.unshift(deck);
    this.write(deck, decks);
    return clone(deck);
  }
  rename(id, name, draft) {
    const decks = this.decks.map(deck => deck.id === id ? { ...deck, name, updatedAt: new Date().toISOString() } : deck);
    const next = draft.id === id ? { ...draft, name } : draft;
    this.write(next, decks);
    return clone(next);
  }
  delete(id, draft) {
    const next = draft.id === id ? { ...draft, id: null } : draft;
    this.write(next, this.decks.filter(deck => deck.id !== id));
    return clone(next);
  }
}
function validDeck(deck) {
  return deck && typeof deck.name === 'string' && (!deck.set || (typeof deck.set.code === 'string' && /^[a-z0-9]+$/.test(deck.set.code) && typeof deck.set.name === 'string')) && Array.isArray(deck.entries) && deck.entries.every(entry =>
    entry && Number.isSafeInteger(entry.quantity) && entry.quantity > 0 && entry.card && typeof entry.card.id === 'string' && typeof entry.card.name === 'string' && typeof entry.card.type_line === 'string' && Array.isArray(entry.card.colors) && Number.isFinite(entry.card.cmc));
}
