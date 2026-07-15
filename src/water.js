// water.js — Minecraft-ish water flow. Each placed water block is a SOURCE.
// Water spreads DOWN into empty space (falling), and SIDEWAYS across the top of
// whatever it's sitting on, petering out after `reach` cells. Solid blocks (and
// the grid edges) are walls, so water walled-in on all sides just sits there;
// water with an opening flows out and off ledges (making little waterfalls).
//
// This is a plain flood-fill (breadth-first), recomputed whenever the level
// changes — no per-frame simulation, so it's cheap. It returns the list of wet
// cells (sources + everywhere the water flowed) for the renderer and the
// physics sensors to use.

import { CONFIG } from './config.js';
import { BLOCKS } from './blocks.js';

export function computeWater(level) {
  const { sizeX, sizeY, sizeZ } = level;
  const MAX = CONFIG.water.reach; // "level" of a source; sideways spread costs 1
  const HAZ = BLOCKS.hazard.id;
  const levels = new Int16Array(sizeX * sizeY * sizeZ); // 0 = dry
  const idx = (x, y, z) => level.index(x, y, z);
  const empty = (x, y, z) => level.inBounds(x, y, z) && level.get(x, y, z) === 0;

  // Seed every source block at full strength.
  const queue = [];
  level.forEachBlock((x, y, z, id) => {
    if (id === HAZ) {
      levels[idx(x, y, z)] = MAX;
      queue.push([x, y, z]);
    }
  });

  const SIDES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let head = 0;
  while (head < queue.length) {
    const [x, y, z] = queue[head++];
    const L = levels[idx(x, y, z)];
    if (L <= 0) continue;

    // Prefer to fall: if the cell below is empty, water pours straight down and
    // does NOT spread sideways here. Falling water lands at full strength, so it
    // can spread again from the bottom (waterfalls).
    if (empty(x, y - 1, z)) {
      const bi = idx(x, y - 1, z);
      if (levels[bi] < MAX) {
        levels[bi] = MAX;
        queue.push([x, y - 1, z]);
      }
      continue;
    }

    // Otherwise spread sideways, one weaker each cell.
    const nl = L - 1;
    if (nl > 0) {
      for (const [dx, dz] of SIDES) {
        const nx = x + dx;
        const nz = z + dz;
        if (empty(nx, y, nz) && levels[idx(nx, y, nz)] < nl) {
          levels[idx(nx, y, nz)] = nl;
          queue.push([nx, y, nz]);
        }
      }
    }
  }

  // Collect every wet cell (sources + flowed).
  const cells = [];
  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        if (levels[idx(x, y, z)] > 0) cells.push([x, y, z]);
      }
    }
  }
  return cells;
}
