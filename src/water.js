// water.js — Minecraft-ish water flow. Each placed water block is a SOURCE.
// Water spreads DOWN into empty space (falling), and SIDEWAYS across the top of
// whatever it's sitting on, petering out after `reach` cells. Solid blocks (and
// the grid edges) are walls, so water walled-in on all sides just sits there;
// water with an opening flows out and off ledges (making little waterfalls).
//
// Two flavours share the same rules:
//   - computeWater(level): the whole flood computed at once. EDIT mode uses this
//     so the finished flow shows instantly as you build.
//   - createWaterSim(): a ticked stepper. PLAY mode uses this so the water
//     visibly pours and spreads ring by ring. Its final state is identical to
//     computeWater(), so physics sensors and visuals stay in sync.

import { CONFIG } from './config.js';
import { BLOCKS } from './blocks.js';

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// A TICKED version of the flow used in PLAY mode: water spreads one "ring" per
// tick so you watch it pour and fill, instead of appearing all at once. Its
// final state matches computeWater() exactly, so physics/visuals stay in sync.
//
//   reset(level) -> initial wet cells (the sources), seeded at full strength
//   tick()       -> the cells that became wet THIS tick (empty array when done)
//   done         -> true once nothing new can spread
export function createWaterSim() {
  const MAX = CONFIG.water.reach;
  const HAZ = BLOCKS.hazard.id;
  let level;
  let levels; // Int16Array of current water level per cell (0 = dry)
  let frontier; // cells to propagate from next tick
  let done = false;

  const idx = (x, y, z) => level.index(x, y, z);
  const empty = (x, y, z) => level.inBounds(x, y, z) && level.get(x, y, z) === 0;

  function reset(lvl) {
    level = lvl;
    levels = new Int16Array(lvl.sizeX * lvl.sizeY * lvl.sizeZ);
    frontier = [];
    done = false;
    const sources = [];
    lvl.forEachBlock((x, y, z, id) => {
      if (id === HAZ) {
        levels[idx(x, y, z)] = MAX;
        frontier.push([x, y, z]);
        sources.push([x, y, z]);
      }
    });
    if (frontier.length === 0) done = true;
    return sources; // sources are wet from the start
  }

  function tick() {
    if (done) return [];
    const next = [];
    const newWet = [];
    // raise(cell,newLevel): update a cell; report it as newly wet only the first
    // time it goes from dry to wet (so sensors/render aren't added twice).
    const raise = (x, y, z, nl) => {
      const i = idx(x, y, z);
      if (levels[i] >= nl) return;
      const wasDry = levels[i] === 0;
      levels[i] = nl;
      next.push([x, y, z]);
      if (wasDry) newWet.push([x, y, z]);
    };

    for (const [x, y, z] of frontier) {
      const L = levels[idx(x, y, z)];
      if (L <= 0) continue;
      if (empty(x, y - 1, z)) {
        raise(x, y - 1, z, MAX); // fall (resets to full strength)
        continue;
      }
      const nl = L - 1;
      if (nl > 0) {
        for (const [dx, dz] of SIDES) {
          if (empty(x + dx, y, z + dz)) raise(x + dx, y, z + dz, nl);
        }
      }
    }

    frontier = next;
    if (next.length === 0) done = true;
    return newWet;
  }

  return {
    reset,
    tick,
    get done() {
      return done;
    },
  };
}

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
