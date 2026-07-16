import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';
import { createAssemblyRenderer } from '../src/render/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const L = new Level(32, 8, 32);
L.set(8, 1, 8, B.motorFast.id);
L.set(9, 1, 8, B.blade.id);
L.set(7, 1, 8, B.blade.id);
const { assemblies } = computeAssemblies(L);

// Fake body entries (parallel to assemblies) — moved + rotated.
const fakeBodies = assemblies.map(() => ({
  body: { translation: () => ({ x: 8.5, y: 1.5, z: 8.5 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) },
}));

const scene = new THREE.Scene();
const r = createAssemblyRenderer(scene);
r.build(L, assemblies, fakeBodies);
// one group per assembly, each with a mesh per cell
const group = scene.children.find((c) => c.isGroup);
ok(group && group.children.length === 1, `one assembly group (${group ? group.children.length : 'none'})`);
ok(group.children[0].children.length === 3, `3 cube meshes (motor + 2 blades) (${group.children[0].children.length})`);
r.update();
ok(Math.abs(group.children[0].position.x - 8.5) < 1e-6, 'group synced from its body translation');
r.clear();
ok(!scene.children.some((c) => c.isGroup && c.children.length), 'clear removes the assembly meshes');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
