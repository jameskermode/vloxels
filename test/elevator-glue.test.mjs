// Regression: a player who presses into the SIDE of a rising elevator must not
// get glued to its face and dragged up (bug: "stuck half-way up a board piece on
// a moving elevator, can't escape"). The fix cancels unearned upward velocity
// while airborne — so this test also guards that a normal jump and legit
// ride-on-top are NOT nerfed by that cancellation.
//
// Uses the REAL player controller + real Rapier + real motor bodies, stepped in
// main.js's fixed-step order (player.fixedUpdate -> motorBodies.update -> step).
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createMotorBodies } from '../src/physics/motorBodies.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createPlayer } from '../src/play/player.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

// Run the real player against a level; returns end position + peak height.
function sim(L, spawn, { intent = () => ({ x: 0, z: 0 }), jumpAt = null, steps = 200 } = {}) {
  const { assemblies, movingCells } = computeAssemblies(L);
  const phys = createPhysicsWorld();
  const terrain = createVoxelBody(phys.world);
  mute(() => terrain.rebuild(L, movingCells));
  const motors = createMotorBodies(phys.world);
  motors.build(assemblies);
  const player = createPlayer(phys.world, new THREE.Scene(), spawn, () => false);
  let maxY = -Infinity;
  for (let i = 0; i < steps; i++) {
    const it = intent(i);
    player.setIntent(it.x, it.z);
    player.setSwimming(false);
    if (jumpAt !== null && i === jumpAt) player.requestJump();
    player.fixedUpdate(1 / 60);
    motors.update(1 / 60);
    phys.world.step(phys.eventQueue);
    maxY = Math.max(maxY, player.body.translation().y);
  }
  return { end: player.body.translation(), maxY };
}

// A slow lift: motor + 4 board deck at y1 (deck top y2), shaft up 7, on a floor
// whose top is y1 — so walking in from the floor meets the deck's rising side.
function elevator() {
  const L = new Level(40, 16, 40);
  for (let x = 18; x <= 34; x++) for (let z = 24; z <= 36; z++) L.set(x, 0, z, B.solid.id);
  L.set(26, 1, 30, B.motorLinearSlow.id);
  for (let y = 2; y <= 8; y++) L.set(26, y, 30, B.shaft.id);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(26 + dx, 1, 30 + dz, B.board.id);
  return L;
}

// 1) THE BUG: stand on the floor beside the lift and hold "into" its rising side
//    (-x, toward the board at x27) for the whole ride. Must NOT be carried up:
//    the car climbs to ~y8, so a glued player would end up ~y6+. We require the
//    player to end back near the floor and never get hoisted near the top.
{
  const r = sim(elevator(), { x: 28.8, y: 1.5, z: 30.5 }, { intent: () => ({ x: -1, z: 0 }), steps: 200 });
  ok(r.end.y < 3, `pressing into a rising lift does not carry the player up (end y ${r.end.y.toFixed(2)}, want < 3)`);
  ok(r.maxY < 4.5, `player is never hoisted near the top of the shaft (peak y ${r.maxY.toFixed(2)}, want < 4.5)`);
}

// 2) GUARD: a normal jump on flat ground still reaches its full apex (the
//    anti-glue cancellation must not eat the jump we started).
{
  const L = new Level(20, 8, 20);
  for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) L.set(x, 0, z, B.solid.id);
  const r = sim(L, { x: 10, y: 1.75, z: 10 }, { jumpAt: 5, steps: 90 });
  ok(r.maxY > 3.0, `a normal jump still reaches its apex (peak y ${r.maxY.toFixed(2)}, want > 3.0)`);
}

// 3) GUARD: standing ON TOP of the lift, you still ride up (grounded carry is
//    never cancelled).
{
  const r = sim(elevator(), { x: 26.5, y: 2.5, z: 30.5 }, { steps: 150 });
  ok(r.end.y > 5, `riding on top of the lift still carries you up (end y ${r.end.y.toFixed(2)}, want > 5)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
