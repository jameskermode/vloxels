// main.js — bootstrap for Vloxels.
//
// Milestone 1: prove the toolchain (Rapier wasm + Three.js) end-to-end.
// Milestone 2: level data model + block registry + instanced voxel rendering.
// Milestone 3: the editor — raycast place/remove, palette, working-layer
//              control, OrbitControls, and localStorage autosave.
//
// Later milestones add physics + play mode.

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

// A small starter level so a fresh page isn't an empty void. Replaced the
// moment you start editing (and thereafter loaded from localStorage).
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
  await RAPIER.init(); // proves the wasm every boot; real world arrives in M4
  console.log(`[vloxels] Rapier ${RAPIER.version()} ready.`);

  const container = document.getElementById('app');
  const renderer = createRenderer(container);
  const scene = createScene();
  const camera = createCamera();
  handleResize(renderer, camera);

  // EDIT-mode camera: orbit to look around. Right mouse is freed up for
  // block removal (we handle it ourselves), so it doesn't pan the camera.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CONFIG.grid.x / 2, 2, CONFIG.grid.z / 2);
  controls.enableDamping = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
  controls.update();

  // Level: prefer the autosaved one, else a starter.
  const level = load() || buildStarterLevel();
  const voxels = createVoxelRenderer(scene);
  voxels.rebuild(level);

  // Editor UI + logic.
  const palette = createPalette();
  const autosave = createAutosaver(1000);
  const editor = createEditor({
    renderer,
    camera,
    level,
    voxels,
    getSelectedId: palette.getSelectedId,
    onChange: autosave, // debounced localStorage save on every edit
  });

  const layerControl = createLayerControl({
    onUp: () => editor.setLayer(editor.getLayer() + 1),
    onDown: () => editor.setLayer(editor.getLayer() - 1),
  });
  editor.onLayerChange = (y) => layerControl.setValue(y);
  layerControl.setValue(editor.getLayer());

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

  console.log(
    '[vloxels] Milestone 3 (editor) running — tap to place, right-click/long-press to remove, ' +
      '[ / ] or ▲/▼ to change layer, drag to orbit, F for fps.',
  );
}

main().catch((err) => {
  console.error('[vloxels] boot failed:', err);
  const el = document.getElementById('fps');
  if (el) el.textContent = 'boot failed — see console';
});
