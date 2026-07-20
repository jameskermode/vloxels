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
