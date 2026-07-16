// render/assemblies.js — draws each motor assembly (motor hub + arms) as a group
// of coloured cubes at their offsets from the motor centre, and syncs the whole
// group's position+rotation from its kinematic body every frame (PLAY only).

import * as THREE from 'three';
import { blockById } from '../blocks.js';

const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function createAssemblyRenderer(scene) {
  const group = new THREE.Group();
  scene.add(group);
  let items = []; // { mesh: THREE.Group, body }

  function clear() {
    for (const it of items) {
      group.remove(it.mesh);
      it.mesh.traverse((o) => {
        if (o.material) o.material.dispose();
      });
    }
    items = [];
  }

  // assemblies + bodyEntries are parallel arrays (bodyEntries[i].body).
  function build(level, assemblies, bodyEntries) {
    clear();
    assemblies.forEach((asm, i) => {
      const [cx, cy, cz] = asm.motorCell;
      const g = new THREE.Group();
      for (const [x, y, z] of asm.cells) {
        const def = blockById(level.get(x, y, z));
        const mesh = new THREE.Mesh(
          CUBE,
          new THREE.MeshLambertMaterial({ color: def ? def.color : 0xffffff }),
        );
        mesh.position.set(x - cx, y - cy, z - cz); // local offset from the motor centre
        g.add(mesh);
      }
      group.add(g);
      items.push({ mesh: g, body: bodyEntries[i].body });
    });
  }

  // Sync each assembly group from its body. Call once per frame in PLAY.
  function update() {
    for (const it of items) {
      const t = it.body.translation();
      const r = it.body.rotation();
      it.mesh.position.set(t.x, t.y, t.z);
      it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  return { build, update, clear };
}
