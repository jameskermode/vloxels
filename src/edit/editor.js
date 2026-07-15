// edit/editor.js — the level editor.
//
// Interaction (works with mouse OR touch, via pointer events):
//   - TAP (no drag): place the selected block. On a voxel face it goes in the
//     adjacent cell (Minecraft-style); on empty space it lands on the current
//     working layer.
//   - RIGHT-CLICK or LONG-PRESS: remove the block under the pointer.
//   - DRAG: left-drag orbits the camera (OrbitControls) — placing only happens
//     on a real tap, so the two never fight.
//   - [ / ] (or the on-screen ▲/▼): move the working layer up/down, so you can
//     build in mid-air.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { blockById } from '../blocks.js';

const TAP_MOVE_PX = 6; // movement beyond this = a drag, not a tap
const LONG_PRESS_MS = 500; // hold this long (without moving) = remove

export function createEditor({ renderer, camera, level, voxels, getSelectedId, onChange }) {
  const dom = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // working-layer plane
  const hitPoint = new THREE.Vector3();

  let workingLayer = 0;
  let enabled = true; // false in PLAY mode: ignore all editing input

  // --- Placement highlight (wireframe cube where the next block will go) -----
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  highlight.visible = false;
  voxels.group.parent.add(highlight); // add to the scene

  // --- A translucent grid showing the current working layer -----------------
  const layerGrid = new THREE.GridHelper(
    Math.max(CONFIG.grid.x, CONFIG.grid.z),
    Math.max(CONFIG.grid.x, CONFIG.grid.z),
    0xffff66,
    0xffff66,
  );
  layerGrid.material.transparent = true;
  layerGrid.material.opacity = 0.25;
  layerGrid.position.set(CONFIG.grid.x / 2, 0, CONFIG.grid.z / 2);
  voxels.group.parent.add(layerGrid);

  function updateLayerGrid() {
    layerGrid.position.y = workingLayer + 0.001;
  }

  // --- Picking ---------------------------------------------------------------

  function setPointer(e) {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function cellOf(v) {
    return [Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)];
  }

  // Returns { placeCell:[x,y,z], removeCell:[x,y,z]|null } or null if nothing hit.
  function pick() {
    raycaster.setFromCamera(pointer, camera);

    let best = null;

    // 1) Existing voxels (instanced meshes under the voxel group).
    const hits = raycaster.intersectObjects(voxels.group.children, false);
    if (hits.length) {
      const h = hits[0];
      const n = h.face.normal; // world == local (no rotation on the meshes)
      const remove = cellOf(new THREE.Vector3().copy(h.point).addScaledVector(n, -0.5));
      const place = cellOf(new THREE.Vector3().copy(h.point).addScaledVector(n, 0.5));
      best = { dist: h.distance, placeCell: place, removeCell: remove };
    }

    // 2) The working-layer plane (lets you place blocks in mid-air / on ground).
    plane.constant = -workingLayer;
    if (raycaster.ray.intersectPlane(plane, hitPoint)) {
      const dist = raycaster.ray.origin.distanceTo(hitPoint);
      if (!best || dist < best.dist) {
        const cell = [Math.floor(hitPoint.x), workingLayer, Math.floor(hitPoint.z)];
        // On the plane, "remove" targets whatever block sits in that cell.
        const removeCell = level.get(cell[0], cell[1], cell[2]) ? cell : null;
        best = { dist, placeCell: cell, removeCell };
      }
    }

    if (!best) return null;
    // Keep the hit if we could either place OR remove somewhere valid — an
    // edge voxel may have an out-of-bounds place cell but is still removable.
    const placeOk = level.inBounds(...best.placeCell);
    const removeOk = best.removeCell && level.inBounds(...best.removeCell);
    return placeOk || removeOk ? best : null;
  }

  function updateHighlight() {
    const p = pick();
    if (!p || !level.inBounds(...p.placeCell)) {
      highlight.visible = false;
      return;
    }
    const [x, y, z] = p.placeCell;
    highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
    highlight.visible = true;
  }

  // --- Actions ---------------------------------------------------------------

  function place() {
    const p = pick();
    if (!p) return;
    const id = getSelectedId();
    const def = blockById(id);
    const [x, y, z] = p.placeCell;
    if (!level.inBounds(x, y, z)) return;

    // Unique blocks (start, goal): remove any existing one first.
    if (def && def.unique) {
      const existing = level.find(id);
      if (existing) level.set(existing[0], existing[1], existing[2], 0);
    }

    level.set(x, y, z, id);
    changed();
  }

  function remove() {
    const p = pick();
    if (!p || !p.removeCell) return;
    const [x, y, z] = p.removeCell;
    if (!level.get(x, y, z)) return;
    level.set(x, y, z, 0);
    changed();
  }

  function changed() {
    voxels.rebuild(level);
    updateHighlight();
    if (onChange) onChange(level);
  }

  // --- Working layer ---------------------------------------------------------

  let onLayerChange = null;
  function setLayer(y) {
    workingLayer = Math.max(0, Math.min(CONFIG.grid.y - 1, y));
    updateLayerGrid();
    updateHighlight();
    if (onLayerChange) onLayerChange(workingLayer);
  }

  // --- Pointer handling (tap vs drag vs long-press) --------------------------

  let down = null; // { x, y, button, time, timer }

  function onPointerDown(e) {
    if (!enabled) return; // PLAY mode: no editing
    if (e.target !== dom) return; // ignore taps on palette/HUD overlays
    setPointer(e);
    down = { x: e.clientX, y: e.clientY, button: e.button, moved: false, timer: null };
    // Long-press to remove (touch / left button held still).
    if (e.button === 0) {
      down.timer = setTimeout(() => {
        if (down && !down.moved) {
          remove();
          down = null; // consumed; the following tap won't also place
        }
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e) {
    if (!enabled) return;
    setPointer(e);
    if (down) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_MOVE_PX) {
        down.moved = true;
        clearTimeout(down.timer);
      }
    } else {
      updateHighlight();
    }
  }

  function onPointerUp(e) {
    if (!down) return;
    clearTimeout(down.timer);
    if (!down.moved) {
      if (down.button === 2) remove();
      else if (down.button === 0) place();
    }
    down = null;
    setPointer(e);
    updateHighlight();
  }

  function onContextMenu(e) {
    e.preventDefault(); // right-click removes instead of opening a menu
  }

  function onKeyDown(e) {
    if (!enabled) return;
    if (e.key === '[') setLayer(workingLayer - 1);
    else if (e.key === ']') setLayer(workingLayer + 1);
  }

  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);

  updateLayerGrid();

  return {
    getLayer: () => workingLayer,
    setLayer,
    set onLayerChange(fn) {
      onLayerChange = fn;
    },
    // Enable/disable the whole editor (PLAY mode disables it and hides helpers).
    setActive(active) {
      enabled = active;
      highlight.visible = false;
      layerGrid.visible = active;
    },
    refresh: updateHighlight,
  };
}
