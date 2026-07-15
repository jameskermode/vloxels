// play/camera.js — third-person follow camera for PLAY mode.
//
// It sits at a fixed offset behind and above the player and eases toward the
// player with exponential damping (framerate-independent). A fixed angle keeps
// things simple on touch: "up" on screen is always the same world direction,
// so camera-relative movement is predictable for a 9-year-old. No orbit
// controls in play mode.

import * as THREE from 'three';

const OFFSET = new THREE.Vector3(0, 7, 11); // behind (+z) and above the player
const LOOK_UP = new THREE.Vector3(0, 1.2, 0); // aim a bit above the feet
const LAMBDA = 8; // higher = snappier follow

export function createFollowCamera(camera) {
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let initialised = false;

  function snapTo(target) {
    camPos.copy(target).add(OFFSET);
    lookAt.copy(target).add(LOOK_UP);
    camera.position.copy(camPos);
    camera.lookAt(lookAt);
    initialised = true;
  }

  // target: {x,y,z} player position. dt: real frame seconds.
  function update(dt, target) {
    const p = new THREE.Vector3(target.x, target.y, target.z);
    if (!initialised) {
      snapTo(p);
      return;
    }
    const t = 1 - Math.exp(-LAMBDA * dt); // exponential damping factor
    camPos.lerp(p.clone().add(OFFSET), t);
    lookAt.lerp(p.clone().add(LOOK_UP), t);
    camera.position.copy(camPos);
    camera.lookAt(lookAt);
  }

  // The horizontal forward/right the camera is looking along — used to make
  // player movement camera-relative.
  function basis() {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    return { forward, right };
  }

  return { update, snapTo, basis, reset: () => (initialised = false) };
}
