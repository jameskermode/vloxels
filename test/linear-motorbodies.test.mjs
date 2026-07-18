import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createMotorBodies } from '../src/physics/motorBodies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// A slow LIFT raises a box resting on its car floor.
{
  const L = new Level(32, 8, 32);
  L.set(16, 1, 16, B.motorLinearSlow.id);
  for (let y = 2; y <= 5; y++) L.set(16, y, 16, B.shaft.id); // shaft +y, length 4
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(16 + dx, 1, 16 + dz, B.board.id);
  const { assemblies } = computeAssemblies(L);
  const phys = createPhysicsWorld();
  const motors = createMotorBodies(phys.world);
  motors.build(assemblies);
  ok(motors.entries[0].kind === 'linear', 'linear entry built');

  // box resting on the car floor (board top ~ y2)
  const box = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(17.5, 2.4, 16.5));
  phys.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setFriction(1.0), box);

  let maxBoxY = -9;
  const carYs = [];
  for (let i = 0; i < 400; i++) {
    phys.step(1 / 60, (dt) => motors.update(dt));
    maxBoxY = Math.max(maxBoxY, box.translation().y);
    carYs.push(motors.entries[0].body.translation().y);
  }
  const peakCarY = Math.max(...carYs);
  const peakStep = carYs.indexOf(peakCarY);
  const postPeakMin = Math.min(...carYs.slice(peakStep + 1));
  ok(maxBoxY > 4.5, `lift raises the box near the top (max y ${maxBoxY.toFixed(2)})`);
  ok(peakCarY > 5.0, `car reaches near the top of the shaft (peak ${peakCarY.toFixed(2)})`);
  ok(postPeakMin < peakCarY - 1.5, `car ping-pongs back DOWN after the top (post-peak min ${postPeakMin.toFixed(2)} vs peak ${peakCarY.toFixed(2)})`);
}

// A horizontal SLIDER translates its body back and forth along +x.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, B.motorLinearFast.id);
  for (let x = 11; x <= 15; x++) L.set(x, 1, 10, B.shaft.id); // +x, length 5
  const { assemblies } = computeAssemblies(L);
  const phys = createPhysicsWorld();
  const motors = createMotorBodies(phys.world);
  motors.build(assemblies);
  let maxX = -9;
  for (let i = 0; i < 200; i++) {
    phys.step(1 / 60, (dt) => motors.update(dt));
    maxX = Math.max(maxX, motors.entries[0].body.translation().x);
  }
  ok(maxX > 15, `slider reaches the far end of the shaft (max x ${maxX.toFixed(2)}, start 10.5 + 5)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
