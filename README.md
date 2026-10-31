# Skeleton — MTG Limited Deck Builder

A static visual workspace for planning Magic: The Gathering Limited decks from any cards in a selected set. No packs, account, build step, or backend required.

## Run locally

From this project directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [the local builder](http://127.0.0.1:8000/). Use an HTTP server rather than opening `index.html` directly: browsers require HTTP for JavaScript modules. Internet access is needed for the Scryfall library and card images; saved deck metadata remains usable when the network is unavailable.

## Build a deck

- Search sets by name or code. The initial selection is the latest released expansion listed by Scryfall.
- Search card names and rules text, or filter by color, type, rarity, and mana value. Sort by color, name, mana value, rarity, or collector number. Press `/` to focus card search.
- Selecting ordinary colors includes cards whose colors fit within that selection. Colorless and Multicolor add their respective categories. With no color selected, all cards are shown.
- **Booster cards only** uses Scryfall’s printing-level `booster` flag, combined across alternate printings of the same card. It does **not** reproduce exact Play Booster collation or add bonus sheets from separate set codes.
- Click a library card or drag it onto the canvas to add a copy. Click a deck card to remove one, or use its plus/minus buttons. Hover or focus to preview; the magnifier opens a persistent preview and supports touch. Use **Other face** to inspect multiface cards; Escape closes previews.
- The canvas groups cards by mana value, with creature and other-spell rows and a land area. Identical cards share a quantity badge. Modal spells with a land back stay in their front-face spell group. Seven or greater shares the final curve column.
- Add any number of the five basic lands with the quick controls. The 40-card target is informational; copies and deck size are unrestricted. The mana curve and average exclude lands and count every copy.
- On smaller screens, switch between **Card library** and **Your deck**. Scroll inside the deck canvas to see every mana-value column and the lower spell/land rows.

## Save and start again

**Save deck** creates or updates a named deck in this browser. **Save as new** creates an independent copy. **Saved decks** lets you open, rename, or delete saved decks.

The current working draft is also persisted after edits, including unsaved changes to an existing saved deck. Switching sets or opening another deck offers Save / Discard / Cancel when the working draft has unsaved changes.

**Clear all** starts an empty, untitled draft in the current set, retaining library filters. Saved decks stay intact. **Undo** restores the cleared draft, including its name and saved association.

Storage is local to this browser and site origin. Clearing browser data, changing browsers/devices, or changing the hosting origin does not carry decks across. There is no cloud sync, account system, or import/export. Images are loaded from Scryfall rather than stored with decks. Local storage failures are shown visibly; a failed write never reports that a deck was saved. Unreadable existing data is left untouched.

## Verification

The application has no runtime dependencies. For data, storage, and network behavior tests, use Node.js 22+:

```sh
npm test
```

An optional Playwright browser suite covers addition/removal, dragging, filters, face previews, keyboard focus, statistics, saves, rename/delete, Clear/Undo, refresh, set-switch protection, canceled requests, offline recovery, storage failures, mobile layouts, and a repository URL prefix. It uses deterministic test fixtures and requires an existing Playwright installation and Chromium:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser.mjs
```

If needed, set `PLAYWRIGHT_BROWSERS_PATH` to an existing browser installation, or `CHROMIUM_PATH` to a Chromium executable. Set `SCREENSHOT_DIR` to an existing directory to capture representative desktop/mobile images. These tools are for development only and are not shipped with the site.

## Deployment

Published with GitHub Pages branch-root publishing from `main`, folder `/(root)`. There is no production build. Publish the static project files; `.nojekyll` bypasses Jekyll. Assets and module imports use relative paths and work under `/mtg-limited-skeleton-builder/` or a custom repository prefix. There are no nested routes or server rewrites.

Repository: [aronsai/mtg-limited-skeleton-builder](https://github.com/aronsai/mtg-limited-skeleton-builder).

Live site: [Skeleton](https://aronsai.github.io/mtg-limited-skeleton-builder/).

To publish updates, commit and push to `main`; GitHub Pages rebuilds the site automatically.

## Implementation

- `index.html` and `styles.css`: responsive workspace, accessible controls, dialogs, and card presentation.
- `app.js`: UI rendering, drag/drop, previews, filtering controls, and deck lifecycle.
- `cards.js`: normalized card data, deduplication, filtering, sorting, classification, and statistics.
- `scryfall.js`: paginated card retrieval, session cache, request pacing, cancellation, and set selection.
- `storage.js`: versioned local storage and atomic saved-deck updates.

Scryfall requests are spaced at least 600 ms apart; filtering and sorting use the loaded set locally. Changing sets cancels stale requests. Set-card caches last for the page session so refreshing can pick up updated card data.

## Attribution

Card data and images are supplied by [Scryfall](https://scryfall.com), using its [public API](https://scryfall.com/docs/api). Magic: The Gathering and card imagery are property of Wizards of the Coast. Skeleton is an unofficial fan project and is not affiliated with Scryfall or Wizards of the Coast.
