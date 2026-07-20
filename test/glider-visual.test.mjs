// The worn-glider VISUAL logic (not its looks, which need a browser): the pilot
// eases between upright and prone when the glider goes on/off, the sail shows
// only while flying, and the jetpack flames show only while thrusting (Space).
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createPlayer } from '../src/play/player.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

const scene = new THREE.Scene();
const phys = createPhysicsWorld();
const player = createPlayer(phys.world, scene, { x: 0, y: 2, z: 0 }, () => false, () => {});

const byName = (n) => { const r = []; scene.traverse((o) => { if (o.name === n) r.push(o); }); return r; };
const sail = () => byName('glider-sail')[0];
const flames = () => byName('jet-flame');

// Not worn: sail hidden, capsule upright.
player.syncMesh();
ok(sail() && sail().visible === false, 'sail hidden when not flying');
ok(Math.abs(player.mesh.rotation.x) < 0.01, 'capsule upright when not flying');

// Don the glider: sail visible; capsule eases toward prone (tiltAngle).
player.setWearing('fly');
ok(sail().visible === true, 'sail visible when flying');
for (let i = 0; i < 80; i++) player.syncMesh();
ok(player.mesh.rotation.x < CONFIG.player.fly.tiltAngle * 0.8,
  `capsule leans prone (rot.x ${player.mesh.rotation.x.toFixed(2)} → ${CONFIG.player.fly.tiltAngle})`);

// Flames only while thrusting (Space held).
player.setSwimming(false); player.syncMesh();
ok(flames().length === 2 && flames().every((f) => !f.visible), 'no flames when not thrusting');
player.setSwimming(true); player.syncMesh();
ok(flames().some((f) => f.visible), 'flames appear when thrusting (Space held)');

// Take it off: sail hidden, capsule eases back upright, flames off.
player.setWearing(null); player.setSwimming(false);
ok(sail().visible === false, 'sail hidden after removing the glider');
for (let i = 0; i < 80; i++) player.syncMesh();
ok(Math.abs(player.mesh.rotation.x) < 0.05, `capsule returns upright (rot.x ${player.mesh.rotation.x.toFixed(2)})`);
ok(flames().every((f) => !f.visible), 'flames off after removing the glider');

// Faces the direction of travel while flying: fly +x and the assembly yaws to
// the heading for +x travel.
{
  const scene2 = new THREE.Scene();
  const phys2 = createPhysicsWorld();
  const p2 = createPlayer(phys2.world, scene2, { x: 0, y: 6, z: 0 }, () => false, () => {});
  p2.setWearing('fly');
  for (let i = 0; i < 30; i++) { p2.setIntent(1, 0); p2.setSwimming(false); p2.fixedUpdate(1 / 60); phys2.world.step(phys2.eventQueue); }
  for (let i = 0; i < 60; i++) p2.syncMesh();
  const yaw = p2.mesh.parent.rotation.y; // root is the mesh's parent
  const want = Math.atan2(-1, 0); // travelling +x
  const err = Math.abs(Math.atan2(Math.sin(yaw - want), Math.cos(yaw - want)));
  ok(err < 0.2, `assembly yaws to face +x travel (yaw ${yaw.toFixed(2)} ~ ${want.toFixed(2)})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
