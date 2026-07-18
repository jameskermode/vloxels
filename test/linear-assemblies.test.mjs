import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
const has = (set, x, y, z) => set.has(`${x},${y},${z}`);

// A vertical lift: motor + a +y shaft of 4 + a ring of board arms (the car floor).
{
  const L = new Level(32, 8, 32);
  L.set(16, 1, 16, B.motorLinearSlow.id);
  for (let y = 2; y <= 5; y++) L.set(16, y, 16, B.shaft.id); // shaft +y, length 4
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(16 + dx, 1, 16 + dz, B.board.id);
  const { assemblies, movingCells } = computeAssemblies(L);
  ok(assemblies.length === 1, `one assembly (${assemblies.length})`);
  const a = assemblies[0];
  ok(a.kind === 'linear', `kind linear (${a.kind})`);
  ok(a.axis.join(',') === '0,1,0', `axis +y (${a.axis})`);
  ok(a.distance === 4, `distance = shaft length 4 (${a.distance})`);
  ok(a.cells.length === 5, `carriage = motor + 4 boards, shaft NOT included (${a.cells.length})`);
  ok(movingCells.size === 5 && !has(movingCells, 16, 3, 16), 'shaft cells stay static (not moving)');
}

// A horizontal slider: shaft +x.
{
  const L = new Level(32, 8, 32);
  L.set(5, 1, 5, B.motorLinearFast.id);
  for (let x = 6; x <= 8; x++) L.set(x, 1, 5, B.shaft.id); // +x, length 3
  const { assemblies } = computeAssemblies(L);
  ok(assemblies[0].kind === 'linear' && assemblies[0].axis.join(',') === '1,0,0' && assemblies[0].distance === 3, 'slider: +x, distance 3');
  ok(assemblies[0].cells.length === 1, 'no arms -> carriage is just the motor');
}

// A rotary motor is still tagged rotary and has no axis/distance.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, B.motorFast.id);
  L.set(11, 1, 10, B.blade.id);
  const { assemblies } = computeAssemblies(L);
  ok(assemblies[0].kind === 'rotary', 'rotary kind preserved');
  ok(assemblies[0].axis === undefined && assemblies[0].cells.length === 2, 'rotary unchanged (no axis; motor+blade)');
}

// A linear motor with no shaft -> distance 0 (sits still, harmless).
{
  const L = new Level(32, 8, 32);
  L.set(20, 1, 20, B.motorLinearSlow.id);
  const { assemblies } = computeAssemblies(L);
  ok(assemblies[0].kind === 'linear' && assemblies[0].distance === 0, 'no shaft -> distance 0');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
