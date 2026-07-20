// The worn-glider VISUAL logic (not its looks, which need a browser): the pilot
// eases between upright and prone when the glider goes on/off, the sail shows
// only while flying, and the jetpack flames show only while thrusting (Space).
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createPlayer } from '../src/play/player.js';
import { CONFIG } from '../src/config.js';

const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

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
const jetpacks = () => flames()[0].parent; // the jetpacks group

// While GLIDING (not thrusting), the jetpacks lie parallel to the prone body.
player.setSwimming(false);
for (let i = 0; i < 40; i++) player.syncMesh();
ok(flames().every((f) => !f.visible), 'no flames when gliding');
ok(Math.abs(jetpacks().rotation.x - CONFIG.player.fly.tiltAngle) < 0.15,
  `jetpacks lie parallel to the body while gliding (rot.x ${jetpacks().rotation.x.toFixed(2)} ~ ${CONFIG.player.fly.tiltAngle})`);

// Hold Space: the jetpacks swing VERTICAL and the flames fire straight DOWN.
player.setSwimming(true);
for (let i = 0; i < 40; i++) player.syncMesh();
ok(flames().some((f) => f.visible), 'flames on during a burst');
ok(Math.abs(jetpacks().rotation.x) < 0.1, `jetpacks swing vertical during a burst (rot.x ${jetpacks().rotation.x.toFixed(2)})`);
{
  const fq = new THREE.Quaternion();
  flames()[0].getWorldQuaternion(fq);
  const exhaust = new THREE.Vector3(0, 1, 0).applyQuaternion(fq); // cone tip = flame direction
  ok(exhaust.y < -0.9, `burst flames point straight down (dir.y ${exhaust.y.toFixed(2)})`);
}

// Release: the jetpacks smoothly rotate BACK to the gliding pose (parallel body).
player.setSwimming(false);
for (let i = 0; i < 60; i++) player.syncMesh();
ok(Math.abs(jetpacks().rotation.x - CONFIG.player.fly.tiltAngle) < 0.15,
  `jetpacks return parallel to the body after the burst (rot.x ${jetpacks().rotation.x.toFixed(2)})`);

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

// Landing while flying stands the pilot back UPRIGHT: on a floor, grounded, the
// glider is worn but the capsule is NOT prone.
{
  const s = new THREE.Scene();
  const ph = createPhysicsWorld();
  const L = new Level(8, 6, 8);
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) L.set(x, 0, z, B.solid.id); // floor top y1
  const terrain = createVoxelBody(ph.world);
  mute(() => terrain.rebuild(L));
  const p3 = createPlayer(ph.world, s, { x: 4, y: 1.75, z: 4 }, () => false, () => {});
  p3.setWearing('fly');
  for (let i = 0; i < 30; i++) { p3.setIntent(0, 0); p3.setSwimming(false); p3.fixedUpdate(1 / 60); ph.world.step(ph.eventQueue); }
  for (let i = 0; i < 60; i++) p3.syncMesh();
  ok(Math.abs(p3.mesh.rotation.x) < 0.1, `landed pilot stands upright even with the glider on (rot.x ${p3.mesh.rotation.x.toFixed(2)})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
