// render/scene.js — builds the Three.js scene, renderer, camera, lights and a
// ground plane. Deliberately minimal for the Pi: no shadow maps, no
// postprocessing, low pixel ratio, antialias off.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setClearColor(CONFIG.skyColor, 1);
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.skyColor);

  // Two lights only — a hemisphere fill + a single directional "sun".
  const hemi = new THREE.HemisphereLight(
    CONFIG.hemiSkyColor,
    CONFIG.hemiGroundColor,
    CONFIG.hemiIntensity,
  );
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(CONFIG.dirColor, CONFIG.dirIntensity);
  dir.position.set(...CONFIG.dirPosition);
  scene.add(dir);

  // A big flat ground plane sitting at y = 0, centred under the grid.
  const groundMat = new THREE.MeshLambertMaterial({ color: CONFIG.groundColor });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CONFIG.grid.x / 2, 0, CONFIG.grid.z / 2);
  scene.add(ground);

  // A subtle grid overlay so you can see where voxels will snap.
  const grid = new THREE.GridHelper(
    Math.max(CONFIG.grid.x, CONFIG.grid.z),
    Math.max(CONFIG.grid.x, CONFIG.grid.z),
    0x335533,
    0x2a442a,
  );
  grid.position.set(CONFIG.grid.x / 2, 0.01, CONFIG.grid.z / 2);
  scene.add(grid);

  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  // A pleasant default overview of the grid for Milestone 1.
  camera.position.set(CONFIG.grid.x / 2, 12, CONFIG.grid.z + 8);
  camera.lookAt(CONFIG.grid.x / 2, 2, CONFIG.grid.z / 2);
  return camera;
}

// Keep the renderer + camera in sync with the window size.
export function handleResize(renderer, camera) {
  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);
  onResize();
  return onResize;
}
