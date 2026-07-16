// migrate.js — convert retired block ids in old saved/shared levels so they
// still open. Legacy Blades -> Fast Motor + blade arms; legacy Platform ->
// Slow Motor + board arms (arms only fill EMPTY, in-bounds horizontal
// neighbours; a bare motor just spins harmlessly if there's no room).

import { BLOCKS, LEGACY_BLADES, LEGACY_PLATFORM } from './blocks.js';

const HORIZ = [
  [1, 0], [-1, 0],
  [0, 1], [0, -1],
];

export function migrateLegacyBlocks(level) {
  // Collect first so we don't rescan cells we just wrote.
  const legacy = [];
  level.forEachBlock((x, y, z, id) => {
    if (id === LEGACY_BLADES || id === LEGACY_PLATFORM) legacy.push([x, y, z, id]);
  });

  for (const [x, y, z, id] of legacy) {
    const motor = id === LEGACY_BLADES ? BLOCKS.motorFast : BLOCKS.motorSlow;
    const arm = id === LEGACY_BLADES ? BLOCKS.blade : BLOCKS.board;
    level.set(x, y, z, motor.id);
    for (const [dx, dz] of HORIZ) {
      const nx = x + dx, nz = z + dz;
      if (level.inBounds(nx, y, nz) && level.get(nx, y, nz) === 0) {
        level.set(nx, y, nz, arm.id);
      }
    }
  }
  return level;
}
