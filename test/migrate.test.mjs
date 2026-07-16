import { Level } from '../src/level.js';
import { BLOCKS as B, LEGACY_BLADES, LEGACY_PLATFORM } from '../src/blocks.js';
import { migrateLegacyBlocks } from '../src/migrate.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

// Legacy Blades -> fast motor + blade arms in empty horizontal neighbours.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, LEGACY_BLADES);
  migrateLegacyBlocks(L);
  ok(L.get(10, 1, 10) === B.motorFast.id, 'blades -> fast motor');
  ok(L.get(11, 1, 10) === B.blade.id && L.get(9, 1, 10) === B.blade.id, 'blade arms placed');
  ok(L.get(10, 1, 11) === B.blade.id && L.get(10, 1, 9) === B.blade.id, 'blade arms on z too');
}

// Legacy Platform -> slow motor + board arms.
{
  const L = new Level(32, 8, 32);
  L.set(5, 2, 5, LEGACY_PLATFORM);
  migrateLegacyBlocks(L);
  ok(L.get(5, 2, 5) === B.motorSlow.id, 'platform -> slow motor');
  ok(L.get(6, 2, 5) === B.board.id, 'board arm placed');
}

// Occupied neighbours are NOT overwritten; edges don't go out of bounds.
{
  const L = new Level(32, 8, 32);
  L.set(0, 0, 0, LEGACY_BLADES); // corner
  L.set(1, 0, 0, B.solid.id); // occupied neighbour
  migrateLegacyBlocks(L);
  ok(L.get(0, 0, 0) === B.motorFast.id, 'corner motor placed');
  ok(L.get(1, 0, 0) === B.solid.id, 'occupied neighbour preserved');
  ok(L.get(0, 0, 1) === B.blade.id, 'free neighbour got an arm');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
