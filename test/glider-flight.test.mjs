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

function world(build) {
  const L = new Level(40, 20, 12); build(L);
  const phys = createPhysicsWorld();
  const terrain = createVoxelBody(phys.world);
  mute(() => terrain.rebuild(L));
  return { phys };
}
function floor(L) { for (let x = 0; x < 40; x++) for (let z = 0; z < 12; z++) L.set(x, 0, z, B.solid.id); }

// Hold Space while flying → RISE; a non-wearer just falls.
{
  const { phys } = world(floor);
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false);
  fly.setWearing('fly');
  const { phys: p2 } = world(floor);
  const none = createPlayer(p2.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false);
  for (let i = 0; i < 60; i++) {
    for (const [pl, ph] of [[fly, phys], [none, p2]]) {
      pl.setIntent(0, 0); pl.setSwimming(true); pl.fixedUpdate(1 / 60); ph.world.step(ph.eventQueue);
    }
  }
  ok(fly.body.translation().y > 4.5, `holding Space with the glider rises (y ${fly.body.translation().y.toFixed(2)})`);
  ok(none.body.translation().y < 2, `a non-wearer falls (y ${none.body.translation().y.toFixed(2)})`);
}

// Release Space while flying → glide down GENTLY (far slower than free-fall).
{
  const { phys } = world(floor);
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 12, z: 6 }, () => false);
  fly.setWearing('fly');
  const { phys: p2 } = world(floor);
  const none = createPlayer(p2.world, new THREE.Scene(), { x: 5, y: 12, z: 6 }, () => false);
  for (let i = 0; i < 40; i++) {
    for (const [pl, ph] of [[fly, phys], [none, p2]]) {
      pl.setIntent(0, 0); pl.setSwimming(false); pl.fixedUpdate(1 / 60); ph.world.step(ph.eventQueue);
    }
  }
  const glideDrop = 12 - fly.body.translation().y, fallDrop = 12 - none.body.translation().y;
  ok(glideDrop < fallDrop - 1, `glide sinks gently vs free-fall (${glideDrop.toFixed(2)} vs ${fallDrop.toFixed(2)})`);
}

// Fly INTO a wall → crash (onGliderDrop fires, gear cleared); flying over open
// floor the same distance does NOT crash.
{
  let dropped = null;
  const { phys } = world((L) => { floor(L); for (let y = 1; y <= 4; y++) for (let z = 0; z < 12; z++) L.set(12, y, z, B.solid.id); });
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 6, y: 2, z: 6 }, () => false, (pos) => { dropped = pos; });
  fly.setWearing('fly');
  for (let i = 0; i < 90 && fly.gear === 'fly'; i++) { fly.setIntent(1, 0); fly.setSwimming(false); fly.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); }
  ok(dropped !== null && fly.gear === null, 'flying into a wall crashes (onGliderDrop fired, gear cleared)');

  let dropped2 = null;
  const { phys: p2 } = world(floor);
  const fly2 = createPlayer(p2.world, new THREE.Scene(), { x: 6, y: 2, z: 6 }, () => false, (pos) => { dropped2 = pos; });
  fly2.setWearing('fly');
  for (let i = 0; i < 90; i++) { fly2.setIntent(1, 0); fly2.setSwimming(false); fly2.fixedUpdate(1 / 60); p2.world.step(p2.eventQueue); }
  ok(dropped2 === null && fly2.gear === 'fly', 'flying over open floor does NOT crash');
}

// Death while flying drops the glider; scuba survives respawn.
{
  let dropped = null;
  const { phys } = world(floor);
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false, (pos) => { dropped = pos; });
  fly.setWearing('fly');
  fly.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); // establish last-grounded / prev pos
  fly.respawn();
  ok(dropped !== null && fly.gear === null, 'death while flying drops the glider');

  const scuba = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false, () => {});
  scuba.setWearing('scuba');
  scuba.respawn();
  ok(scuba.gear === 'scuba', 'scuba survives respawn');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
