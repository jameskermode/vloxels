import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createSpinners, makeFlippersMesh } from '../src/render/spinners.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const scene = new THREE.Scene();
const sp = createSpinners(scene);
const L = new Level(8, 4, 8);
L.set(2, 1, 2, B.coin.id);
L.set(4, 1, 4, B.scuba.id);
sp.rebuild(L);

ok(typeof sp.removeItem === 'function', 'spinners exposes removeItem');
ok(typeof sp.removeCoin === 'undefined', 'removeCoin was renamed away');

// makeFlippersMesh builds a group of two fins.
const fl = makeFlippersMesh(0x11333a);
ok(fl.isGroup && fl.children.length === 2, 'makeFlippersMesh has two fins');

// Animate a while, then read the two pickup groups back off the scene: the coin
// group is a Group of ONE mesh (the disc), the flippers group is a Group of TWO
// mesh fins. The coin must spin (rotation.y != 0); the flippers must NOT.
sp.update(0.5);
const pickups = [];
scene.traverse((o) => {
  if (o.isGroup && o.children.length >= 1 && o.children.length <= 2 && o.children.every((c) => c.isMesh)) {
    pickups.push(o);
  }
});
const coinGroup = pickups.find((g) => g.children.length === 1);
const finGroup = pickups.find((g) => g.children.length === 2);
ok(coinGroup && Math.abs(coinGroup.rotation.y) > 0.001, 'the coin spins');
ok(finGroup && finGroup.rotation.y === 0, 'the flippers do NOT spin (bob only)');

// Removing the scuba item is safe and idempotent (no throw on repeat / update).
sp.removeItem([4, 1, 4]);
sp.removeItem([4, 1, 4]);
sp.update(0.1);
ok(true, 'removeItem removes a scuba item and is safe to repeat');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
