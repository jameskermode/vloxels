// render/spinners.js — the visible cosmetic pickups: spinning+bobbing coins,
// bobbing (non-spinning) scuba flippers, and glider pickups.
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

// A hang-glider + twin jetpack: a flat green triangular sail overhead and two
// grey cylinders (the jetpacks) on the back. Reused for the world pickup icon
// and, larger, for the rig drawn on a flying player.
export function makeGliderMesh(scale = 1) {
  const group = new THREE.Group();
  const tri = new THREE.Shape();
  tri.moveTo(0, 0.55);
  tri.lineTo(-0.6, -0.45);
  tri.lineTo(0.6, -0.45);
  tri.closePath();
  const sail = new THREE.Mesh(
    new THREE.ShapeGeometry(tri),
    new THREE.MeshLambertMaterial({ color: 0x4caf50, side: THREE.DoubleSide }),
  );
  sail.rotation.x = -Math.PI / 2 + 0.35; // lay it near-flat overhead, nose up
  sail.position.set(0, 0.95, 0);
  group.add(sail);
  const jetGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.45, 10);
  for (const side of [-1, 1]) {
    const jet = new THREE.Mesh(jetGeo, new THREE.MeshLambertMaterial({ color: 0x9098a0 }));
    jet.position.set(side * 0.22, -0.05, -0.32);
    group.add(jet);
  }
  group.scale.setScalar(scale);
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

  // Build the cosmetic for one pickup block, or null if it isn't a pickup.
  function buildPickup(def) {
    if (def.spinner === 'coin') return { mesh: makeCoinMesh(def.color), yOff: 0.5, style: 'coin' };
    if (def.wear === 'scuba') return { mesh: makeFlippersMesh(def.color), yOff: 0.2, style: 'flippers' };
    if (def.wear === 'fly') return { mesh: makeGliderMesh(0.6), yOff: 0.3, style: 'glider' };
    return null;
  }

  // Add one pickup cosmetic at a cell (no-op if the block isn't a pickup).
  function addItem(cell, def) {
    const p = buildPickup(def);
    if (!p) return;
    const [x, y, z] = cell;
    const baseY = y + p.yOff;
    p.mesh.position.set(x + 0.5, baseY, z + 0.5);
    group.add(p.mesh);
    items.set(key(x, y, z), { style: p.style, mesh: p.mesh, baseY, cell: [x, y, z] });
  }

  // (Re)build all cosmetic pickups from the level.
  function rebuild(level) {
    clear();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (def) addItem([x, y, z], def);
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

  return { rebuild, addItem, removeItem, update, clear };
}
