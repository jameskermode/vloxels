// render/spinners.js — the visible spinners: coins.
//
// Coins have no body (they're sensors) so they spin/bob cosmetically in both
// EDIT and PLAY. Motor assemblies (blades/platforms) are drawn and synced by
// render/assemblies.js instead.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { blockById } from '../blocks.js';

const S = CONFIG.spin;
const key = (x, y, z) => `${x},${y},${z}`;

function makeCoinMesh(color) {
  // A gold disc stood on edge (spins about y like a coin on a table).
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.1, 20),
    new THREE.MeshLambertMaterial({ color }),
  );
  disc.rotation.x = Math.PI / 2; // axis along z -> faces point ±z, edge up
  group.add(disc);
  return group;
}

export function createSpinners(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const items = new Map(); // cellKey -> { style, mesh, baseY, cell }
  let time = 0;

  function clear() {
    for (const it of items.values()) {
      group.remove(it.mesh);
      it.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    items.clear();
  }

  // (Re)build coin meshes from the level.
  function rebuild(level) {
    clear();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (!def || def.spinner !== 'coin') return;
      const mesh = makeCoinMesh(def.color);
      const baseY = y + 0.5;
      mesh.position.set(x + 0.5, baseY, z + 0.5);
      group.add(mesh);
      items.set(key(x, y, z), { style: def.spinner, mesh, baseY, cell: [x, y, z] });
    });
  }

  function removeCoin(cell) {
    const k = key(...cell);
    const it = items.get(k);
    if (!it) return;
    group.remove(it.mesh);
    it.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    items.delete(k);
  }

  // Animate: coins always spin+bob cosmetically.
  function update(dt) {
    time += dt;
    for (const it of items.values()) {
      it.mesh.rotation.y = time * S.coinSpeed;
      it.mesh.position.y = it.baseY + Math.sin(time * S.coinBobSpeed) * S.coinBob;
    }
  }

  return { rebuild, removeCoin, update, clear };
}
