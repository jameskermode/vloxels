// scripts/gen-levels.mjs — regenerate the bundled example levels.
//   node scripts/gen-levels.mjs
// Water is a flowing source now, so every pool is fully bordered by solid
// blocks ("walls around the water") to keep it contained. Water sits at y=0 in
// holes ringed by the solid floor, so it reads flush and can't leak out.

import { writeFileSync } from 'node:fs';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';

const dir = './public/levels/';
const box = (L, x0, x1, y0, y1, z0, z1, id) => {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) L.set(x, y, z, id);
};
const save = (L, file) => {
  writeFileSync(dir + file, JSON.stringify(L.toJSON(), null, 0));
  let n = 0;
  L.forEachBlock(() => n++);
  console.log(`wrote ${file}: ${n} blocks, name="${L.name}"`);
};

// 1) Coin Run — a solid course with two walled water channels to jump.
{
  const L = new Level(32, 8, 32, 'Coin Run');
  box(L, 8, 24, 0, 0, 12, 18, B.solid.id); // one big solid floor slab (the "walls")
  box(L, 13, 14, 0, 0, 13, 17, B.hazard.id); // water channel 1 (ringed by solid)
  box(L, 19, 20, 0, 0, 13, 17, B.hazard.id); // water channel 2
  for (const [x, y] of [[11, 1], [16, 1], [16, 2], [22, 1]]) L.set(x, y, 15, B.coin.id);
  L.set(9, 1, 15, B.start.id);
  L.set(23, 1, 15, B.goal.id);
  save(L, 'coin-run.json');
}

// 2) Spin Bridge — hop spinning platforms across a walled lake.
{
  const L = new Level(32, 8, 32, 'Spin Bridge');
  box(L, 6, 26, 0, 0, 12, 20, B.solid.id); // floor slab
  box(L, 9, 23, 0, 0, 14, 18, B.hazard.id); // the lake (ringed by the slab)
  for (const x of [11, 14, 17, 20]) L.set(x, 1, 16, B.platformSpin.id); // stepping platforms above the water
  for (const x of [14, 20]) L.set(x, 2, 16, B.coin.id);
  L.set(7, 1, 16, B.start.id); // west pad (solid slab)
  L.set(25, 1, 16, B.goal.id); // east pad
  save(L, 'spin-bridge.json');
}

// 3) Blade Gauntlet — unchanged (no water): cross a plaza dodging blades.
{
  const L = new Level(32, 8, 32, 'Blade Gauntlet');
  box(L, 9, 23, 0, 0, 9, 23, B.solid.id);
  for (const [x, z] of [[13, 13], [19, 13], [13, 19], [19, 19], [16, 16]]) L.set(x, 1, z, B.spinner.id);
  for (const [x, z] of [[16, 11], [11, 16], [21, 16], [16, 21]]) L.set(x, 2, z, B.coin.id);
  L.set(10, 1, 10, B.start.id);
  L.set(22, 1, 22, B.goal.id);
  save(L, 'blade-gauntlet.json');
}

// 4) Waterfall — a spout on a tower pours a cascade down into a walled pool.
//    The pool is FLUSH with the ground so you can just wade in and out (water
//    no longer hurts you); the spout cascades in and splashes across. Hop the
//    spinning stone to cross without getting wet.
{
  const L = new Level(32, 8, 32, 'Waterfall');
  box(L, 6, 26, 0, 0, 6, 26, B.solid.id); // ground, top y1
  box(L, 12, 20, 0, 0, 12, 18, B.hazard.id); // flush pool of water (surface at y1)
  // West tower with a spout on top that pours EAST only, into the pool.
  box(L, 10, 11, 1, 5, 14, 16, B.solid.id); // tower, top y6
  L.set(11, 6, 15, B.hazard.id); // the source
  L.set(10, 6, 15, B.solid.id); // lip: west
  L.set(11, 6, 14, B.solid.id); // lip: north
  L.set(11, 6, 16, B.solid.id); // lip: south  (only east, over the pool, is open)
  L.set(15, 1, 15, B.platformSpin.id); // a spinning stepping stone across the pool
  L.set(14, 2, 15, B.coin.id);
  L.set(17, 2, 15, B.coin.id);
  L.set(8, 1, 16, B.start.id); // on the ground, west of the pool
  L.set(24, 1, 16, B.goal.id); // on the ground, east of the pool
  save(L, 'waterfall.json');
}

const manifest = [
  { name: 'Coin Run', file: 'coin-run.json' },
  { name: 'Spin Bridge', file: 'spin-bridge.json' },
  { name: 'Blade Gauntlet', file: 'blade-gauntlet.json' },
  { name: 'Waterfall', file: 'waterfall.json' },
];
writeFileSync(dir + 'index.json', JSON.stringify(manifest, null, 2));
console.log('wrote index.json');
