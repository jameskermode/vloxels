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

export function createPlayer(world, scene, spawn, isWaterCell = () => false) {
  const spawnPos = { x: spawn.x, y: spawn.y, z: spawn.z };
  const REACH = P.halfHeight + P.radius; // capsule centre -> feet

  // --- Body + collider ------------------------------------------------------
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .lockRotations() // never tip over
      .setLinearDamping(P.linearDamping)
      .setCcdEnabled(true), // fast blades + thin colliders = tunnelling risk
  );
  const collider = world.createCollider(
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
  let swimHeld = false; // jump button currently held (continuous swim up)
  const down = new THREE.Vector3(0, -1, 0);
  const groundReach = P.halfHeight + P.radius + 0.12; // centre-to-just-below-feet

  // Cast down from the capsule centre; returns the body we're standing on (or
  // null if airborne). Excludes our own body so we don't hit ourselves.
  function groundBody() {
    const t = body.translation();
    const ray = new RAPIER.Ray(t, down);
    const hit = world.castRay(ray, groundReach, true, undefined, undefined, undefined, body);
    return hit ? hit.collider.parent() : null;
  }

  // Velocity of a (possibly rotating) body at the player's position, so a
  // spinning platform carries and turns the player: v = linvel + angvel × r.
  function carryVelocity(ground) {
    if (!ground || !ground.isKinematic()) return { x: 0, z: 0 };
    const t = body.translation();
    const c = ground.translation();
    const w = ground.angvel();
    const lin = ground.linvel();
    const rx = t.x - c.x;
    const ry = t.y - c.y;
    const rz = t.z - c.z;
    return {
      x: lin.x + (w.y * rz - w.z * ry),
      z: lin.z + (w.x * ry - w.y * rx),
    };
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

  // Called each frame by main: is the jump button currently held? (swim up)
  function setSwimming(held) {
    swimHeld = held;
  }

  // Is the given world point inside a water cell?
  function wetAt(x, y, z) {
    return isWaterCell(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  // Called once per FIXED physics step (before world.step).
  function fixedUpdate(dt) {
    const ground = groundBody();
    const grounded = ground !== null;
    coyote = grounded ? P.coyoteTime : Math.max(0, coyote - dt);
    if (jumpBuffer > 0) jumpBuffer = Math.max(0, jumpBuffer - dt);

    const t = body.translation();
    const feetY = t.y - REACH;
    // In water if our feet or our middle are inside a water cell.
    const inWater = wetAt(t.x, feetY + 0.1, t.z) || wetAt(t.x, t.y, t.z);
    // "Deep": water covers us and we're not standing on solid ground.
    const deep = inWater && !grounded;

    const v = body.linvel();
    // Target = the moving surface's velocity + our own input. On a spinning
    // platform with no input this makes us track the platform (carried); on
    // static ground carry is zero so we just stop. Water halves our speed.
    const carry = carryVelocity(ground);
    const speedMult = inWater ? P.waterSpeedMult : 1;
    const targetX = carry.x + intent.x * P.speed * speedMult;
    const targetZ = carry.z + intent.z * P.speed * speedMult;

    // How fast are we moving RELATIVE to the surface we're on? If that's much
    // faster than we can walk, we've been knocked (e.g. by blades) — so ease
    // off the steering and let the knockback fling us, instead of stomping it.
    const relSpeed = Math.hypot(v.x - carry.x, v.z - carry.z);
    const knocked = grounded && relSpeed > P.speed * 1.4;
    let control = grounded ? (knocked ? P.airControl : P.groundControl) : P.airControl;
    if (inWater) control = P.waterControl;

    let ny = v.y;
    if (inWater) {
      // Swim UP continuously while the jump button is held (or freshly tapped),
      // so you can rise and climb out onto a ledge; otherwise sink gently.
      if (swimHeld || jumpBuffer > 0) {
        ny = P.swimSpeed;
        jumpBuffer = 0;
      } else if (deep) {
        ny = lerp(v.y, P.waterSink, 0.15); // water drag: gentle sink, not a plummet
      }
    } else if (jumpBuffer > 0 && coyote > 0) {
      ny = P.jumpSpeed; // ordinary jump on land
      jumpBuffer = 0;
      coyote = 0;
    }

    body.setLinvel({ x: lerp(v.x, targetX, control), y: ny, z: lerp(v.z, targetZ, control) }, true);

    // Soft bottom: don't sink out through the void below a pool — rest on the
    // lowest water cell. This is also why water never forces a respawn.
    if (deep) {
      const cx = Math.floor(t.x);
      const cz = Math.floor(t.z);
      let yMin = Math.floor(feetY + 0.05);
      if (isWaterCell(cx, yMin, cz)) {
        while (isWaterCell(cx, yMin - 1, cz)) yMin--;
        if (feetY < yMin) {
          body.setTranslation({ x: t.x, y: yMin + REACH, z: t.z }, true);
          const vv = body.linvel();
          if (vv.y < 0) body.setLinvel({ x: vv.x, y: 0, z: vv.z }, true);
        }
      }
    }

    // Fell off the world (not via water) → respawn.
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

  return {
    body,
    mesh,
    colliderHandle: collider.handle,
    setIntent,
    requestJump,
    setSwimming,
    fixedUpdate,
    respawn,
    syncMesh,
    position,
    dispose,
  };
}
