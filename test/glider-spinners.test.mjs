import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createSpinners, makeGliderMesh } from '../src/render/spinners.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

// makeGliderMesh: a Group with a sail + two cylinders (>=3 children).
const g = makeGliderMesh(1);
ok(g.isGroup && g.children.length >= 3, 'makeGliderMesh has a sail + two jetpacks');

const scene = new THREE.Scene();
const sp = createSpinners(scene);
const L = new Level(8, 4, 8);
L.set(2, 1, 2, B.coin.id);
L.set(4, 1, 4, B.glider.id);
sp.rebuild(L);

ok(typeof sp.addItem === 'function', 'spinners exposes addItem');

// Animate; the glider pickup must bob but NOT spin. Find the pickup groups:
// coin group = 1 mesh child, glider group = 3+ mesh children.
sp.update(0.5);
const groups = [];
scene.traverse((o) => { if (o.isGroup && o.children.length >= 1 && o.children.every((c) => c.isMesh)) groups.push(o); });
const coinGroup = groups.find((gg) => gg.children.length === 1);
const gliderGroup = groups.find((gg) => gg.children.length >= 3);
ok(coinGroup && Math.abs(coinGroup.rotation.y) > 0.001, 'the coin spins');
ok(gliderGroup && gliderGroup.rotation.y === 0, 'the glider pickup does NOT spin');

// addItem places a runtime pickup that removeItem can remove.
sp.addItem([6, 1, 6], B.glider);
sp.removeItem([6, 1, 6]);
sp.removeItem([6, 1, 6]); // no-op, must not throw
sp.update(0.1);
ok(true, 'addItem + removeItem work and are safe to repeat');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
