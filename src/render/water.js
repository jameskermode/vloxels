// render/water.js — draws the wet cells (from water.js) as one InstancedMesh of
// semi-transparent, rippling water. The ripple is a cheap animated shader (two
// travelling sine waves over world position + time), so it reads as flowing.
// Alive in both EDIT and PLAY.

import * as THREE from 'three';
import { BLOCKS } from '../blocks.js';

const CUBE = new THREE.BoxGeometry(1, 1, 1);

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
         gl_FragColor.rgb += wave * 0.10;                       // ripples flowing across
         gl_FragColor.a = clamp(gl_FragColor.a + wave * 0.10, 0.4, 0.95);
         #include <dithering_fragment>`,
      );
  };
  return mat;
}

export function createWater(scene) {
  const uTime = { value: 0 };
  const material = makeFlowMaterial(BLOCKS.hazard.color, BLOCKS.hazard.opacity ?? 0.7, uTime);
  const dummy = new THREE.Object3D();
  let mesh = null;

  function dispose() {
    if (mesh) {
      scene.remove(mesh);
      mesh = null;
    }
  }

  // cells: array of [x,y,z] wet cells from computeWater().
  function rebuild(cells) {
    dispose();
    if (!cells.length) return;
    mesh = new THREE.InstancedMesh(CUBE, material, cells.length);
    mesh.name = 'water';
    cells.forEach(([x, y, z], i) => {
      dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  // Advance the ripple. Call once per frame with elapsed seconds.
  function update(elapsed) {
    uTime.value = elapsed;
  }

  return { rebuild, update, dispose };
}
