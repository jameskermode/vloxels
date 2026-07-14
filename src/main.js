// main.js — bootstrap for Vloxels.
//
// Milestone 1: prove the whole toolchain end-to-end (including the Rapier wasm)
// on the MacBook, the Pi and Fire's Silk browser:
//   - await RAPIER.init() and step an empty world once (wasm smoke test)
//   - Three.js renderer + scene + lights + ground grid
//   - one spinning cube
//   - fps + physics-step-time counter (toggle with F)
//
// Later milestones grow this into a full editor + physics platformer.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from './config.js';
import { createRenderer, createScene, createCamera, handleResize } from './render/scene.js';
import { createFpsCounter } from './ui/hud.js';

async function main() {
  // --- Rapier wasm smoke test ------------------------------------------------
  // The -compat build inlines the wasm as base64, so this "just works" with
  // Vite. We MUST await init() before touching any RAPIER.* class.
  await RAPIER.init();
  const smokeWorld = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const body = smokeWorld.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 10, 0));
  smokeWorld.createCollider(RAPIER.ColliderDesc.ball(0.5), body);
  smokeWorld.step();
  console.log(
    `[vloxels] Rapier ${RAPIER.version()} OK — stepped world, test ball at y=${body
      .translation()
      .y.toFixed(4)}`,
  );
  smokeWorld.free(); // done with the smoke test; the real world comes in M4

  // --- Three.js scene --------------------------------------------------------
  const container = document.getElementById('app');
  const renderer = createRenderer(container);
  const scene = createScene();
  const camera = createCamera();
  handleResize(renderer, camera);

  // One spinning cube, sitting on the ground near the middle of the grid.
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshLambertMaterial({ color: 0xc040e0 }),
  );
  cube.position.set(CONFIG.grid.x / 2, 3, CONFIG.grid.z / 2);
  scene.add(cube);

  // --- Loop ------------------------------------------------------------------
  const fpsCounter = createFpsCounter();
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, CONFIG.maxFrameDt);
    last = now;

    // Spin the cube (cosmetic for M1).
    cube.rotation.y += CONFIG.spin.bladeSpeed * dt;
    cube.rotation.x += CONFIG.spin.bladeSpeed * 0.4 * dt;

    fpsCounter.setStepMs(0); // no physics stepping yet in M1
    fpsCounter.tick(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  console.log('[vloxels] Milestone 1 running — press F to toggle the fps counter.');
}

main().catch((err) => {
  console.error('[vloxels] boot failed:', err);
  const el = document.getElementById('fps');
  if (el) el.textContent = 'boot failed — see console';
});
