import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createMotorBodies } from '../src/physics/motorBodies.js';
import { createAssemblyRenderer } from '../src/render/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// End-to-end: a level with a motor+arms and some terrain. Assembly cells are
// excluded from terrain colliders; the assembly is its own kinematic body.
const L = new Level(32, 8, 32);
for (let x = 10; x <= 14; x++) L.set(x, 0, 12, B.solid.id); // terrain strip
L.set(12, 1, 12, B.motorFast.id); // motor sits above terrain
L.set(13, 1, 12, B.blade.id);
L.set(11, 1, 12, B.blade.id);

const { assemblies, movingCells } = computeAssemblies(L);
ok(assemblies.length === 1 && movingCells.size === 3, 'one assembly, 3 moving cells');

const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
const nSolid = terrain.rebuild(L, movingCells);
ok(nSolid >= 1, 'terrain colliders built, assembly excluded');
// the motor/arm cells must NOT be terrain colliders — cast a ray where the
// blade is: no static collider there (it's a kinematic body instead)
const motors = createMotorBodies(phys.world);
motors.build(assemblies);
ok(motors.entries.length === 1, 'motor body built');
const scene = new THREE.Scene();
const r = createAssemblyRenderer(scene);
r.build(L, assemblies, motors.entries);
for (let i = 0; i < 30; i++) phys.step(1 / 60, (dt) => motors.update(dt));
r.update();
ok(scene.children.some((c) => c.isGroup && c.children.length === 1), 'assembly rendered + synced');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
