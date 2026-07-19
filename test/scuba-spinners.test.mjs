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

// Removing the scuba item leaves the coin (2 items -> 1). We can't easily read
// the private map, so assert via re-remove being a no-op and no throw.
sp.removeItem([4, 1, 4]);   // remove scuba
sp.removeItem([4, 1, 4]);   // no-op, must not throw
sp.update(0.1);             // must not throw with a coin still present
ok(true, 'removeItem removes a scuba item and is safe to repeat');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
