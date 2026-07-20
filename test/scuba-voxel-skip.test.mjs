// Regression: cosmetic pickups must NOT also be drawn as plain voxel cubes.
// Coins are skipped by the voxel renderer (via def.spinner) and drawn by
// render/spinners.js; the scuba kit (def.wear) is likewise drawn as flippers by
// spinners.js, so the voxel renderer must skip it too — otherwise it shows as a
// plain block on top of / instead of the flippers.
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createVoxelRenderer } from '../src/render/voxels.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const scene = new THREE.Scene();
const vr = createVoxelRenderer(scene);
const L = new Level(8, 4, 8);
L.set(1, 0, 1, B.solid.id);
L.set(2, 0, 2, B.coin.id);
L.set(3, 0, 3, B.scuba.id);
vr.rebuild(L);

const names = new Set();
scene.traverse((o) => { if (o.name && o.name.startsWith('voxels:')) names.add(o.name); });

ok(names.has('voxels:solid'), 'solid terrain IS drawn by the voxel renderer');
ok(!names.has('voxels:coin'), 'coins are NOT drawn as plain cubes (spinners.js handles them)');
ok(!names.has('voxels:scuba'), 'scuba kit is NOT drawn as a plain cube (flippers handle it)');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
