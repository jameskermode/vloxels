// render/voxels.js — draws the level's blocks as voxels using ONE
// THREE.InstancedMesh per block type (never one Mesh per voxel — that would
// melt the Pi). Call rebuild(level) after any edit; it's cheap enough to redo
// the whole thing.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { blockById, BLOCK_LIST } from '../blocks.js';

// One shared unit-cube geometry for every instance of every type.
const CUBE = new THREE.BoxGeometry(CONFIG.voxelSize, CONFIG.voxelSize, CONFIG.voxelSize);

export function createVoxelRenderer(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // blockKey -> { mesh, material }
  const pools = new Map();
  const dummy = new THREE.Object3D(); // reused to compose instance matrices

  function disposeAll() {
    for (const { mesh, material } of pools.values()) {
      group.remove(mesh);
      material.dispose();
    }
    pools.clear();
  }

  // Rebuild all instanced meshes from the current level state.
  function rebuild(level, movingCells) {
    disposeAll();

    // First pass: how many instances does each block type need? Spinner blocks
    // (coins, blades, platforms) are drawn by render/spinners.js, and flowing
    // water by render/water.js, so we skip both here.
    const counts = new Map();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (!def || def.spinner || def.flow || (movingCells && movingCells.has(`${x},${y},${z}`))) return;
      counts.set(def.key, (counts.get(def.key) || 0) + 1);
    });

    // Create an InstancedMesh sized exactly for each present block type.
    for (const def of BLOCK_LIST) {
      const count = counts.get(def.key) || 0;
      if (count === 0) continue;
      const material = new THREE.MeshLambertMaterial({ color: def.color });
      if (def.opacity !== undefined) {
        material.transparent = true;
        material.opacity = def.opacity; // e.g. see-through
      }
      const mesh = new THREE.InstancedMesh(CUBE, material, count);
      mesh.name = `voxels:${def.key}`;
      pools.set(def.key, { mesh, material, next: 0 });
      group.add(mesh);
    }

    // Second pass: place each block as an instance at its cell centre.
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (!def || def.spinner || def.flow || (movingCells && movingCells.has(`${x},${y},${z}`))) return;
      const pool = pools.get(def.key);
      if (!pool) return;
      dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      pool.mesh.setMatrixAt(pool.next++, dummy.matrix);
    });

    for (const { mesh } of pools.values()) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return { group, rebuild, dispose: disposeAll };
}
