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
