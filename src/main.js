// main.js — bootstrap for Vloxels.
//
// Milestone 1: prove the toolchain (Rapier wasm + Three.js) end-to-end.
// Milestone 2: level data model + block registry, a hardcoded test level
//              rendered with one InstancedMesh per block type.
//
// Later milestones grow this into a full editor + physics platformer.

import RAPIER from '@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { BLOCKS } from './blocks.js';
import { Level } from './level.js';
import { createRenderer, createScene, createCamera, handleResize } from './render/scene.js';
import { createVoxelRenderer } from './render/voxels.js';
import { createFpsCounter } from './ui/hud.js';

// Build a small hardcoded level that shows off every block type. This is
// throwaway scaffolding — the editor (Milestone 3) replaces it.
function buildTestLevel() {
  const level = new Level(CONFIG.grid.x, CONFIG.grid.y, CONFIG.grid.z, 'Test Level');
  const S = BLOCKS;

  // A raised floor platform in the middle of the grid (11..21 in x and z).
  for (let x = 10; x <= 22; x++) {
    for (let z = 10; z <= 22; z++) {
      level.set(x, 0, z, S.solid.id);
    }
  }

  // A staircase of bricks climbing in +x.
  for (let i = 0; i < 4; i++) {
    for (let z = 12; z <= 14; z++) {
      level.set(23 + i, i, z, S.brick.id);
    }
  }

  // A hazard (lava) strip along one edge of the floor.
  for (let x = 11; x <= 21; x++) {
    level.set(x, 1, 10, S.hazard.id);
  }

  // A little row of floating coins to collect.
  for (let x = 12; x <= 20; x += 2) {
    level.set(x, 2, 16, S.coin.id);
  }

  // A spinning-blades hazard and a spinning carry-platform.
  level.set(16, 1, 20, S.spinner.id);
  level.set(19, 1, 13, S.platformSpin.id);

  // Start on one corner of the floor, goal on the far corner.
  level.set(11, 1, 21, S.start.id);
  level.set(21, 1, 12, S.goal.id);

  return level;
}

async function main() {
  // Rapier still initialised at boot (proves wasm every run); the real physics
  // world arrives in Milestone 4.
  await RAPIER.init();
  console.log(`[vloxels] Rapier ${RAPIER.version()} ready.`);

  const container = document.getElementById('app');
  const renderer = createRenderer(container);
  const scene = createScene();
  const camera = createCamera();
  handleResize(renderer, camera);

  // Orbit the level to inspect it (this becomes EDIT-mode camera in M3).
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CONFIG.grid.x / 2, 2, CONFIG.grid.z / 2);
  controls.enableDamping = true;
  controls.update();

  // Build and render the test level.
  const level = buildTestLevel();
  const voxels = createVoxelRenderer(scene);
  voxels.rebuild(level);

  // Quick sanity log of the data model + serialisation round-trip.
  let filled = 0;
  level.forEachBlock(() => filled++);
  const roundTrip = Level.fromJSON(level.toJSON());
  let rtOk = roundTrip.blocks.length === level.blocks.length;
  for (let i = 0; rtOk && i < level.blocks.length; i++) {
    if (roundTrip.blocks[i] !== level.blocks[i]) rtOk = false;
  }
  console.log(
    `[vloxels] Test level: ${filled} blocks, start at ${level.find(BLOCKS.start.id)}, ` +
      `goal at ${level.find(BLOCKS.goal.id)}. JSON round-trip ${rtOk ? 'OK' : 'FAILED'}.`,
  );

  const fpsCounter = createFpsCounter();
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, CONFIG.maxFrameDt);
    last = now;

    controls.update();
    fpsCounter.setStepMs(0); // no physics stepping yet
    fpsCounter.tick(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  console.log('[vloxels] Milestone 2 running — drag to orbit, press F for fps.');
}

main().catch((err) => {
  console.error('[vloxels] boot failed:', err);
  const el = document.getElementById('fps');
  if (el) el.textContent = 'boot failed — see console';
});
