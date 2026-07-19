// edit/palette.js — the block picker. A row of big coloured buttons generated
// straight from the BLOCKS registry, so a new block type shows up here for free.
// Big touch targets (>= 48px) for the tablets.

import { BLOCK_LIST } from '../blocks.js';

// Friendly labels for the buttons (falls back to the key if not listed).
const LABELS = {
  solid: 'Grass',
  brick: 'Brick',
  hazard: 'Water',
  coin: 'Coin',
  motorSlow: 'Slow Motor',
  motorFast: 'Fast Motor',
  blade: 'Blade',
  board: 'Board',
  motorLinearSlow: 'Slow Slider',
  motorLinearFast: 'Fast Slider',
  shaft: 'Shaft',
  scuba: 'Scuba Kit',
  start: 'Start',
  goal: 'Goal',
};

export function createPalette() {
  let selectedId = BLOCK_LIST[0].id;
  const buttons = new Map(); // id -> button element

  const bar = document.createElement('div');
  bar.id = 'palette';
  Object.assign(bar.style, {
    position: 'fixed',
    left: '50%',
    bottom: '10px',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '6px',
    padding: '6px',
    background: 'rgba(0,0,0,0.45)',
    borderRadius: '10px',
    maxWidth: '96vw',
    overflowX: 'auto',
    zIndex: '10',
  });

  function hex(color) {
    return '#' + color.toString(16).padStart(6, '0');
  }

  function refresh() {
    for (const [id, btn] of buttons) {
      btn.style.outline = id === selectedId ? '3px solid #fff' : '3px solid transparent';
    }
  }

  for (const def of BLOCK_LIST) {
    const btn = document.createElement('button');
    btn.textContent = LABELS[def.key] || def.key;
    Object.assign(btn.style, {
      minWidth: '48px',
      minHeight: '48px',
      padding: '4px 8px',
      border: 'none',
      borderRadius: '8px',
      background: hex(def.color),
      // dark blocks get light text, light blocks get dark text
      color: def.color < 0x888888 ? '#fff' : '#111',
      font: '600 12px system-ui, sans-serif',
      cursor: 'pointer',
      outline: '3px solid transparent',
      flex: '0 0 auto',
    });
    btn.addEventListener('click', () => {
      selectedId = def.id;
      refresh();
    });
    // Don't let a tap on the palette also fall through to the 3D canvas.
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    buttons.set(def.id, btn);
    bar.appendChild(btn);
  }

  document.body.appendChild(bar);
  refresh();

  return {
    el: bar,
    getSelectedId: () => selectedId,
    setSelectedId(id) {
      selectedId = id;
      refresh();
    },
  };
}
