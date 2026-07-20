# Palette Type-Stacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded 15-button block palette with 5 category buttons, each opening a vertical stack of that type's blocks on hover (desktop) or tap (touch).

**Architecture:** A pure `blockCategories.js` derives each block's group from its flags and buckets `BLOCK_LIST` into ordered groups. `palette.js` renders one category button per group (emoji + colour swatch) with an absolutely-positioned stack above it, revealed by CSS `:hover` (desktop) or an `.vx-open` class toggled on tap (touch). Public API unchanged.

**Tech Stack:** Vanilla ES modules, DOM (inline styles + one injected `<style>` for the hover rule). Node-runnable `.mjs` tests for the pure grouping logic (no DOM). The DOM itself is browser-verified via `npm run build`.

## Global Constraints

- Plain JS, readable for a 9-year-old; comment new pieces.
- Grouping is **derived from block flags** — no per-block `category` field, no `blocks.js` changes.
- `createPalette()` keeps its exact public API: returns `{ el, getSelectedId(), setSelectedId(id) }`; `main.js`/editor untouched.
- 48px minimum touch targets; taps inside the palette must not fall through to the 3D canvas (`pointerdown` `stopPropagation`).
- Categories, in order: 🧱 Terrain, 💧 Water, ⚙️ Machines, 🪙 Pickups, 🚩 Markers (+ a `misc` bucket rendered only if non-empty).
- Node tests run from the repo root: `node test/<name>.test.mjs`, print `N passed, M failed`, exit non-zero on failure.

---

### Task 1: Pure grouping module + tests

**Files:**
- Create: `src/edit/blockCategories.js`
- Test: `test/palette-categories.test.mjs`

**Interfaces:**
- Produces: `CATEGORIES` (ordered `{key,icon,label}` list), `categoryOf(def) -> string`, `groupBlocks(list) -> [{ key, icon, label, blocks: [...] }]` (non-empty groups only, in CATEGORIES order, registry order within a group).

- [ ] **Step 1: Write the failing test** — `test/palette-categories.test.mjs`

```js
import { BLOCKS, BLOCK_LIST } from '../src/blocks.js';
import { categoryOf, groupBlocks, CATEGORIES } from '../src/edit/blockCategories.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const cat = (key, want) => ok(categoryOf(BLOCKS[key]) === want, `${key} → ${want} (got ${categoryOf(BLOCKS[key])})`);
cat('solid', 'terrain'); cat('brick', 'terrain');
cat('hazard', 'water');
cat('coin', 'pickups'); cat('scuba', 'pickups'); cat('glider', 'pickups');
cat('motorSlow', 'machines'); cat('motorFast', 'machines'); cat('blade', 'machines');
cat('board', 'machines'); cat('motorLinearSlow', 'machines'); cat('motorLinearFast', 'machines'); cat('shaft', 'machines');
cat('start', 'markers'); cat('goal', 'markers');
ok(categoryOf({}) === 'misc', 'flagless stub → misc');

ok(CATEGORIES[0].key === 'terrain' && CATEGORIES.find((c) => c.key === 'machines').icon === '⚙️', 'CATEGORIES ordered + iconned');

const groups = groupBlocks(BLOCK_LIST);
ok(groups.map((g) => g.key).join(',') === 'terrain,water,machines,pickups,markers', `five groups in order (got ${groups.map((g) => g.key).join(',')})`);
ok(groups.reduce((n, g) => n + g.blocks.length, 0) === BLOCK_LIST.length, 'every block appears exactly once');
const machines = groups.find((g) => g.key === 'machines').blocks.map((b) => b.key);
ok(JSON.stringify(machines) === JSON.stringify(['motorSlow', 'motorFast', 'blade', 'board', 'motorLinearSlow', 'motorLinearFast', 'shaft']), 'registry order preserved within a group');
ok(groups.every((g) => g.blocks.length > 0), 'no empty groups rendered');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node test/palette-categories.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the module** — `src/edit/blockCategories.js`

```js
// edit/blockCategories.js — groups blocks into palette categories, derived from
// the flags each block already declares (so a new block auto-sorts in, and
// blocks.js needs no per-block category field).

export const CATEGORIES = [
  { key: 'terrain', icon: '🧱', label: 'Terrain' },
  { key: 'water', icon: '💧', label: 'Water' },
  { key: 'machines', icon: '⚙️', label: 'Machines' },
  { key: 'pickups', icon: '🪙', label: 'Pickups' },
  { key: 'markers', icon: '🚩', label: 'Markers' },
  { key: 'misc', icon: '❓', label: 'Other' }, // fallback bucket (only shown if used)
];

// Which category a block belongs to. First match wins — machines is checked
// before terrain because motor ARMS (blade/board) are also `solid`.
export function categoryOf(def) {
  if (def.motor || def.arm || def.shaft) return 'machines';
  if (def.collect || def.wear) return 'pickups';
  if (def.unique || def.wins) return 'markers';
  if (def.flow) return 'water';
  if (def.solid) return 'terrain';
  return 'misc';
}

// Bucket `list` (in registry order) into the CATEGORIES order, dropping empties.
export function groupBlocks(list) {
  return CATEGORIES
    .map((cat) => ({ ...cat, blocks: list.filter((def) => categoryOf(def) === cat.key) }))
    .filter((g) => g.blocks.length > 0);
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `node test/palette-categories.test.mjs`
Expected: `20 passed, 0 failed` (count is approximate — all `ok`s pass).

- [ ] **Step 5: Commit**

```bash
git add src/edit/blockCategories.js test/palette-categories.test.mjs
git commit -m "Palette: derive block categories from flags (pure, tested)"
```

---

### Task 2: Rewrite the palette DOM into category buttons + stacks

**Files:**
- Rewrite: `src/edit/palette.js`
- Test: none new (DOM/hover/tap is browser-verified); `npm run build` must pass.

**Interfaces:**
- Consumes: `groupBlocks` from `blockCategories.js` (Task 1), `BLOCK_LIST` from `blocks.js`.
- Produces: `createPalette()` returning `{ el, getSelectedId(), setSelectedId(id) }` — same as before.

- [ ] **Step 1: Replace `src/edit/palette.js` entirely** with:

```js
// edit/palette.js — the block picker. One compact button per block CATEGORY;
// hovering (desktop) or tapping (touch) a category opens a vertical stack of its
// blocks. Built from the BLOCKS registry (via blockCategories), so a new block
// shows up in its group for free. Big touch targets (>= 48px) for the tablets.

import { BLOCK_LIST } from '../blocks.js';
import { groupBlocks } from './blockCategories.js';

// Friendly labels for the block buttons (falls back to the key if not listed).
const LABELS = {
  solid: 'Grass', brick: 'Brick', hazard: 'Water', coin: 'Coin',
  motorSlow: 'Slow Motor', motorFast: 'Fast Motor', blade: 'Blade', board: 'Board',
  motorLinearSlow: 'Slow Slider', motorLinearFast: 'Fast Slider', shaft: 'Shaft',
  scuba: 'Scuba Kit', glider: 'Glider', start: 'Start', goal: 'Goal',
};

const hex = (color) => '#' + color.toString(16).padStart(6, '0');
const textOn = (color) => (color < 0x888888 ? '#fff' : '#111');

// One-time <style> for the hover/tap reveal (can't do :hover with inline styles).
function ensureStyle() {
  if (document.getElementById('vx-palette-style')) return;
  const s = document.createElement('style');
  s.id = 'vx-palette-style';
  s.textContent = `
    .vx-cat { position: relative; }
    .vx-stack {
      position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%);
      display: none; flex-direction: column; gap: 6px; padding: 6px;
      background: rgba(0,0,0,0.6); border-radius: 10px;
    }
    .vx-cat:hover > .vx-stack, .vx-cat.vx-open > .vx-stack { display: flex; }
  `;
  document.head.appendChild(s);
}

export function createPalette() {
  ensureStyle();
  const byId = new Map(BLOCK_LIST.map((def) => [def.id, def]));
  let selectedId = BLOCK_LIST[0].id;
  const groups = groupBlocks(BLOCK_LIST);
  const remembered = new Map(); // groupKey -> last-picked block id (default: first)

  const bar = document.createElement('div');
  bar.id = 'palette';
  Object.assign(bar.style, {
    position: 'fixed', left: '50%', bottom: '10px', transform: 'translateX(-50%)',
    display: 'flex', gap: '6px', padding: '6px', background: 'rgba(0,0,0,0.45)',
    borderRadius: '10px', maxWidth: '96vw', zIndex: '10',
  });
  // A tap anywhere in the palette must not fall through to the 3D canvas.
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());

  const cats = []; // { key, container, catBtn, blockBtns: Map<id, btn> }

  function closeAll() {
    for (const c of cats) c.container.classList.remove('vx-open');
  }

  function pick(id, groupKey) {
    selectedId = id;
    remembered.set(groupKey, id);
    closeAll();
    refresh();
  }

  for (const g of groups) {
    remembered.set(g.key, g.blocks[0].id);

    const container = document.createElement('div');
    container.className = 'vx-cat';
    container.style.flex = '0 0 auto';

    const catBtn = document.createElement('button');
    catBtn.textContent = g.icon;
    Object.assign(catBtn.style, {
      minWidth: '48px', minHeight: '48px', border: 'none', borderRadius: '8px',
      font: '600 20px system-ui, sans-serif', cursor: 'pointer',
      outline: '3px solid transparent',
    });
    catBtn.title = g.label;

    const stack = document.createElement('div');
    stack.className = 'vx-stack';

    const blockBtns = new Map();
    for (const def of g.blocks) {
      const btn = document.createElement('button');
      btn.textContent = LABELS[def.key] || def.key;
      Object.assign(btn.style, {
        minWidth: '48px', minHeight: '48px', padding: '4px 8px', border: 'none',
        borderRadius: '8px', background: hex(def.color), color: textOn(def.color),
        font: '600 12px system-ui, sans-serif', cursor: 'pointer',
        outline: '3px solid transparent', whiteSpace: 'nowrap',
      });
      btn.addEventListener('click', () => pick(def.id, g.key));
      blockBtns.set(def.id, btn);
      stack.appendChild(btn);
    }

    // Single-block group: the category button IS the block (no popup).
    if (g.blocks.length === 1) {
      catBtn.addEventListener('click', () => pick(g.blocks[0].id, g.key));
    } else {
      catBtn.addEventListener('click', () => {
        const wasOpen = container.classList.contains('vx-open');
        closeAll();
        if (!wasOpen) container.classList.add('vx-open'); // tap-to-open on touch
      });
      container.appendChild(stack);
    }

    container.appendChild(catBtn);
    bar.appendChild(container);
    cats.push({ key: g.key, container, catBtn, blockBtns, blocks: g.blocks });
  }

  function refresh() {
    for (const c of cats) {
      const pickDef = byId.get(remembered.get(c.key));
      c.catBtn.style.background = hex(pickDef.color);
      c.catBtn.style.color = textOn(pickDef.color);
      const active = c.blocks.some((b) => b.id === selectedId);
      c.catBtn.style.outline = active ? '3px solid #fff' : '3px solid transparent';
      for (const [id, btn] of c.blockBtns) {
        btn.style.outline = id === selectedId ? '3px solid #fff' : '3px solid transparent';
      }
    }
  }

  // Tap outside the palette closes any open stack.
  document.addEventListener('pointerdown', closeAll);

  document.body.appendChild(bar);
  refresh();

  return {
    el: bar,
    getSelectedId: () => selectedId,
    setSelectedId(id) {
      const g = cats.find((c) => c.blocks.some((b) => b.id === id));
      selectedId = id;
      if (g) remembered.set(g.key, id);
      refresh();
    },
  };
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds, no errors.

- [ ] **Step 3: Sanity-check the API is intact**

Run:
```bash
node -e "const s=require('fs').readFileSync('src/edit/palette.js','utf8'); ['export function createPalette','getSelectedId','setSelectedId','el:'].forEach(k=>{ if(!s.includes(k)) throw new Error('missing '+k); }); console.log('API surface intact');"
```
Expected: `API surface intact`.

- [ ] **Step 4: Grouping regression**

Run: `node test/palette-categories.test.mjs`
Expected: still passes (Task 1 logic unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/edit/palette.js
git commit -m "Palette: category buttons with hover/tap block stacks"
```

---

## Notes for the executor

- Run tests from the repo root: `node test/<name>.test.mjs`.
- The palette DOM (hover reveal, tap-to-open, swatch tint) can't be unit-tested without a DOM harness (the project has none) — it's covered by `npm run build` plus a browser playtest. The *grouping* logic is fully Node-tested in Task 1.
- Do NOT change `blocks.js`, `main.js`, or the editor — the public palette API is unchanged.
