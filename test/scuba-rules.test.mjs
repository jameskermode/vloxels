import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createRules } from '../src/play/rules.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

// A dynamic ball as a stand-in "player" that falls onto a scuba sensor.
const L = new Level(8, 6, 8);
L.set(4, 0, 4, B.solid.id);
L.set(4, 1, 4, B.scuba.id);
const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
mute(() => terrain.rebuild(L));

const ball = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(4.5, 3, 4.5));
const ballCol = phys.world.createCollider(
  RAPIER.ColliderDesc.ball(0.3).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), ball);

let worn = null, removed = 0, coined = 0;
const spinnersStub = { removeItem: () => { removed++; } };
const rules = createRules({
  eventQueue: phys.eventQueue,
  playerColliderHandle: ballCol.handle,
  terrain,
  spinners: spinnersStub,
  hooks: { onRespawn: () => {}, onCoin: () => { coined++; }, onWin: () => {}, onWear: (k) => { worn = k; } },
});

for (let i = 0; i < 120 && worn === null; i++) { phys.world.step(phys.eventQueue); rules.drain(); }

ok(worn === 'scuba', 'overlapping a scuba kit fires onWear("scuba")');
ok(removed === 1, 'the scuba entity is removed once');
ok(coined === 0, 'no coin was counted');
ok(!terrain.sensors.has(ballCol.handle), 'scuba sensor was removed from terrain');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
