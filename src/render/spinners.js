// render/spinners.js — the visible spinners: coins, blades and platforms.
//
// Both modes show them alive:
//   - PLAY:  blades & platforms are synced FROM their kinematic bodies every
//     frame, so what you see is exactly what the physics does. Coins have no
//     body (they're sensors) so they spin/bob cosmetically.
//   - EDIT:  no bodies exist, so everything spins cosmetically (time-driven),
//     just so the level looks alive while you build.

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

function makeBladesMesh(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.25), mat));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 1.6), mat));
  return group;
}

function makePlatformMesh(color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.25, 2),
    new THREE.MeshLambertMaterial({ color }),
  );
}

export function createSpinners(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const items = new Map(); // cellKey -> { style, mesh, baseY, body|null, cell }
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

  // (Re)build spinner meshes from the level (no physics bodies here).
  function rebuild(level) {
    clear();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (!def || !def.spinner) return;
      let mesh;
      if (def.spinner === 'coin') mesh = makeCoinMesh(def.color);
      else if (def.spinner === 'blades') mesh = makeBladesMesh(def.color);
      else mesh = makePlatformMesh(def.color);
      const baseY = y + 0.5;
      mesh.position.set(x + 0.5, baseY, z + 0.5);
      group.add(mesh);
      items.set(key(x, y, z), { style: def.spinner, mesh, baseY, body: null, cell: [x, y, z] });
    });
  }

  // Link blades/platform meshes to their kinematic bodies (entering PLAY).
  function linkBodies(entries) {
    for (const e of entries) {
      const it = items.get(key(...e.cell));
      if (it) it.body = e.body;
    }
  }

  // Forget bodies (leaving PLAY) so meshes go back to cosmetic spinning.
  function unlinkBodies() {
    for (const it of items.values()) it.body = null;
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

  // Animate. In PLAY, blades/platforms follow their bodies; coins always
  // spin+bob cosmetically.
  function update(dt) {
    time += dt;
    for (const it of items.values()) {
      if (it.style === 'coin') {
        it.mesh.rotation.y = time * S.coinSpeed;
        it.mesh.position.y = it.baseY + Math.sin(time * S.coinBobSpeed) * S.coinBob;
      } else if (it.body) {
        const t = it.body.translation();
        const r = it.body.rotation();
        it.mesh.position.set(t.x, t.y, t.z);
        it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      } else {
        it.mesh.rotation.y = time * (it.style === 'blades' ? S.bladeSpeed : S.platformSpeed);
      }
    }
  }

  return { rebuild, linkBodies, unlinkBodies, removeCoin, update, clear };
}
