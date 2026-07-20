import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createSpinners } from '../src/render/spinners.js';
import { createRules } from '../src/play/rules.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

const L = new Level(12, 8, 12);
for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) L.set(x, 0, z, B.solid.id); // floor top y1
const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
mute(() => terrain.rebuild(L));
const spinners = createSpinners(new THREE.Scene());
spinners.rebuild(L);

// The drop handler main.js will use: find the floor below and spawn a pickup.
function dropGlider(pos) {
  const cx = Math.floor(pos.x), cz = Math.floor(pos.z);
  let fy = Math.floor(pos.y);
  while (fy > 0 && !L.isSolid(cx, fy, cz)) fy--;
  const dy = L.isSolid(cx, fy, cz) ? fy + 1 : Math.floor(pos.y);
  terrain.addSensor('glider', cx, dy, cz);
  spinners.addItem([cx, dy, cz], B.glider);
  return [cx, dy, cz];
}
const cell = dropGlider({ x: 5.5, y: 4, z: 5.5 });
ok(cell[1] === 1, `dropped glider rests on the floor (cell y ${cell[1]})`); // floor top is y1

// Re-pickup: a ball (stand-in player) overlapping the dropped sensor fires onWear('fly').
let worn = null;
const ball = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cell[0] + 0.5, 3, cell[2] + 0.5));
const ballCol = phys.world.createCollider(RAPIER.ColliderDesc.ball(0.3).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), ball);
const rules = createRules({
  eventQueue: phys.eventQueue,
  playerColliderHandle: ballCol.handle,
  terrain, spinners,
  hooks: { onRespawn: () => {}, onCoin: () => {}, onWin: () => {}, onWear: (k) => { worn = k; } },
});
for (let i = 0; i < 120 && worn === null; i++) { phys.world.step(phys.eventQueue); rules.drain(); }
ok(worn === 'fly', 'walking onto a dropped glider re-grants flight (onWear fly)');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
