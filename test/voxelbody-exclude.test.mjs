import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// A 3-in-a-row solid strip = 1 merged collider. Excluding the middle cell
// splits it into 2 (proving movingCells is honoured by the terrain builder).
const L = new Level(32, 8, 32);
L.set(10, 0, 5, B.solid.id);
L.set(11, 0, 5, B.solid.id);
L.set(12, 0, 5, B.solid.id);

const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
ok(terrain.rebuild(L) === 1, 'no exclusion -> 1 merged run');
ok(terrain.rebuild(L, new Set(['11,0,5'])) === 2, 'excluding the middle -> 2 runs');
ok(terrain.rebuild(L, new Set(['10,0,5', '11,0,5', '12,0,5'])) === 0, 'excluding all -> 0');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
