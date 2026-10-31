import { BASIC_LANDS, COLORS, COLOR_SYMBOLS, category, colorGroup, deckStats, filterCards, manaBucket } from './cards.js';
import { loadSets, loadSetCards, defaultSet } from './scryfall.js';
import { DeckStorage, clone, emptyDraft, isDirty } from './storage.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeImage = url => { try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : ''; } catch { return ''; } };
const filters = { search: '', colors: new Set(), type: '', rarity: '', mv: '', booster: false, sort: 'color' };
let store, draft, storageReadable = true, persistenceFailed = false;
let sets = [], cards = [], loading = false, loadError = '', controller, loadVersion = 0;
let undoDraft = null, toastTimer, transitionPending = false;
let previewCard = null, previewFace = 0, previewTimer, hideTimer, previewPinned = false, previewAnchor, previewDismissed = false;

function storageWarning(message) {
  persistenceFailed = true;
  $('#storage-warning').textContent = message || 'Browser storage is unavailable or full. Your changes are only in memory; saving has not succeeded.';
  $('#storage-warning').hidden = false;
  renderDraftStatus();
}
try {
  store = new DeckStorage(window.localStorage);
  store.read();
} catch (error) {
  if (!store) store = new DeckStorage({ getItem() { return null; }, setItem() { throw new Error('Browser storage is unavailable.'); } });
  // Do not overwrite unreadable data with a fresh draft.
  storageReadable = false;
  storageWarning(`${error.message} Changes will stay in memory. Existing browser data will not be overwritten.`);
}
draft = clone(store.draft);

function persist() {
  if (!storageReadable) return false;
  try {
    store.write(draft);
    persistenceFailed = false;
    $('#storage-warning').hidden = true;
    return true;
  } catch { storageWarning(); return false; }
}
function notify(message, undo = false) {
  clearTimeout(toastTimer);
  $('#toast-text').textContent = message;
  $('#undo-clear').hidden = !undo;
  $('#toast').hidden = false;
  if (!undo) toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function renderDraftStatus() {
  if (!draft) return;
  const dirty = isDirty(draft, store.decks);
  $('#draft-status').textContent = persistenceFailed ? 'Changes in memory · browser storage unavailable' : draft.id ? (dirty ? 'Unsaved changes · draft kept in this browser' : 'Saved in this browser') : draft.entries.length ? 'Working draft · kept in this browser' : 'A fresh start. Make it yours.';
  $('#draft-status').classList.toggle('unsaved', dirty);
  $('#saved-count').textContent = store.decks.length;
}
function changed() {
  draft.updatedAt = new Date().toISOString();
  persist();
  renderDeck();
  updateListQuantities();
}
function quantity(id) { return draft.entries.find(entry => entry.card.id === id)?.quantity || 0; }
function lookup(id) { return cards.find(card => card.id === id) || draft.entries.find(entry => entry.card.id === id)?.card || BASIC_LANDS.find(card => card.id === id); }
function changeQuantity(card, delta) {
  if (!card) return;
  if (!draft.set) { notify('Choose a set before adding cards.'); return; }
  const entry = draft.entries.find(entry => entry.card.id === card.id);
  if (entry) {
    entry.quantity += delta;
    if (entry.quantity <= 0) draft.entries = draft.entries.filter(item => item !== entry);
  } else if (delta > 0) draft.entries.push({ card: clone(card), quantity: delta });
  changed();
}
function manaMarkup(cost) {
  return [...(cost || '').matchAll(/\{([^}]+)\}/g)].map(([, token]) => {
    const color = COLORS.includes(token) ? token.toLowerCase() : 'c';
    return `<span class="mana-symbol color-${color}" title="${escape(token)}">${escape(COLOR_SYMBOLS[token] || token)}</span>`;
  }).join('');
}
function rowMarkup(card) {
  const q = quantity(card.id), color = colorGroup(card).toLowerCase();
  return `<div class="card-row accent-${color}" data-card="${escape(card.id)}" draggable="true">
    <button class="row-add" aria-label="Add ${escape(card.name)}">
      ${safeImage(card.art) ? `<img class="row-art" src="${escape(safeImage(card.art))}" alt="" loading="lazy">` : ''}
      <span class="row-details"><span class="card-name">${escape(card.name)}</span><span class="card-type"><i class="rarity-dot rarity-${escape(card.rarity)}" title="${escape(card.rarity)}"></i>${escape(card.type_line)}</span></span><span class="row-mana">${manaMarkup(card.mana_cost)}</span>
    </button><span class="row-quantity ${q ? 'has-copies' : ''}" data-quantity="${escape(card.id)}">${q ? `×${q}` : '+'}</span><button class="inspect-card" aria-label="Preview ${escape(card.name)}" title="Preview card">⌕</button>
  </div>`;
}
function renderList() {
  hidePreview();
  $('#card-list').setAttribute('aria-busy', loading);
  if (loading) {
    $('#card-list').innerHTML = '<div class="list-message"><span class="loader"></span><h3>Opening the card library</h3><p>Gathering cards from Scryfall…</p></div>';
    return;
  }
  if (loadError) {
    $('#results-count').textContent = 'Unable to load cards';
    $('#card-list').innerHTML = `<div class="list-message"><span class="message-icon">◇</span><h3>A little interruption.</h3><p>${escape(loadError)}</p><button class="button secondary" id="retry-load">Try again ↻</button></div>`;
    return;
  }
  const visible = filterCards(cards, filters);
  $('#results-count').textContent = `${visible.length} of ${cards.length} cards`;
  $('#card-list').innerHTML = visible.length ? visible.map(rowMarkup).join('') : `<div class="list-message"><span class="message-icon">⌕</span><h3>${cards.length ? 'No cards match.' : 'No cards in this set.'}</h3><p>${cards.length ? 'Try another search or loosen your filters.' : 'Choose another set to explore.'}</p>${cards.length ? '<button class="button secondary" id="empty-reset">Reset filters</button>' : ''}</div>`;
}
function updateListQuantities() {
  for (const node of document.querySelectorAll('[data-quantity]')) {
    const q = quantity(node.dataset.quantity);
    node.textContent = q ? `×${q}` : '+';
    node.classList.toggle('has-copies', q > 0);
  }
}
function deckCardMarkup({ card, quantity }) {
  const color = (card.basicColor || colorGroup(card)).toLowerCase();
  const image = safeImage(card.image);
  return `<div class="deck-card accent-${color}" data-card="${escape(card.id)}">
    <button class="deck-card-main" aria-label="Remove one ${escape(card.name)}" title="${escape(card.name)} · Click to remove one">
      ${image ? `<img src="${escape(image)}" alt="${escape(card.name)}" loading="lazy">` : ''}<span class="card-fallback color-${color}"><span>${escape(card.name)}</span><b>${escape(COLOR_SYMBOLS[card.basicColor] || '◇')}</b><small>${escape(card.type_line)}</small></span>
    </button>
    <span class="deck-quantity">×${quantity}</span><div class="deck-card-controls"><button data-action="minus" aria-label="Decrease ${escape(card.name)}">−</button><button data-action="plus" aria-label="Increase ${escape(card.name)}">+</button><button data-action="inspect" aria-label="Preview ${escape(card.name)}">⌕</button></div>
  </div>`;
}
function renderDeck() {
  // Preserve keyboard focus through quantity changes without moving pointer focus.
  const focused = document.activeElement?.closest('.deck-card');
  const focusedId = focused?.dataset.card;
  const focusedAction = document.activeElement?.dataset.action;
  const wasMain = document.activeElement?.classList.contains('deck-card-main');
  if (document.activeElement !== $('#deck-name')) $('#deck-name').value = draft.name;
  $('#deck-set').textContent = draft.set?.code.toUpperCase() || 'NO SET';
  const stats = deckStats(draft.entries);
  for (const [id, value] of Object.entries({ 'total-count': stats.total, 'mobile-count': stats.total, 'creature-count': stats.creatures, 'spell-count': stats.spells, 'land-count': stats.lands })) $(`#${id}`).textContent = value;
  $('#target-fill').style.width = `${Math.min(100, stats.total / 40 * 100)}%`;
  $('#target-status').textContent = stats.total >= 40 ? (stats.total === 40 ? 'FORTY. READY TO EXPLORE.' : `${stats.total - 40} ABOVE TARGET`) : 'CARDS IN DECK';
  $('#average-mv').textContent = `${stats.average.toFixed(1)} avg.`;
  const max = Math.max(1, ...stats.curve);
  $('#mana-curve').innerHTML = stats.curve.map((count, i) => `<div class="curve-column" aria-label="Mana value ${i === 7 ? '7 or more' : i}: ${count} cards"><span class="curve-value">${count || ''}</span><div class="curve-bar-track"><i style="height:${count / max * 100}%"></i></div><span class="curve-number">${i === 7 ? '7+' : i}</span></div>`).join('');
  $('#empty-deck').hidden = stats.total > 0;
  $('#deck-stacks').hidden = stats.total === 0;
  if (stats.total) {
    let html = '<div class="mana-headings">' + Array.from({ length: 8 }, (_, i) => `<div><span>${i === 7 ? '7+' : i}</span></div>`).join('') + '</div>';
    for (const [type, title] of [['creatures', 'CREATURES'], ['spells', 'OTHER SPELLS']]) {
      html += `<div class="stack-section-label">${title} <span>${stats[type]}</span></div><div class="stack-grid">`;
      for (let i = 0; i < 8; i++) {
        const entries = draft.entries.filter(entry => category(entry.card) === type && manaBucket(entry.card) === i).sort((a, b) => a.card.name.localeCompare(b.card.name));
        html += `<div class="card-stack ${entries.length ? '' : 'empty-stack'}">${entries.map(deckCardMarkup).join('')}</div>`;
      }
      html += '</div>';
    }
    const lands = draft.entries.filter(entry => category(entry.card) === 'lands').sort((a, b) => a.card.name.localeCompare(b.card.name));
    html += `<div class="stack-section-label">LANDS <span>${stats.lands}</span></div><div class="land-grid">${lands.map(deckCardMarkup).join('') || '<span class="no-lands">Make room for your mana base.</span>'}</div>`;
    $('#deck-stacks').innerHTML = html;
  } else $('#deck-stacks').replaceChildren();
  if (focusedId) {
    const same = $(`#deck-stacks [data-card="${CSS.escape(focusedId)}"]`);
    const target = same?.querySelector(wasMain ? '.deck-card-main' : `[data-action="${focusedAction}"]`);
    if (target) target.focus({ preventScroll: true });
    else $('#clear-deck').focus({ preventScroll: true });
  }
  $('#clear-deck').disabled = !draft.entries.length && !draft.id && draft.name === 'Untitled deck';
  $('#save-deck').disabled = !draft.set;
  $('#save-as').disabled = !draft.set;
  for (const button of document.querySelectorAll('[data-basic]')) button.disabled = !draft.set;
  renderDraftStatus();
}
function resetFilters() {
  Object.assign(filters, { search: '', colors: new Set(), type: '', rarity: '', mv: '', booster: false, sort: 'color' });
  for (const id of ['card-search', 'type-filter', 'rarity-filter', 'mv-filter']) $(`#${id}`).value = '';
  $('#booster-filter').checked = false;
  $('#sort').value = 'color';
  for (const button of document.querySelectorAll('[data-color]')) button.setAttribute('aria-pressed', 'false');
  renderList();
}
function setSummary(set) { return { code: set.code, name: set.name, released_at: set.released_at }; }
function updateSetInput() { $('#set-search').value = draft.set ? `${draft.set.name} (${draft.set.code.toUpperCase()})` : ''; }
function closeSetOptions() { $('#set-options').hidden = true; $('#set-search').setAttribute('aria-expanded', 'false'); }
function renderSetOptions(query = '') {
  const value = query.toLowerCase().trim();
  const matches = sets.filter(set => `${set.name} ${set.code}`.toLowerCase().includes(value));
  $('#set-options').innerHTML = matches.length ? matches.slice(0, 100).map(set => `<button class="set-option" data-set="${escape(set.code)}"><span>${escape(set.name)}<small>${escape(set.released_at || '')}</small></span><b>${escape(set.code.toUpperCase())}</b></button>`).join('') + (matches.length > 100 ? '<p class="set-options-note">Type to narrow down more sets.</p>' : '') : '<p class="set-options-note">No matching sets.</p>';
  $('#set-options').hidden = false;
  $('#set-search').setAttribute('aria-expanded', 'true');
}
async function fetchCards() {
  controller?.abort();
  const version = ++loadVersion;
  cards = [];
  loading = Boolean(draft.set);
  loadError = '';
  if (!draft.set) { renderList(); return; }
  controller = new AbortController();
  const signal = controller.signal;
  $('#results-count').textContent = 'Loading cards…';
  renderList();
  try {
    const result = await loadSetCards(draft.set.code, { signal, onProgress: (loaded, total) => {
      if (version === loadVersion) $('#results-count').textContent = `Loading ${loaded} / ${total} printings…`;
    } });
    if (version !== loadVersion) return;
    cards = result;
  } catch (error) {
    if (error.name === 'AbortError' || version !== loadVersion) return;
    loadError = error.message.includes('fetch') ? 'Could not reach Scryfall. Check your connection and try again.' : error.message;
  } finally {
    if (version === loadVersion) { loading = false; renderList(); }
  }
}
async function fetchSets() {
  try {
    sets = await loadSets();
    if (!draft.set) {
      const set = defaultSet(sets);
      if (!set) throw new Error('Scryfall returned no available sets.');
      draft.set = setSummary(set);
      updateSetInput(); persist(); renderDeck();
      await fetchCards();
    }
  } catch (error) {
    if (!draft.set) { loading = false; loadError = error.message; renderList(); }
    else notify('Set search could not load. Click the set field to retry. Your deck is available.');
  }
}
async function chooseSet(code) {
  closeSetOptions();
  const set = sets.find(set => set.code === code);
  if (!set || transitionPending) return;
  if (set.code === draft.set?.code) { updateSetInput(); return; }
  transitionPending = true;
  try {
    if (!await protectDraft()) { updateSetInput(); return; }
    undoDraft = null; $('#toast').hidden = true;
    draft = emptyDraft(setSummary(set));
    updateSetInput(); persist(); renderDeck();
    void fetchCards();
  } finally { transitionPending = false; }
}
function choice({ title, description, buttons, input = null }) {
  hidePreview();
  const dialog = $('#choice-dialog');
  $('#choice-title').textContent = title;
  $('#choice-description').textContent = description;
  $('#choice-input').hidden = input === null;
  $('#choice-input-label').hidden = input === null;
  $('#choice-input').required = input !== null;
  $('#choice-input').value = input || '';
  $('#choice-actions').innerHTML = buttons.map(({ value, label, primary, danger }) => `<button class="button ${primary ? 'primary' : danger ? 'danger' : 'secondary'}" value="${escape(value)}" ${value === 'cancel' ? 'formnovalidate' : ''}>${escape(label)}</button>`).join('');
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve({ value: dialog.returnValue, input: $('#choice-input').value.trim() }), { once: true });
    dialog.showModal();
    if (input !== null) { $('#choice-input').focus(); $('#choice-input').select(); }
  });
}
async function saveDeck(asNew = false) {
  if (!draft.set) return false;
  if (!storageReadable) { notify('Saving is unavailable. See the browser-storage notice.'); return false; }
  if (asNew || draft.name === 'Untitled deck' || !draft.name.trim()) {
    const result = await choice({ title: asNew ? 'Save a new possibility' : 'Give your deck a name', description: 'Save this deck in the current browser.', input: asNew && draft.name !== 'Untitled deck' ? `${draft.name} — copy`.slice(0, 80) : draft.name === 'Untitled deck' ? '' : draft.name, buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'save', label: 'Save deck', primary: true }] });
    if (result.value !== 'save' || !result.input) return false;
    draft.name = result.input;
    $('#deck-name').value = draft.name;
  }
  try {
    draft = store.save(draft, asNew);
    persistenceFailed = false; $('#storage-warning').hidden = true;
    renderDeck(); notify('Deck saved in this browser.');
    return true;
  } catch { storageWarning(); return false; }
}
async function protectDraft() {
  if (!isDirty(draft, store.decks)) return true;
  const result = await choice({ title: 'Keep this possibility?', description: 'This deck has unsaved changes. Save it before moving on, or discard this working draft.', buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'discard', label: 'Discard' }, { value: 'save', label: 'Save deck', primary: true }] });
  if (result.value === 'save') return saveDeck();
  return result.value === 'discard';
}
function renderSavedDecks() {
  $('#saved-decks-list').innerHTML = store.decks.length ? store.decks.map(deck => {
    const stats = deckStats(deck.entries);
    return `<article class="saved-deck"><div class="saved-deck-art"><span>◇</span></div><div class="saved-deck-details"><h3>${escape(deck.name)}</h3><p>${escape(deck.set?.name || 'No set')} · ${stats.total} cards</p><small>Saved ${escape(new Date(deck.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</small><div class="saved-deck-actions"><button class="text-button" data-rename="${escape(deck.id)}">Rename</button><button class="text-button delete-link" data-delete="${escape(deck.id)}">Delete</button></div></div><button class="button secondary" data-open="${escape(deck.id)}">Open ↗</button></article>`;
  }).join('') : '<div class="saved-empty"><span>▱</span><h3>Your next deck belongs here.</h3><p>Build something you like, then hit Save deck.</p></div>';
  $('#saved-count').textContent = store.decks.length;
}
async function savedAction(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const id = button.dataset.open || button.dataset.rename || button.dataset.delete;
  if (!id) return;
  const deck = store.decks.find(deck => deck.id === id);
  if (!deck) return;
  $('#decks-dialog').close();
  if (button.dataset.open) {
    if (!await protectDraft()) { $('#decks-dialog').showModal(); return; }
    draft = clone(deck); undoDraft = null; $('#toast').hidden = true;
    updateSetInput(); persist(); renderDeck();
    void fetchCards();
    return;
  }
  if (button.dataset.rename) {
    const result = await choice({ title: 'Rename deck', description: 'A new name for this idea.', input: deck.name, buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'rename', label: 'Rename', primary: true }] });
    if (result.value === 'rename' && result.input) {
      try { draft = store.rename(id, result.input, draft); renderDeck(); notify('Deck renamed.'); }
      catch { storageWarning(); }
    }
  }
  if (button.dataset.delete) {
    const result = await choice({ title: 'Delete saved deck?', description: `Delete “${deck.name}” from this browser? An open working draft will stay on the canvas.`, buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'delete', label: 'Delete deck', danger: true }] });
    if (result.value === 'delete') {
      try { draft = store.delete(id, draft); renderDeck(); notify('Saved deck deleted.'); }
      catch { storageWarning(); }
    }
  }
  renderSavedDecks(); $('#decks-dialog').showModal();
}

function hidePreview() {
  clearTimeout(previewTimer); clearTimeout(hideTimer);
  $('#card-preview').hidden = true;
  previewCard = null; previewPinned = false; previewDismissed = true;
}
function settlePreview() {
  if (previewDismissed) return;
  const focusedRow = document.activeElement?.closest('.card-row, .deck-card');
  if (focusedRow) {
    if (previewCard?.id !== focusedRow.dataset.card) showPreview(lookup(focusedRow.dataset.card), focusedRow);
    return;
  }
  if ($('#card-preview').contains(document.activeElement)) return;
  hidePreview();
}
function positionPreview(anchor) {
  const rect = anchor.getBoundingClientRect();
  const panel = $('#card-preview');
  const width = Math.min(280, innerWidth - 24);
  const left = rect.right + width + 24 < innerWidth ? rect.right + 12 : Math.max(12, rect.left - width - 12);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.min(left, innerWidth - width - 12)}px`;
  panel.style.top = `${Math.max(12, Math.min(rect.top, innerHeight - panel.offsetHeight - 12))}px`;
}
function renderPreview() {
  if (!previewCard) return;
  const card = previewCard;
  const face = card.faces?.[previewFace];
  const image = safeImage(face?.image || card.image);
  $('#preview-name').textContent = face?.name || card.name;
  $('#preview-text').textContent = face?.oracle_text || card.oracle_text;
  $('#preview-image').hidden = !image;
  $('#preview-fallback').hidden = Boolean(image);
  $('#preview-fallback').textContent = `${face?.name || card.name}\n\n${face?.type_line || card.type_line}`;
  $('#preview-image').alt = face?.name || card.name;
  if (image) $('#preview-image').src = image;
  else $('#preview-image').removeAttribute('src');
  $('#flip-preview').hidden = !(card.faces?.length > 1);
  $('#card-preview').hidden = false;
  positionPreview(previewAnchor);
}
function showPreview(card, anchor, pinned = false) {
  if (!card) return;
  clearTimeout(hideTimer); clearTimeout(previewTimer);
  previewCard = card; previewFace = 0; previewPinned = pinned; previewAnchor = anchor; previewDismissed = false;
  renderPreview();
}
function schedulePreview(event) {
  const row = event.target.closest('.card-row, .deck-card');
  if (!row || (event.relatedTarget && row.contains(event.relatedTarget)) || previewPinned) return;
  clearTimeout(hideTimer); clearTimeout(previewTimer);
  previewDismissed = false;
  previewTimer = setTimeout(() => showPreview(lookup(row.dataset.card), row), 280);
}
function leavePreview(event) {
  const row = event.target.closest('.card-row, .deck-card');
  if (!row || (event.relatedTarget && row.contains(event.relatedTarget)) || previewPinned) return;
  clearTimeout(previewTimer);
  hideTimer = setTimeout(settlePreview, 250);
}

$('#card-search').addEventListener('input', event => { filters.search = event.target.value; renderList(); });
for (const [id, key] of [['type-filter', 'type'], ['rarity-filter', 'rarity'], ['mv-filter', 'mv'], ['sort', 'sort']]) $(`#${id}`).addEventListener('change', event => { filters[key] = event.target.value; renderList(); });
$('#booster-filter').addEventListener('change', event => { filters.booster = event.target.checked; renderList(); });
$('#color-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-color]');
  if (!button) return;
  const color = button.dataset.color;
  if (filters.colors.has(color)) filters.colors.delete(color); else filters.colors.add(color);
  button.setAttribute('aria-pressed', filters.colors.has(color)); renderList();
});
$('#reset-filters').addEventListener('click', resetFilters);
$('#set-search').addEventListener('focus', () => { if (!sets.length) void fetchSets(); renderSetOptions(); });
$('#set-search').addEventListener('input', event => renderSetOptions(event.target.value));
$('#set-search').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); $('#set-options button')?.focus(); }
  if (event.key === 'Escape') { closeSetOptions(); updateSetInput(); }
  if (event.key === 'Enter') { event.preventDefault(); const first = $('#set-options button'); if (first) void chooseSet(first.dataset.set); }
});
$('#set-options').addEventListener('keydown', event => {
  const buttons = [...$('#set-options').querySelectorAll('button')];
  const i = buttons.indexOf(document.activeElement);
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); buttons[(i + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
  if (event.key === 'Escape') { closeSetOptions(); $('#set-search').focus(); closeSetOptions(); updateSetInput(); }
});
$('#set-options').addEventListener('click', event => { const button = event.target.closest('[data-set]'); if (button) void chooseSet(button.dataset.set); });
document.addEventListener('click', event => {
  if (!event.target.closest('.set-picker')) { closeSetOptions(); updateSetInput(); }
  if (previewPinned && !event.target.closest('.card-preview, .inspect-card, [data-action="inspect"]')) hidePreview();
});
$('#card-list').addEventListener('click', event => {
  if (event.target.closest('#retry-load')) { if (!draft.set) void fetchSets(); else void fetchCards(); return; }
  if (event.target.closest('#empty-reset')) { resetFilters(); return; }
  const row = event.target.closest('[data-card]'); if (!row) return;
  const card = lookup(row.dataset.card);
  if (event.target.closest('.inspect-card')) showPreview(card, row, true);
  else changeQuantity(card, 1);
});
$('#card-list').addEventListener('dragstart', event => {
  const row = event.target.closest('[data-card]'); if (!row) return;
  hidePreview(); event.dataTransfer.setData('application/x-skeleton-card', row.dataset.card); event.dataTransfer.effectAllowed = 'copy';
  $('#deck-canvas').classList.add('drag-ready');
});
$('#card-list').addEventListener('dragend', () => $('#deck-canvas').classList.remove('drag-ready', 'drag-over'));
$('#deck-canvas').addEventListener('dragover', event => {
  if (event.dataTransfer.types.includes('application/x-skeleton-card')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; $('#deck-canvas').classList.add('drag-over'); }
});
$('#deck-canvas').addEventListener('dragleave', event => { if (!$('#deck-canvas').contains(event.relatedTarget)) $('#deck-canvas').classList.remove('drag-over'); });
$('#deck-canvas').addEventListener('drop', event => {
  event.preventDefault(); $('#deck-canvas').classList.remove('drag-ready', 'drag-over');
  const card = cards.find(card => card.id === event.dataTransfer.getData('application/x-skeleton-card'));
  if (card) changeQuantity(card, 1);
});
$('#deck-stacks').addEventListener('click', event => {
  const row = event.target.closest('[data-card]'); if (!row) return;
  const button = event.target.closest('button'); if (!button) return;
  const card = lookup(row.dataset.card);
  if (button.dataset.action === 'inspect') showPreview(card, row, true);
  else changeQuantity(card, button.dataset.action === 'plus' ? 1 : -1);
});
for (const target of [$('#card-list'), $('#deck-stacks')]) {
  target.addEventListener('mouseover', schedulePreview); target.addEventListener('mouseout', leavePreview);
  target.addEventListener('focusin', schedulePreview);
  target.addEventListener('focusout', leavePreview);
}
$('#card-preview').addEventListener('mouseenter', () => { clearTimeout(hideTimer); });
$('#card-preview').addEventListener('mouseleave', () => { if (!previewPinned) hideTimer = setTimeout(settlePreview, 200); });
$('#card-preview').addEventListener('focusin', () => clearTimeout(hideTimer));
$('#card-preview').addEventListener('focusout', event => { if (!$('#card-preview').contains(event.relatedTarget) && !previewPinned) hidePreview(); });
$('#close-preview').addEventListener('click', hidePreview);
$('#flip-preview').addEventListener('click', () => { if (previewCard) { previewFace = (previewFace + 1) % previewCard.faces.length; renderPreview(); } });
$('#preview-image').addEventListener('load', () => { if (previewCard) positionPreview(previewAnchor); });
$('#preview-image').addEventListener('error', () => { $('#preview-image').hidden = true; $('#preview-fallback').hidden = false; });
document.addEventListener('error', event => { if (event.target.matches?.('.deck-card img, .row-art')) event.target.hidden = true; }, true);
function hideScrolledPreview() {
  if (previewPinned) return;
  // Focusing a row can scroll it into view. Keep its pending keyboard preview.
  $('#card-preview').hidden = true;
  previewCard = null;
  clearTimeout(hideTimer);
}
$('#card-list').addEventListener('scroll', hideScrolledPreview);
$('#deck-canvas').addEventListener('scroll', hideScrolledPreview);
window.addEventListener('resize', hidePreview);

$('#basic-lands').innerHTML = BASIC_LANDS.map(card => `<button data-basic="${card.basicColor}" class="basic-land-button" aria-label="Add ${card.name}" title="Add ${card.name}"><span class="mana color-${card.basicColor.toLowerCase()}">${COLOR_SYMBOLS[card.basicColor]}</span><span class="basic-name">${card.name}</span><span class="basic-plus">+</span></button>`).join('');
$('#basic-lands').addEventListener('click', event => {
  const button = event.target.closest('[data-basic]'); if (!button) return;
  const fallback = BASIC_LANDS.find(card => card.basicColor === button.dataset.basic);
  const card = cards.find(card => card.name === fallback.name && card.type_line.includes('Basic Land')) || draft.entries.find(entry => entry.card.name === fallback.name)?.card || fallback;
  changeQuantity(card, 1);
});
$('#deck-name').addEventListener('input', event => { draft.name = event.target.value; persist(); renderDraftStatus(); });
$('#deck-name').addEventListener('blur', () => { draft.name = draft.name.trim() || 'Untitled deck'; $('#deck-name').value = draft.name; persist(); renderDraftStatus(); });
$('#save-deck').addEventListener('click', () => void saveDeck());
$('#save-as').addEventListener('click', () => void saveDeck(true));
$('#clear-deck').addEventListener('click', () => {
  undoDraft = clone(draft); draft = emptyDraft(draft.set); hidePreview(); persist(); renderDeck(); updateListQuantities();
  notify('Canvas cleared. A new possibility awaits.', true);
});
$('#undo-clear').addEventListener('click', () => {
  if (!undoDraft) return;
  draft = undoDraft; undoDraft = null; persist(); renderDeck(); updateListQuantities(); notify('Deck restored.');
});
$('#dismiss-toast').addEventListener('click', () => { $('#toast').hidden = true; });
$('#open-decks').addEventListener('click', () => { hidePreview(); renderSavedDecks(); $('#decks-dialog').showModal(); });
$('[data-close-dialog]').addEventListener('click', () => $('#decks-dialog').close());
$('#saved-decks-list').addEventListener('click', event => void savedAction(event));
for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => {
  hidePreview(); $('.workspace').dataset.view = tab.dataset.tab;
  for (const button of document.querySelectorAll('[data-tab]')) { button.classList.toggle('active', button === tab); button.setAttribute('aria-pressed', button === tab); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { hidePreview(); closeSetOptions(); }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) && !document.querySelector('dialog[open]')) {
    event.preventDefault(); $('[data-tab="cards"]').click(); $('#card-search').focus();
  }
});
window.addEventListener('beforeunload', event => { if (persistenceFailed && isDirty(draft, store.decks)) { event.preventDefault(); event.returnValue = ''; } });

updateSetInput(); renderDeck();
if (draft.set) void fetchCards();
else { loading = true; renderList(); }
void fetchSets();
