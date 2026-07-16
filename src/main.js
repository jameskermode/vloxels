// main.js — bootstrap for Vloxels.
//
// M1: toolchain.  M2: level + instanced voxels.  M3: editor.
// M4: physics sandbox.  M5: play mode (player, movement, jump, camera).
// M6: spinners + rules — coins, kinematic blades (knockback!), carry-platforms,
//     water/goal sensors, coin tally + win screen.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { BLOCKS } from './blocks.js';
import { Level } from './level.js';
import { createRenderer, createScene, createCamera, handleResize } from './render/scene.js';
import { createVoxelRenderer } from './render/voxels.js';
import { createSpinners } from './render/spinners.js';
import { createWater } from './render/water.js';
import { waterSources, createWaterSim } from './water.js';
import { createPalette } from './edit/palette.js';
import { createEditor } from './edit/editor.js';
import {
  createFpsCounter,
  createLayerControl,
  createModeButton,
  createCoinCounter,
  createWinOverlay,
  createLevelToolbar,
  showCodeDialog,
} from './ui/hud.js';
import { createTouchControls } from './ui/touch.js';
import { load, save, createAutosaver, exportLevel, readLevelFile } from './storage.js';
import { shareEnabled, shareLevel, loadShared } from './share.js';
import { createPhysicsWorld } from './physics/world.js';
import { createVoxelBody } from './physics/voxelBody.js';
import { createSpinnerBodies } from './physics/spinnerBodies.js';
import { createDebugBalls } from './debugBalls.js';
import { createPlayer } from './play/player.js';
import { createFollowCamera } from './play/camera.js';
import { createRules } from './play/rules.js';
import { sfx } from './sfx.js';

// When a new version's service worker takes over (autoUpdate), reload once so
// PWA/browser users always get the latest without a manual hard-refresh. Only
// arms on return visits (a controller already exists), so first installs don't
// double-load.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function buildStarterLevel() {
  const level = new Level(CONFIG.grid.x, CONFIG.grid.y, CONFIG.grid.z, 'My Level');
  const S = BLOCKS;
  for (let x = 12; x <= 20; x++) {
    for (let z = 12; z <= 20; z++) {
      level.set(x, 0, z, S.solid.id);
    }
  }
  level.set(16, 1, 14, S.coin.id);
  level.set(13, 1, 13, S.start.id);
  level.set(19, 1, 19, S.goal.id);
  return level;
}

function spawnFor(level) {
  const s = level.find(BLOCKS.start.id);
  if (s) return { x: s[0] + 0.5, y: s[1] + 1.4, z: s[2] + 0.5 };
  return { x: CONFIG.grid.x / 2, y: CONFIG.grid.y + 1.5, z: CONFIG.grid.z / 2 };
}

function countCoins(level) {
  let n = 0;
  level.forEachBlock((x, y, z, id) => {
    if (id === BLOCKS.coin.id) n++;
  });
  return n;
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

  const followCam = createFollowCamera(camera);

  const level = load() || buildStarterLevel();
  const voxels = createVoxelRenderer(scene);
  const spinners = createSpinners(scene);
  const water = createWater(scene);
  // EDIT mode shows the water's initial state — just the source blocks. It
  // flows (animated) only in PLAY.
  const refreshWater = () => water.rebuild(waterSources(level));
  voxels.rebuild(level);
  spinners.rebuild(level);
  refreshWater();

  // Editor + UI.
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
      spinners.rebuild(lvl); // keep coin/blade/platform meshes in sync with edits
      refreshWater(); // re-flow water as terrain/sources change
    },
  });
  const layerControl = createLayerControl({
    onUp: () => editor.setLayer(editor.getLayer() + 1),
    onDown: () => editor.setLayer(editor.getLayer() - 1),
  });
  editor.onLayerChange = (y) => layerControl.setValue(y);
  layerControl.setValue(editor.getLayer());

  const coinCounter = createCoinCounter();
  const winOverlay = createWinOverlay({ onReplay: () => restart() });
  const touch = createTouchControls({ onJump: () => mode === 'play' && play.player.requestJump() });

  // Copy an imported/example level's data into our live level object (kept
  // const so the editor/renderers keep their reference), then refresh + save.
  function replaceLevel(obj) {
    let incoming;
    try {
      incoming = Level.fromJSON(obj);
    } catch (err) {
      alert('That file is not a Vloxels level.');
      return;
    }
    // Adopt the incoming level's size (levels can be any size). We mutate the
    // existing `level` object in place so the editor/renderers keep their ref.
    level.sizeX = incoming.sizeX;
    level.sizeY = incoming.sizeY;
    level.sizeZ = incoming.sizeZ;
    level.blocks = incoming.blocks;
    level.name = incoming.name;
    voxels.rebuild(level);
    spinners.rebuild(level);
    refreshWater();
    save(level);
  }

  // Load the bundled example manifest (best-effort; empty if unavailable).
  let examples = [];
  try {
    examples = await (await fetch('levels/index.json')).json();
  } catch {
    examples = [];
  }

  const toolbar = createLevelToolbar({
    onNew: () => {
      if (mode !== 'edit') return;
      level.blocks.set(buildStarterLevel().blocks);
      level.name = 'My Level';
      voxels.rebuild(level);
      spinners.rebuild(level);
      refreshWater();
      save(level);
    },
    onExport: () => exportLevel(level),
    onImport: (file) => readLevelFile(file).then(replaceLevel).catch(() => alert('Could not read that file.')),
    examples,
    onLoadExample: (file) =>
      fetch(`levels/${file}`)
        .then((r) => r.json())
        .then(replaceLevel)
        .catch(() => alert('Could not load that example.')),
    onShare: shareEnabled()
      ? async () => {
          try {
            const code = await shareLevel(level);
            showCodeDialog(code);
          } catch (e) {
            alert(`Share failed: ${e.message}`);
          }
        }
      : null,
    onLoadCode: shareEnabled()
      ? async () => {
          const code = prompt('Enter a level code:');
          if (!code) return;
          try {
            replaceLevel(await loadShared(code));
          } catch (e) {
            alert(e.message);
          }
        }
      : null,
  });

  // --- Mode management ------------------------------------------------------
  let mode = 'edit';
  let play = null;

  function enterPlay() {
    const snapshot = level.blocks.slice();
    const physics = createPhysicsWorld();
    const terrain = createVoxelBody(physics.world);
    terrain.rebuild(level); // solid + coin/goal sensors
    // Ticked water: starts at the sources and spreads/pours ring by ring. The
    // wetSet tracks which cells are currently water so the player can wade/sink.
    const waterSim = createWaterSim();
    const wet = waterSim.reset(level);
    const wetSet = new Set(wet.map((c) => c.join(',')));
    water.rebuild(wet);
    let waterAcc = 0;
    const spinBodies = createSpinnerBodies(physics.world);
    spinBodies.build(level);
    spinners.rebuild(level);
    spinners.linkBodies(spinBodies.entries);
    const balls = createDebugBalls(physics.world, scene);
    const player = createPlayer(physics.world, scene, spawnFor(level), (x, y, z) =>
      wetSet.has(`${x},${y},${z}`),
    );

    const totalCoins = countCoins(level);
    const rules = createRules({
      eventQueue: physics.eventQueue,
      playerColliderHandle: player.colliderHandle,
      terrain,
      spinners,
      hooks: {
        onRespawn: () => {
          player.respawn();
          sfx.respawn();
        },
        onCoin: (n) => {
          coinCounter.set(n);
          sfx.coin();
        },
        onWin: (n) => {
          winOverlay.show(n, totalCoins);
          sfx.win();
        },
      },
    });
    coinCounter.show(totalCoins);

    controls.enabled = false;
    editor.setActive(false);
    palette.el.style.display = 'none';
    layerControl.el.style.display = 'none';
    toolbar.el.style.display = 'none';
    touch.setEnabled(true);
    followCam.reset();
    followCam.snapTo(player.position());

    play = { physics, terrain, spinBodies, balls, player, rules, snapshot, waterSim, wet, wetSet, waterAcc };
    mode = 'play';
    modeButton.setMode('play');
    console.log('[vloxels] PLAY — WASD/arrows move, Space jumps, B drops a ball.');
  }

  function exitPlay() {
    const snapshot = play.snapshot;
    play.balls.clear();
    play.player.dispose();
    play.spinBodies.clear();
    play.physics.free();
    spinners.unlinkBodies();

    level.blocks.set(snapshot); // restore any coins collected during play
    play = null;
    mode = 'edit';

    voxels.rebuild(level);
    spinners.rebuild(level);
    refreshWater();
    coinCounter.hide();
    winOverlay.hide();
    controls.enabled = true;
    controls.target.set(CONFIG.grid.x / 2, 2, CONFIG.grid.z / 2);
    controls.update();
    editor.setActive(true);
    palette.el.style.display = '';
    layerControl.el.style.display = '';
    toolbar.el.style.display = '';
    touch.setEnabled(false);
    modeButton.setMode('edit');
    console.log('[vloxels] EDIT — build away. Autosaved.');
  }

  function toggleMode() {
    if (mode === 'edit') enterPlay();
    else exitPlay();
  }
  function restart() {
    winOverlay.hide();
    if (mode === 'play') exitPlay();
    enterPlay();
  }

  const modeButton = createModeButton({ onToggle: toggleMode });
  modeButton.setMode('edit');

  // --- Input (keyboard) -----------------------------------------------------
  const keys = new Set();
  let spaceArmed = true;
  let jumpHeld = false; // Space held down (for continuous swim-up in water)

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleMode();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      jumpHeld = true;
      if (mode === 'play' && spaceArmed) {
        play.player.requestJump();
        spaceArmed = false;
      }
      return;
    }
    if ((e.key === 'b' || e.key === 'B') && mode === 'play') {
      // Hidden Easter egg: rain bouncy balls near the player. Scatter them a
      // little so they don't stack in a perfect vertical column.
      const p = play.player.position();
      const jitter = () => (Math.random() - 0.5) * 1.2;
      play.balls.drop(p.x + jitter(), p.y + 4, p.z + jitter());
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceArmed = true;
      jumpHeld = false;
    }
    keys.delete(e.code);
  });

  function readMoveIntent() {
    let f = 0;
    let r = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
    // Touch joystick (analog) adds in too.
    const tv = touch.getVector();
    f += tv.y;
    r += tv.x;
    if (Math.abs(f) < 0.01 && Math.abs(r) < 0.01) return { x: 0, z: 0 };
    const { forward, right } = followCam.basis();
    const dir = new THREE.Vector3().addScaledVector(forward, f).addScaledVector(right, r);
    dir.y = 0;
    dir.normalize();
    return { x: dir.x, z: dir.z };
  }

  // --- Loop -----------------------------------------------------------------
  const fpsCounter = createFpsCounter();
  let last = performance.now();
  let elapsed = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, CONFIG.maxFrameDt);
    last = now;
    elapsed += dt;
    water.update(elapsed); // flowing-water ripple, alive in both modes

    if (mode === 'play') {
      const intent = readMoveIntent();
      play.player.setIntent(intent.x, intent.z);
      play.player.setSwimming(jumpHeld || touch.isJumpHeld());
      const stepMs = play.physics.step(dt, (fixedDt) => {
        play.player.fixedUpdate(fixedDt);
        play.spinBodies.update(fixedDt);
      });
      play.player.syncMesh();
      play.balls.sync();
      spinners.update(dt);

      // Advance the ticked water flood: spread a ring every tickSeconds, growing
      // the rendered water + the wetSet the player samples for wade/sink.
      play.waterAcc += dt;
      let flooded = false;
      let iters = 0;
      while (!play.waterSim.done && play.waterAcc >= CONFIG.water.tickSeconds && iters < 4) {
        play.waterAcc -= CONFIG.water.tickSeconds;
        iters++;
        const nw = play.waterSim.tick();
        for (const [x, y, z] of nw) {
          play.wet.push([x, y, z]);
          play.wetSet.add(`${x},${y},${z}`);
        }
        if (nw.length) flooded = true;
      }
      if (flooded) water.rebuild(play.wet);

      play.rules.drain();
      followCam.update(dt, play.player.position());
      fpsCounter.setStepMs(stepMs);
    } else {
      controls.update();
      spinners.update(dt); // cosmetic spin while editing
      fpsCounter.setStepMs(0);
    }

    fpsCounter.tick(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  console.log('[vloxels] Milestone 6 running — coins, blades, platforms, goal.');
}

main().catch((err) => {
  console.error('[vloxels] boot failed:', err);
  const el = document.getElementById('fps');
  if (el) el.textContent = 'boot failed — see console';
});
