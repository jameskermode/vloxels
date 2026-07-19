// render/spinners.js — the visible cosmetic pickups: spinning+bobbing coins and
// bobbing (non-spinning) scuba flippers.
//
// These have no physics body (they're sensors) so they animate cosmetically in
// both EDIT and PLAY. Motor assemblies (blades/platforms) are drawn and synced
// by render/assemblies.js instead.

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

// A pair of swim flippers (two flattened, slightly splayed fins). Used both for
// the world pickup and, reused, for the fins drawn under a wearing player.
export function makeFlippersMesh(color) {
  const group = new THREE.Group();
  const finGeo = new THREE.BoxGeometry(0.18, 0.06, 0.42); // width, thickness, length
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, new THREE.MeshLambertMaterial({ color }));
    fin.position.set(side * 0.12, 0, 0.05);
    fin.rotation.y = side * 0.2; // splay outward into a shallow V
    group.add(fin);
  }
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

  // (Re)build cosmetic pickups from the level: spinning coins + bobbing flippers.
  function rebuild(level) {
    clear();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      let mesh, baseY, style;
      if (def && def.spinner === 'coin') {
        mesh = makeCoinMesh(def.color);
        baseY = y + 0.5;
        style = 'coin';
      } else if (def && def.wear === 'scuba') {
        mesh = makeFlippersMesh(def.color);
        baseY = y + 0.2; // rests on the block below, not floating mid-cell
        style = 'flippers';
      } else {
        return;
      }
      mesh.position.set(x + 0.5, baseY, z + 0.5);
      group.add(mesh);
      items.set(key(x, y, z), { style, mesh, baseY, cell: [x, y, z] });
    });
  }

  function removeItem(cell) {
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

  // Animate: coins spin+bob, flippers only bob.
  function update(dt) {
    time += dt;
    for (const it of items.values()) {
      it.mesh.position.y = it.baseY + Math.sin(time * S.coinBobSpeed) * S.coinBob;
      if (it.style === 'coin') it.mesh.rotation.y = time * S.coinSpeed;
    }
  }

  return { rebuild, removeItem, update, clear };
}
