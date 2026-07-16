// blocks.js — the block type registry. This is the HEART of the design and the
// main extension point: adding a new block type = adding one entry here (and
// optionally a spinner style in render/spinners.js later).
//
// Each entry has a stable numeric `id` (stored in the level grid) and flags the
// rest of the game reads:
//   solid    — terrain you stand on / bump into (gets a merged cuboid collider)
//   kills    — touching it respawns you (sensor)
//   collect  — a coin: pick it up, +1 (sensor)
//   wins     — the goal: reach it to win (sensor)
//   unique   — only one may exist (start, goal): placing a new one moves it
//   spinner  — this block is drawn/animated as a spinner: 'coin'|'blades'|'platform'

export const BLOCKS = {
  solid: { id: 1, color: 0x7ec850, solid: true },
  brick: { id: 2, color: 0xb0522d, solid: true },
  hazard: { id: 3, color: 0x3aa0e8, solid: false, opacity: 0.7, flow: true }, // water: wade/sink, never kills
  coin: { id: 4, color: 0xffd24a, solid: false, collect: true, spinner: 'coin' },
  motorSlow: { id: 9, color: 0x2a9d8f, solid: true, motor: 'slow' },
  motorFast: { id: 10, color: 0x8e44ad, solid: true, motor: 'fast' },
  blade: { id: 11, color: 0xe74c3c, solid: true, arm: true },
  board: { id: 12, color: 0xc19a6b, solid: true, arm: true },
  start: { id: 7, color: 0xffffff, solid: false, unique: true },
  goal: { id: 8, color: 0x40e0a0, solid: false, wins: true },
};

// id 0 always means "empty". Everything below is derived from BLOCKS so there
// is only ever one source of truth.

// Stamp each definition with its own key so code that starts from a block def
// can find its name (used by the renderer, editor palette, etc.).
for (const [key, def] of Object.entries(BLOCKS)) {
  def.key = key;
}

// Fast lookup: block id -> definition (index 0 is undefined = empty).
const BY_ID = [];
for (const def of Object.values(BLOCKS)) {
  BY_ID[def.id] = def;
}

export function blockById(id) {
  return BY_ID[id];
}

// Ordered list of block definitions (stable, for the palette UI).
export const BLOCK_LIST = Object.values(BLOCKS);

// Retired block ids, kept only so migrateLegacyBlocks() can convert old levels.
export const LEGACY_BLADES = 5;
export const LEGACY_PLATFORM = 6;
