// scripts/gen-levels.mjs — regenerate the bundled example levels.
//   node scripts/gen-levels.mjs
// Sized to the current world (CONFIG.grid, 64x16x64). Water is a wade-through
// medium (it doesn't hurt you): shallow water sits at y1 on the solid floor.

import { writeFileSync } from 'node:fs';
import { Level } from '../src/level.js';
import { CONFIG } from '../src/config.js';
import { BLOCKS as B } from '../src/blocks.js';

const { x: GX, y: GY, z: GZ } = CONFIG.grid;
const box = (L, x0, x1, y0, y1, z0, z1, id) => {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) L.set(x, y, z, id);
};
const save = (L, file) => {
  writeFileSync('./public/levels/' + file, JSON.stringify(L.toJSON(), null, 0));
  let n = 0;
  L.forEachBlock(() => n++);
  console.log(`wrote ${file}: ${n} blocks, size ${L.sizeX}x${L.sizeY}x${L.sizeZ}`);
};
const level = (name) => new Level(GX, GY, GZ, name);
// Place a spinner as a motor hub + a cross of arms (a quick blades/platform).
const spinner = (L, x, y, z, kind) => {
  const motor = kind === 'fast' ? B.motorFast.id : B.motorSlow.id;
  const arm = kind === 'fast' ? B.blade.id : B.board.id;
  L.set(x, y, z, motor);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(x + dx, y, z + dz, arm);
};

// 1) Coin Run — a long course east-west, wade the shallow water channels.
{
  const L = level('Coin Run');
  box(L, 6, 58, 0, 0, 28, 36, B.solid.id); // long floor slab
  for (const x of [16, 27, 38, 49]) box(L, x, x + 1, 1, 1, 29, 35, B.hazard.id); // wade channels
  for (const [x, y] of [[12, 1], [22, 1], [22, 2], [33, 1], [44, 1], [44, 2], [54, 1]])
    L.set(x, y, 32, B.coin.id);
  L.set(8, 1, 32, B.start.id);
  L.set(56, 1, 32, B.goal.id);
  save(L, 'coin-run.json');
}

// 2) Spin Bridge — hop a long line of spinning platforms over a shallow lake.
{
  const L = level('Spin Bridge');
  box(L, 6, 58, 0, 0, 24, 40, B.solid.id); // floor slab
  box(L, 12, 52, 1, 1, 28, 36, B.hazard.id); // shallow lake
  for (let x = 14; x <= 50; x += 4) spinner(L, x, 2, 32, 'slow'); // stepping platforms
  for (const x of [18, 26, 34, 42]) L.set(x, 3, 32, B.coin.id);
  L.set(8, 1, 32, B.start.id); // west pad
  L.set(56, 1, 32, B.goal.id); // east pad
  save(L, 'spin-bridge.json');
}

// 3) Blade Gauntlet — cross a big plaza dodging a grid of spinning blades.
{
  const L = level('Blade Gauntlet');
  box(L, 12, 52, 0, 0, 12, 52, B.solid.id); // big plaza
  for (const x of [22, 32, 42]) for (const z of [22, 32, 42]) spinner(L, x, 1, z, 'fast'); // blades
  for (const [x, z] of [[27, 22], [37, 32], [27, 42], [22, 27], [42, 37], [32, 27]])
    L.set(x, 2, z, B.coin.id);
  L.set(15, 1, 15, B.start.id);
  L.set(49, 1, 49, B.goal.id);
  save(L, 'blade-gauntlet.json');
}

// 4) Waterfall — a TALL waterfall (uses the new height). Wade the pool, or hold
//    jump inside the cascade to surf all the way up, then ease onto the lookout
//    ledge for the coins.
{
  const L = level('Waterfall');
  box(L, 6, 58, 0, 0, 20, 44, B.solid.id); // big ground
  box(L, 20, 44, 1, 1, 28, 36, B.hazard.id); // shallow pool (the cascade lands here)
  // Tall west tower (top y12) with a 3-wide spout pouring EAST into the pool.
  box(L, 18, 19, 1, 11, 30, 34, B.solid.id);
  for (const z of [31, 32, 33]) {
    L.set(19, 12, z, B.hazard.id); // source
    L.set(18, 12, z, B.solid.id); // west lip
  }
  L.set(19, 12, 30, B.solid.id); // north lip
  L.set(19, 12, 34, B.solid.id); // south lip (pours east only)
  // Lookout ledge near the top of the falls, with a row of coins.
  box(L, 21, 23, 10, 10, 31, 33, B.solid.id); // ledge, top y11
  for (const x of [21, 22, 23]) L.set(x, 11, 32, B.coin.id);
  // Down in the pool: a spinning stone + a couple of easy coins.
  spinner(L, 32, 2, 32, 'slow');
  L.set(28, 3, 32, B.coin.id);
  L.set(38, 3, 32, B.coin.id);
  L.set(10, 1, 32, B.start.id); // west ground
  L.set(52, 1, 32, B.goal.id); // east ground
  L.set(14, 1, 32, B.scuba.id); // grab the flippers on the way to the pool, then zoom through the water
  save(L, 'waterfall.json');
}

// 5) Machines — a rotary spinner, an elevator (vertical shaft) and a sliding
//    platform (horizontal shaft) to show off motors.
{
  const L = level('Machines');
  box(L, 16, 48, 0, 0, 16, 48, B.solid.id); // floor
  // ELEVATOR (slow lift): board car floor + a tall shaft; ride up to a coin.
  L.set(26, 1, 30, B.motorLinearSlow.id);
  for (let y = 2; y <= 8; y++) L.set(26, y, 30, B.shaft.id); // shaft +y, length 7
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(26 + dx, 1, 30 + dz, B.board.id);
  L.set(27, 9, 30, B.coin.id); // reward reachable when the car is near the top
  // SLIDING PLATFORM (fast slider): a +x shaft; carries you and a coin across.
  L.set(34, 1, 34, B.motorLinearFast.id);
  for (let x = 35; x <= 41; x++) L.set(x, 1, 34, B.shaft.id); // shaft +x, length 7
  for (const [dx, dz] of [[0, 1], [0, -1], [-1, 0]]) L.set(34 + dx, 1, 34 + dz, B.board.id);
  L.set(34, 2, 34, B.coin.id); // rides along on the platform
  // a rotary spinner for contrast
  spinner(L, 42, 1, 42, 'fast');
  L.set(20, 1, 30, B.start.id);
  L.set(45, 1, 42, B.goal.id);
  save(L, 'machines.json');
}

const manifest = [
  { name: 'Coin Run', file: 'coin-run.json' },
  { name: 'Spin Bridge', file: 'spin-bridge.json' },
  { name: 'Blade Gauntlet', file: 'blade-gauntlet.json' },
  { name: 'Waterfall', file: 'waterfall.json' },
  { name: 'Machines', file: 'machines.json' },
];
writeFileSync('./public/levels/index.json', JSON.stringify(manifest, null, 2));
console.log('wrote index.json');
