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

// Terrain + a horizontal slider (motor + a +x shaft + a board on top).
const L = new Level(32, 8, 32);
for (let x = 8; x <= 20; x++) L.set(x, 0, 12, B.solid.id); // terrain
L.set(10, 1, 12, B.motorLinearFast.id);
for (let x = 11; x <= 15; x++) L.set(x, 1, 12, B.shaft.id); // shaft +x, length 5
L.set(10, 2, 12, B.board.id); // a bit of car floor on top

const { assemblies, movingCells } = computeAssemblies(L);
ok(assemblies[0].kind === 'linear' && assemblies[0].distance === 5, 'linear assembly, distance 5');
// carriage (motor + board) is moving; shaft cells are NOT
ok(movingCells.has('10,1,12') && movingCells.has('10,2,12'), 'carriage cells move');
ok(!movingCells.has('12,1,12'), 'shaft cells stay static (rendered as terrain cubes)');

const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
terrain.rebuild(L, movingCells); // shaft is non-solid -> no collider either way; carriage excluded
const motors = createMotorBodies(phys.world);
motors.build(assemblies);
const scene = new THREE.Scene();
const r = createAssemblyRenderer(scene);
r.build(L, assemblies, motors.entries);
for (let i = 0; i < 60; i++) phys.step(1 / 60, (dt) => motors.update(dt));
r.update();
const g = scene.children.find((c) => c.isGroup && c.children.length);
ok(g && g.children[0].children.length === 2, 'carriage rendered (motor + board), synced from body');
ok(g.children[0].position.x > 10.5, `carriage mesh followed the sliding body (x ${g.children[0].position.x.toFixed(2)})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
