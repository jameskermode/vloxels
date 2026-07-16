import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createMotorBodies } from '../src/physics/motorBodies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// A slow motor with a flat board disc carries a box resting on top.
{
  const L = new Level(32, 8, 32);
  // motor hub + a 3x3-ish board disc at y=1
  L.set(16, 1, 16, B.motorSlow.id);
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
    L.set(16 + dx, 1, 16 + dz, B.board.id);
  }
  const { assemblies } = computeAssemblies(L);
  const phys = createPhysicsWorld();
  const motors = createMotorBodies(phys.world);
  motors.build(assemblies);
  ok(motors.entries.length === 1 && motors.entries[0].speed === 0.6, 'one slow body built');

  // a box resting on the disc top (disc top ~ y=2)
  const box = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(17.5, 2.6, 16.5));
  phys.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setFriction(1.0), box);

  const before = { x: box.translation().x, z: box.translation().z };
  for (let i = 0; i < 120; i++) phys.step(1 / 60, (dt) => motors.update(dt));
  const after = box.translation();
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  ok(after.y > 2.0, `box stays on the disc (y=${after.y.toFixed(2)})`);
  ok(moved > 0.1, `spinning disc carries the box (moved ${moved.toFixed(2)})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
