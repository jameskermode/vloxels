import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createPlayer } from '../src/play/player.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

// A big, DEEP water pool: solid floor at y0, water cells y1..y12 over a wide
// 40x40 area. Deliberately large so a swimmer (even at scuba speed) stays inside
// the water for the whole run, and deep enough that an idle sinker never reaches
// the bottom within the window — otherwise the very effect we measure gets
// masked (a swimmer falling off the edge, or both runs grounding out).
function pool() {
  const L = new Level(44, 16, 44);
  for (let x = 2; x <= 42; x++) for (let z = 2; z <= 42; z++) L.set(x, 0, z, B.solid.id);
  const wet = new Set();
  for (let x = 2; x <= 42; x++) for (let z = 2; z <= 42; z++) for (let y = 1; y <= 12; y++) wet.add(`${x},${y},${z}`);
  return { L, isWater: (x, y, z) => wet.has(`${x},${y},${z}`) };
}

// Run the player in water swimming +x, return horizontal distance travelled.
function swimDist(wearing) {
  const { L, isWater } = pool();
  const phys = createPhysicsWorld();
  const terrain = createVoxelBody(phys.world);
  mute(() => terrain.rebuild(L));
  const player = createPlayer(phys.world, new THREE.Scene(), { x: 6, y: 10, z: 22 }, isWater);
  if (wearing) player.setWearing('scuba');
  const x0 = player.body.translation().x;
  for (let i = 0; i < 90; i++) { player.setIntent(1, 0); player.setSwimming(false); player.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); }
  return player.body.translation().x - x0;
}

// Run idle in deep water, return net vertical drop over time (positive = sank).
function idleDrop(wearing) {
  const { L, isWater } = pool();
  const phys = createPhysicsWorld();
  const terrain = createVoxelBody(phys.world);
  mute(() => terrain.rebuild(L));
  const player = createPlayer(phys.world, new THREE.Scene(), { x: 22, y: 10, z: 22 }, isWater);
  if (wearing) player.setWearing('scuba');
  const y0 = player.body.translation().y;
  for (let i = 0; i < 90; i++) { player.setIntent(0, 0); player.setSwimming(false); player.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); }
  return y0 - player.body.translation().y; // >0 means it sank
}

// Hold SWIM-UP from deep water, return how far the player rose. Spawned deep so
// the swim-up speed cap (swimSpeed vs scubaSwimSpeed) is the binding limit, not
// the ease-to-surface term — so this exercises the third scuba effect.
function swimUp(wearing) {
  const { L, isWater } = pool();
  const phys = createPhysicsWorld();
  const terrain = createVoxelBody(phys.world);
  mute(() => terrain.rebuild(L));
  const player = createPlayer(phys.world, new THREE.Scene(), { x: 22, y: 4, z: 22 }, isWater);
  if (wearing) player.setWearing('scuba');
  const y0 = player.body.translation().y;
  for (let i = 0; i < 30; i++) { player.setIntent(0, 0); player.setSwimming(true); player.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); }
  return player.body.translation().y - y0;
}

// Dry-land: walk +x on a plain floor, distance must be identical wearing or not.
function landDist(wearing) {
  const L = new Level(20, 6, 8);
  for (let x = 0; x < 20; x++) for (let z = 0; z < 8; z++) L.set(x, 0, z, B.solid.id);
  const phys = createPhysicsWorld();
  const terrain = createVoxelBody(phys.world);
  mute(() => terrain.rebuild(L));
  const player = createPlayer(phys.world, new THREE.Scene(), { x: 3, y: 1.75, z: 4 }, () => false);
  if (wearing) player.setWearing('scuba');
  const x0 = player.body.translation().x;
  for (let i = 0; i < 90; i++) { player.setIntent(1, 0); player.setSwimming(false); player.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); }
  return player.body.translation().x - x0;
}

ok(swimDist(true) > swimDist(false) + 0.5, `scuba swims faster (${swimDist(true).toFixed(2)} vs ${swimDist(false).toFixed(2)})`);
ok(idleDrop(true) < idleDrop(false) - 0.3, `scuba hovers, un-equipped sinks (${idleDrop(true).toFixed(2)} vs ${idleDrop(false).toFixed(2)})`);
ok(swimUp(true) > swimUp(false) + 0.4, `scuba swims UP faster (${swimUp(true).toFixed(2)} vs ${swimUp(false).toFixed(2)})`);
ok(Math.abs(landDist(true) - landDist(false)) < 0.01, `dry-land movement identical with/without scuba`);

// Persistence: wearing survives a respawn.
{
  const L = new Level(6, 4, 6);
  for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) L.set(x, 0, z, B.solid.id);
  const phys = createPhysicsWorld();
  const player = createPlayer(phys.world, new THREE.Scene(), { x: 3, y: 1.75, z: 3 }, () => false);
  player.setWearing('scuba');
  player.respawn();
  ok(player.wearing === true, 'wearing survives respawn');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
