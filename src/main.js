// main.js — bootstrap for Vloxels.
//
// M1: toolchain.  M2: level + instanced voxels.  M3: editor.
// M4: physics sandbox (merged colliders + debug balls).
// M5: PLAY mode — player capsule, camera-relative movement, jump, follow
//     camera, EDIT/PLAY toggle, respawn on falling.
//
// Two modes:
//   EDIT — orbit camera, place/remove blocks (no physics).
//   PLAY — build the physics world from the level, spawn the player at `start`,
//          play. Leaving PLAY frees the world and restores the level snapshot.

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
import { createFpsCounter, createLayerControl, createModeButton } from './ui/hud.js';
import { load, createAutosaver } from './storage.js';
import { createPhysicsWorld } from './physics/world.js';
import { createVoxelBody } from './physics/voxelBody.js';
import { createDebugBalls } from './debugBalls.js';
import { createPlayer } from './play/player.js';
import { createFollowCamera } from './play/camera.js';

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

// Where the player capsule spawns: above the `start` block if there is one,
// else high over the middle of the grid.
function spawnFor(level) {
  const s = level.find(BLOCKS.start.id);
  if (s) return { x: s[0] + 0.5, y: s[1] + 1.4, z: s[2] + 0.5 };
  return { x: CONFIG.grid.x / 2, y: CONFIG.grid.y + 1.5, z: CONFIG.grid.z / 2 };
}

async function main() {
  await RAPIER.init();
  console.log(`[vloxels] Rapier ${RAPIER.version()} ready.`);

  const container = document.getElementById('app');
  const renderer = createRenderer(container);
  const scene = createScene();
  const camera = createCamera();
  handleResize(renderer, camera);

  // EDIT camera (orbit). Disabled while playing.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CONFIG.grid.x / 2, 2, CONFIG.grid.z / 2);
  controls.enableDamping = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
  controls.update();

  const followCam = createFollowCamera(camera);

  const level = load() || buildStarterLevel();
  const voxels = createVoxelRenderer(scene);
  voxels.rebuild(level);

  // Editor + UI.
  const palette = createPalette();
  const autosave = createAutosaver(1000);
  const editor = createEditor({
    renderer,
    camera,
    level,
    voxels,
    getSelectedId: palette.getSelectedId,
    onChange: (lvl) => autosave(lvl),
  });
  const layerControl = createLayerControl({
    onUp: () => editor.setLayer(editor.getLayer() + 1),
    onDown: () => editor.setLayer(editor.getLayer() - 1),
  });
  editor.onLayerChange = (y) => layerControl.setValue(y);
  layerControl.setValue(editor.getLayer());

  // --- Mode management ------------------------------------------------------
  let mode = 'edit';
  let play = null; // { physics, terrain, player, balls, snapshot } while playing

  function enterPlay() {
    const snapshot = level.blocks.slice(); // so coins/edits restore on stop (M6)
    const physics = createPhysicsWorld();
    const terrain = createVoxelBody(physics.world);
    terrain.rebuild(level);
    const player = createPlayer(physics.world, scene, spawnFor(level));
    const balls = createDebugBalls(physics.world, scene); // B still drops balls, for fun

    controls.enabled = false;
    editor.setActive(false);
    palette.el.style.display = 'none';
    layerControl.el.style.display = 'none';
    followCam.reset();
    followCam.snapTo(player.position());

    play = { physics, terrain, player, balls, snapshot };
    mode = 'play';
    modeButton.setMode('play');
    console.log('[vloxels] PLAY — WASD/arrows move, Space jumps, B drops a ball.');
  }

  function exitPlay() {
    play.balls.clear();
    play.player.dispose();
    play.physics.free();
    level.blocks.set(play.snapshot); // restore edits/coins
    voxels.rebuild(level);

    controls.enabled = true;
    controls.target.set(CONFIG.grid.x / 2, 2, CONFIG.grid.z / 2);
    controls.update();
    editor.setActive(true);
    palette.el.style.display = '';
    layerControl.el.style.display = '';

    play = null;
    mode = 'edit';
    modeButton.setMode('edit');
    console.log('[vloxels] EDIT — build away. Autosaved.');
  }

  function toggleMode() {
    if (mode === 'edit') enterPlay();
    else exitPlay();
  }

  const modeButton = createModeButton({ onToggle: toggleMode });
  modeButton.setMode('edit');

  // --- Input (keyboard) -----------------------------------------------------
  const keys = new Set();
  let spaceArmed = true; // require a fresh press to jump (no key-repeat spam)

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleMode();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (mode === 'play' && spaceArmed) {
        play.player.requestJump();
        spaceArmed = false;
      }
      return;
    }
    if ((e.key === 'b' || e.key === 'B') && mode === 'play') {
      play.balls.drop(play.player.position().x, play.player.position().y + 4, play.player.position().z);
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceArmed = true;
    keys.delete(e.code);
  });

  // Turn the pressed keys into a camera-relative unit move direction.
  function readMoveIntent() {
    let f = 0;
    let r = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
    if (f === 0 && r === 0) return { x: 0, z: 0 };
    const { forward, right } = followCam.basis();
    const dir = new THREE.Vector3()
      .addScaledVector(forward, f)
      .addScaledVector(right, r);
    dir.y = 0;
    dir.normalize();
    return { x: dir.x, z: dir.z };
  }

  // --- Loop -----------------------------------------------------------------
  const fpsCounter = createFpsCounter();
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, CONFIG.maxFrameDt);
    last = now;

    if (mode === 'play') {
      const intent = readMoveIntent();
      play.player.setIntent(intent.x, intent.z);
      const stepMs = play.physics.step(dt, (fixedDt) => play.player.fixedUpdate(fixedDt));
      play.player.syncMesh();
      play.balls.sync();
      followCam.update(dt, play.player.position());
      fpsCounter.setStepMs(stepMs);
    } else {
      controls.update();
      fpsCounter.setStepMs(0);
    }

    fpsCounter.tick(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  console.log('[vloxels] Milestone 5 running — press ▶ Play (or Tab) to play your level.');
}

main().catch((err) => {
  console.error('[vloxels] boot failed:', err);
  const el = document.getElementById('fps');
  if (el) el.textContent = 'boot failed — see console';
});
