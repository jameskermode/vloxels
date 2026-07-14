// main.js — bootstrap for Vloxels.
//
// Milestone 1: prove the toolchain (Rapier wasm + Three.js) end-to-end.
// Milestone 2: level data model + block registry + instanced voxel rendering.
// Milestone 3: the editor — place/remove, palette, layers, autosave.
// Milestone 4: physics sandbox — greedy-merged static colliders from the level
//              + droppable debug balls (press B to drop, C to reset).
//
// Later milestones add the player + play mode + spinners.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { BLOCKS } from './blocks.js';
import { Level } from './level.js';
import { createRenderer, createScene, createCamera, handleResize } from './render/scene.js';
import { createVoxelRenderer } from './render/voxels.js';
import { createPalette } from './edit/palette.js';
import { createEditor } from './edit/editor.js';
import { createFpsCounter, createLayerControl } from './ui/hud.js';
import { load, createAutosaver } from './storage.js';
import { createPhysicsWorld } from './physics/world.js';
import { createVoxelBody } from './physics/voxelBody.js';
import { createDebugBalls } from './debugBalls.js';

function buildStarterLevel() {
  const level = new Level(CONFIG.grid.x, CONFIG.grid.y, CONFIG.grid.z, 'My Level');
  const S = BLOCKS;
  for (let x = 12; x <= 20; x++) {
    for (let z = 12; z <= 20; z++) {
      level.set(x, 0, z, S.solid.id);
    }
  }
  level.set(13, 1, 13, S.start.id);
  level.set(19, 1, 19, S.goal.id);
  return level;
}

async function main() {
  await RAPIER.init();
  console.log(`[vloxels] Rapier ${RAPIER.version()} ready.`);

  const container = document.getElementById('app');
  const renderer = createRenderer(container);
  const scene = createScene();
  const camera = createCamera();
  handleResize(renderer, camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CONFIG.grid.x / 2, 2, CONFIG.grid.z / 2);
  controls.enableDamping = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
  controls.update();

  const level = load() || buildStarterLevel();
  const voxels = createVoxelRenderer(scene);
  voxels.rebuild(level);

  // --- Physics sandbox (Milestone 4) ----------------------------------------
  // The world is created once; the terrain body is (re)built from the level on
  // demand. Physics only steps while `physicsOn`.
  const physics = createPhysicsWorld();
  const terrain = createVoxelBody(physics.world);
  const balls = createDebugBalls(physics.world, scene);
  let physicsOn = false;

  function startPhysics() {
    if (!physicsOn) {
      terrain.rebuild(level);
      physicsOn = true;
      console.log('[vloxels] physics ON — dropping balls. Press C to reset.');
    }
  }
  function resetPhysics() {
    balls.clear();
    terrain.remove();
    physicsOn = false;
    console.log('[vloxels] physics OFF — sandbox reset.');
  }
  function dropBall() {
    startPhysics();
    // Drop above the middle of the grid with a small random scatter.
    const jitter = () => (Math.random() - 0.5) * 3;
    balls.drop(CONFIG.grid.x / 2 + jitter(), CONFIG.grid.y + 3, CONFIG.grid.z / 2 + jitter());
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') dropBall();
    else if (e.key === 'c' || e.key === 'C') resetPhysics();
  });

  // --- Editor ---------------------------------------------------------------
  const palette = createPalette();
  const autosave = createAutosaver(1000);
  const editor = createEditor({
    renderer,
    camera,
    level,
    voxels,
    getSelectedId: palette.getSelectedId,
    onChange: (lvl) => {
      autosave(lvl);
      if (physicsOn) terrain.rebuild(lvl); // keep colliders in sync with edits
    },
  });

  const layerControl = createLayerControl({
    onUp: () => editor.setLayer(editor.getLayer() + 1),
    onDown: () => editor.setLayer(editor.getLayer() - 1),
  });
  editor.onLayerChange = (y) => layerControl.setValue(y);
  layerControl.setValue(editor.getLayer());

  // --- Loop -----------------------------------------------------------------
  const fpsCounter = createFpsCounter();
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, CONFIG.maxFrameDt);
    last = now;

    controls.update();

    if (physicsOn) {
      const stepMs = physics.step(dt);
      balls.sync();
      fpsCounter.setStepMs(stepMs);
    } else {
      fpsCounter.setStepMs(0);
    }

    fpsCounter.tick(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  console.log(
    '[vloxels] Milestone 4 running — build with the editor, then press B to drop ' +
      'physics balls onto your terrain, C to reset. F for fps/step-time.',
  );
}

main().catch((err) => {
  console.error('[vloxels] boot failed:', err);
  const el = document.getElementById('fps');
  if (el) el.textContent = 'boot failed — see console';
});
