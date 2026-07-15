// render/voxels.js — draws the level's blocks as voxels using ONE
// THREE.InstancedMesh per block type (never one Mesh per voxel — that would
// melt the Pi). Call rebuild(level) after any edit; it's cheap enough to redo
// the whole thing.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { blockById, BLOCK_LIST } from '../blocks.js';

// One shared unit-cube geometry for every instance of every type.
const CUBE = new THREE.BoxGeometry(CONFIG.voxelSize, CONFIG.voxelSize, CONFIG.voxelSize);

// Turn a material into "flowing water": two travelling sine ripples driven by
// world position + time brighten/darken the surface so it looks like it flows.
// Shared uTime uniform is bumped once per frame from updateWater().
function makeFlowMaterial(color, opacity, uTime) {
  const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader =
      'varying vec3 vWPos;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;',
      );
    shader.fragmentShader =
      'varying vec3 vWPos;\nuniform float uTime;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `float wave = sin(vWPos.x * 1.8 + uTime * 2.2) * 0.5
                   + sin(vWPos.z * 2.3 + vWPos.x * 0.6 - uTime * 1.6) * 0.5;
         gl_FragColor.rgb += wave * 0.10;              // ripple highlights flowing across
         gl_FragColor.a = clamp(gl_FragColor.a + wave * 0.10, 0.4, 0.95);
         #include <dithering_fragment>`,
      );
  };
  return mat;
}

export function createVoxelRenderer(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // blockKey -> { mesh, material }
  const pools = new Map();
  const dummy = new THREE.Object3D(); // reused to compose instance matrices
  const waterTime = { value: 0 }; // shared uniform for flowing-water materials

  function disposeAll() {
    for (const { mesh, material } of pools.values()) {
      group.remove(mesh);
      material.dispose();
    }
    pools.clear();
  }

  // Rebuild all instanced meshes from the current level state.
  function rebuild(level) {
    disposeAll();

    // First pass: how many instances does each block type need? Spinner blocks
    // (coins, blades, platforms) are drawn by render/spinners.js instead, so we
    // skip them here.
    const counts = new Map();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (!def || def.spinner) return;
      counts.set(def.key, (counts.get(def.key) || 0) + 1);
    });

    // Create an InstancedMesh sized exactly for each present block type.
    for (const def of BLOCK_LIST) {
      const count = counts.get(def.key) || 0;
      if (count === 0) continue;
      let material;
      if (def.flow) {
        material = makeFlowMaterial(def.color, def.opacity ?? 0.7, waterTime); // flowing water
      } else {
        material = new THREE.MeshLambertMaterial({ color: def.color });
        if (def.opacity !== undefined) {
          material.transparent = true;
          material.opacity = def.opacity; // e.g. see-through
        }
      }
      const mesh = new THREE.InstancedMesh(CUBE, material, count);
      mesh.name = `voxels:${def.key}`;
      pools.set(def.key, { mesh, material, next: 0 });
      group.add(mesh);
    }

    // Second pass: place each block as an instance at its cell centre.
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (!def || def.spinner) return;
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

  // Advance the flowing-water animation. Call once per frame with elapsed secs.
  function updateWater(elapsed) {
    waterTime.value = elapsed;
  }

  return { group, rebuild, dispose: disposeAll, updateWater };
}
