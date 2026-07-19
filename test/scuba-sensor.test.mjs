import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

const L = new Level(8, 4, 8);
L.set(2, 0, 2, B.solid.id);
L.set(2, 1, 2, B.scuba.id);   // a scuba kit on the block
L.set(4, 1, 4, B.coin.id);    // a coin, for contrast

const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
mute(() => terrain.rebuild(L));

const kinds = [...terrain.sensors.values()].map((s) => s.blockKey).sort();
ok(kinds.includes('scuba'), 'a scuba block registers a sensor');
ok(kinds.includes('coin'), 'the coin still registers a sensor');
const scubaSensor = [...terrain.sensors.values()].find((s) => s.blockKey === 'scuba');
ok(scubaSensor && scubaSensor.cell[0] === 2 && scubaSensor.cell[1] === 1 && scubaSensor.cell[2] === 2, 'scuba sensor cell is correct');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
