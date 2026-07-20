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
const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
mute(() => terrain.rebuild(L));
const before = terrain.sensors.size;

terrain.addSensor('glider', 4, 1, 4); // runtime drop
const added = [...terrain.sensors.values()].find((s) => s.blockKey === 'glider');
ok(terrain.sensors.size === before + 1, 'addSensor adds one sensor');
ok(added && added.cell[0] === 4 && added.cell[1] === 1 && added.cell[2] === 4, 'runtime sensor cell is correct');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
