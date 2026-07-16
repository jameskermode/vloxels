import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
const has = (set, x, y, z) => set.has(`${x},${y},${z}`);

// Motor + a line of 2 blades + a board = one assembly of 4 cells.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, B.motorFast.id);
  L.set(11, 1, 10, B.blade.id);
  L.set(12, 1, 10, B.blade.id); // chained through the first blade
  L.set(10, 1, 11, B.board.id);
  const { assemblies, movingCells } = computeAssemblies(L);
  ok(assemblies.length === 1, `one assembly (${assemblies.length})`);
  ok(assemblies[0].speed === 'fast', 'speed from motor type');
  ok(assemblies[0].cells.length === 4, `4 cells (${assemblies[0].cells.length})`);
  ok(movingCells.size === 4 && has(movingCells, 12, 1, 10), 'movingCells includes chained arm');
}

// Terrain never attaches; a disconnected arm stays static.
{
  const L = new Level(32, 8, 32);
  L.set(5, 1, 5, B.motorSlow.id);
  L.set(6, 1, 5, B.solid.id); // terrain neighbour — not an arm
  L.set(20, 1, 20, B.blade.id); // far away, no motor
  const { assemblies, movingCells } = computeAssemblies(L);
  ok(assemblies[0].cells.length === 1, 'motor with no arms = 1 cell');
  ok(!has(movingCells, 6, 1, 5), 'terrain not attached');
  ok(!has(movingCells, 20, 1, 20), 'lone arm stays static');
  ok(movingCells.size === 1, 'only the motor moves');
}

// Two motors sharing an arm: first motor (lower grid index) claims it.
{
  const L = new Level(32, 8, 32);
  L.set(4, 0, 0, B.motorSlow.id); // lower index
  L.set(5, 0, 0, B.blade.id); // between them
  L.set(6, 0, 0, B.motorFast.id);
  const { assemblies } = computeAssemblies(L);
  const a4 = assemblies.find((a) => a.motorCell[0] === 4);
  const a6 = assemblies.find((a) => a.motorCell[0] === 6);
  ok(a4.cells.length === 2 && a6.cells.length === 1, `first motor claims shared arm (${a4.cells.length}/${a6.cells.length})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
