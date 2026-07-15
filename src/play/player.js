// play/player.js — the player: a dynamic capsule rigid body plus a movement
// controller. The controller runs INSIDE the fixed physics step so movement is
// framerate-independent.
//
// Design notes for tinkering (all numbers live in config.js under `player`):
//   - We steer by BLENDING the horizontal velocity toward a target (lerp),
//     never by stomping it. Full control on the ground, gentle control in the
//     air — so blade knockback and (M6) platform carry survive.
//   - Grounded is a short downward ray from the capsule centre, excluding the
//     player's own body.
//   - Jump has coyote time (jump just after leaving a ledge) and a jump buffer
//     (press just before landing) — cheap, and makes it feel great.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';

const P = CONFIG.player;
const lerp = (a, b, t) => a + (b - a) * t;

export function createPlayer(world, scene, spawn) {
  const spawnPos = { x: spawn.x, y: spawn.y, z: spawn.z };

  // --- Body + collider ------------------------------------------------------
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .lockRotations() // never tip over
      .setLinearDamping(P.linearDamping)
      .setCcdEnabled(true), // fast blades + thin colliders = tunnelling risk
  );
  world.createCollider(
    RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius)
      .setFriction(P.friction)
      .setRestitution(0),
    body,
  );

  // --- Mesh (render follows physics) ----------------------------------------
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(P.radius, P.halfHeight * 2, 6, 12),
    new THREE.MeshLambertMaterial({ color: 0xff9a3c }),
  );
  scene.add(mesh);

  // --- Controller state -----------------------------------------------------
  const intent = { x: 0, z: 0 }; // desired horizontal move direction (unit-ish)
  let jumpBuffer = 0; // seconds a recent jump press stays "armed"
  let coyote = 0; // seconds of grounded-grace remaining
  const down = new THREE.Vector3(0, -1, 0);
  const groundReach = P.halfHeight + P.radius + 0.12; // centre-to-just-below-feet

  function isGrounded() {
    const t = body.translation();
    const ray = new RAPIER.Ray(t, down);
    // solid=true; exclude our own body (7th arg) so we don't hit ourselves.
    const hit = world.castRay(ray, groundReach, true, undefined, undefined, undefined, body);
    return hit !== null;
  }

  // Called each render frame by main: set movement intent (world-space unit dir).
  function setIntent(x, z) {
    intent.x = x;
    intent.z = z;
  }

  // Called each render frame by main: arm a jump (buffered).
  function requestJump() {
    jumpBuffer = P.jumpBuffer;
  }

  // Called once per FIXED physics step (before world.step).
  function fixedUpdate(dt) {
    const grounded = isGrounded();
    coyote = grounded ? P.coyoteTime : Math.max(0, coyote - dt);
    if (jumpBuffer > 0) jumpBuffer = Math.max(0, jumpBuffer - dt);

    const v = body.linvel();
    const control = grounded ? P.groundControl : P.airControl;
    const targetX = intent.x * P.speed;
    const targetZ = intent.z * P.speed;

    let ny = v.y;
    // Jump: buffered press + (grounded or within coyote window).
    if (jumpBuffer > 0 && coyote > 0) {
      ny = P.jumpSpeed;
      jumpBuffer = 0;
      coyote = 0;
    }

    body.setLinvel({ x: lerp(v.x, targetX, control), y: ny, z: lerp(v.z, targetZ, control) }, true);

    // Fell off the world → respawn.
    if (body.translation().y < P.fallKillY) respawn();
  }

  function respawn() {
    body.setTranslation(spawnPos, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    jumpBuffer = 0;
    coyote = 0;
  }

  function syncMesh() {
    const t = body.translation();
    const r = body.rotation();
    mesh.position.set(t.x, t.y, t.z);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  function position() {
    return body.translation();
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    world.removeRigidBody(body);
  }

  return { body, mesh, setIntent, requestJump, fixedUpdate, respawn, syncMesh, position, dispose };
}
