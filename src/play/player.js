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
import { BLOCKS } from '../blocks.js';
import { makeFlippersMesh, makeGliderMesh } from '../render/spinners.js';

const P = CONFIG.player;
const lerp = (a, b, t) => a + (b - a) * t;

export function createPlayer(world, scene, spawn, isWaterCell = () => false, onGliderDrop = () => {}) {
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

  // Gear worn on the player. Mutually exclusive: one slot, latest pickup wins.
  const wornFins = makeFlippersMesh(BLOCKS.scuba.color);
  wornFins.position.set(0, -REACH + 0.05, 0); // scuba fins at the feet
  wornFins.rotation.x = 0.5;
  wornFins.visible = false;
  mesh.add(wornFins);

  const gliderRig = makeGliderMesh(1); // green sail overhead + grey jetpacks on the back
  gliderRig.visible = false;
  mesh.add(gliderRig);

  let gear = null; // null | 'scuba' | 'fly'
  let lastGroundedPos = { x: spawn.x, y: spawn.y, z: spawn.z }; // safe drop spot over a pit
  let prevFlyPos = null; // position at the previous fly step (crash detection)
  let prevCmdVelH = 0; // horizontal speed we drove last fly step (crash detection)

  // --- Controller state -----------------------------------------------------
  const intent = { x: 0, z: 0 }; // desired horizontal move direction (unit-ish)
  let jumpBuffer = 0; // seconds a recent jump press stays "armed"
  let coyote = 0; // seconds of grounded-grace remaining
  let swimHeld = false; // jump button currently held (continuous swim up)
  let jumpRising = false; // true while ascending a jump WE started (so we don't
  //                         mistake it for a platform shoving us upward)
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

  // Put on gear (mutually exclusive). Scuba lasts until the level ends; the
  // glider until you crash or die (see respawn / flight, added later).
  function setWearing(kind) {
    gear = kind;
    wornFins.visible = kind === 'scuba';
    gliderRig.visible = kind === 'fly';
  }

  // Is the given world point inside a water cell?
  function wetAt(x, y, z) {
    return isWaterCell(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  // The contiguous water column the player is standing in at (cx,cz), or null.
  // Returns the world y of its surface (top face) and its bottom (lower face),
  // seeded from whichever of the player's centre/feet is actually in water.
  function waterColumn(cx, cz, centerY, feetY) {
    let seed = Math.floor(centerY);
    if (!isWaterCell(cx, seed, cz)) seed = Math.floor(feetY + 0.05);
    if (!isWaterCell(cx, seed, cz)) return null;
    let top = seed;
    let bot = seed;
    while (isWaterCell(cx, top + 1, cz)) top++;
    while (isWaterCell(cx, bot - 1, cz)) bot--;
    return { surfaceY: top + 1, bottomY: bot };
  }

  // Drop the glider (crash or death): clear flight and tell main where it fell.
  function crash(pos) {
    gear = null;
    gliderRig.visible = false;
    prevFlyPos = null;
    onGliderDrop({ x: pos.x, y: pos.y, z: pos.z });
  }

  // Flight: hold Space (swimHeld) for zippy thrust up, release to glide down
  // gently; steer with intent. If we commanded a real sideways move but got
  // blocked by a block, we hit a wall side-on ⇒ crash. Called instead of the
  // normal branch while gear === 'fly'.
  function flyUpdate(dt, t) {
    if (prevFlyPos) {
      const movedH = Math.hypot(t.x - prevFlyPos.x, t.z - prevFlyPos.z);
      if (prevCmdVelH >= P.fly.crashSpeed && movedH < (prevCmdVelH * dt) / 3) {
        crash(t);
        return;
      }
    }
    const v = body.linvel();
    const nvx = lerp(v.x, intent.x * P.fly.speed, P.fly.control);
    const nvz = lerp(v.z, intent.z * P.fly.speed, P.fly.control);
    const ny = lerp(v.y, swimHeld ? P.fly.rise : P.fly.sink, P.fly.riseEase);
    body.setLinvel({ x: nvx, y: ny, z: nvz }, true);
    prevFlyPos = { x: t.x, y: t.y, z: t.z };
    prevCmdVelH = Math.hypot(nvx, nvz);
    if (body.translation().y < P.fallKillY) respawn(); // fell out ⇒ respawn (drops glider)
  }

  // Called once per FIXED physics step (before world.step).
  function fixedUpdate(dt) {
    const t0 = body.translation();
    const ground = groundBody();
    if (ground) lastGroundedPos = { x: t0.x, y: t0.y, z: t0.z };
    if (gear === 'fly') { flyUpdate(dt, t0); return; }
    const grounded = ground !== null;
    coyote = grounded ? P.coyoteTime : Math.max(0, coyote - dt);
    if (jumpBuffer > 0) jumpBuffer = Math.max(0, jumpBuffer - dt);

    const t = body.translation();
    const cx = Math.floor(t.x);
    const cz = Math.floor(t.z);
    const feetY = t.y - REACH;
    // In water if our feet or our middle are inside a water cell.
    const inWater = wetAt(t.x, feetY + 0.1, t.z) || wetAt(t.x, t.y, t.z);
    // "Deep": water covers us and we're not standing on solid ground.
    const deep = inWater && !grounded;
    const col = inWater ? waterColumn(cx, cz, t.y, feetY) : null;

    const v = body.linvel();
    // Target = the moving surface's velocity + our own input. On a spinning
    // platform with no input this makes us track the platform (carried); on
    // static ground carry is zero so we just stop. Water halves our speed.
    const carry = carryVelocity(ground);
    const speedMult = inWater ? (gear === 'scuba' ? P.scubaSpeedMult : P.waterSpeedMult) : 1;
    const targetX = carry.x + intent.x * P.speed * speedMult;
    const targetZ = carry.z + intent.z * P.speed * speedMult;

    // How fast are we moving RELATIVE to the surface we're on? If that's much
    // faster than we can walk, we've been knocked (e.g. by blades) — so ease
    // off the steering and let the knockback fling us, instead of stomping it.
    const relSpeed = Math.hypot(v.x - carry.x, v.z - carry.z);
    const knocked = grounded && relSpeed > P.speed * 1.4;
    let control = grounded ? (knocked ? P.airControl : P.groundControl) : P.airControl;
    if (inWater) control = P.waterControl;

    // Standing on something (or already falling) ends any jump-ascent we were
    // tracking; a fresh jump below re-arms it.
    if (grounded || v.y <= 0) jumpRising = false;

    let ny = v.y;
    if (deep) {
      // Treading deep water (not standing on anything).
      if (jumpBuffer > 0) {
        // A deliberate TAP hops you up — climb out onto a ledge, or up a
        // waterfall crest. (Discrete, so holding can't walk you on top.)
        ny = P.swimJump;
        jumpBuffer = 0;
      } else if (swimHeld) {
        // Holding swims UP only until your HEAD reaches the surface, so you
        // tread neck-deep and can't stand on top of the water.
        const toSurface = col ? col.surfaceY - (t.y + REACH) : 0; // >0 = head under
        const swimMax = gear === 'scuba' ? P.scubaSwimSpeed : P.swimSpeed;
        ny = Math.max(0, Math.min(swimMax, toSurface * P.swimApproach));
      } else {
        ny = lerp(v.y, gear === 'scuba' ? P.scubaSink : P.waterSink, 0.15); // scuba hovers; else gentle sink
      }
    } else if (jumpBuffer > 0 && coyote > 0) {
      // Ordinary jump on land — and on a solid floor under shallow water, so you
      // just hop out of a puddle rather than hovering on it.
      ny = P.jumpSpeed;
      jumpBuffer = 0;
      coyote = 0;
      jumpRising = true;
    }

    // Anti-glue: a moving platform (a rising lift) that we press our SIDE into
    // will, via contact, try to drag us upward with it — so you can get "stuck"
    // riding up the face of an elevator you walked into. The tell is: we're in
    // the air (not standing on it) yet gaining height we didn't jump for. When
    // that happens, cancel the unearned climb so we simply slide off instead of
    // being carried up. Riding ON TOP is grounded, so it's never touched; a jump
    // we started (jumpRising) is allowed to rise; blade knockback is horizontal.
    const shoved = !grounded && !inWater && !jumpRising && ny > 0;
    if (shoved) ny = 0;

    body.setLinvel({ x: lerp(v.x, targetX, control), y: ny, z: lerp(v.z, targetZ, control) }, true);

    // Soft bottom: don't sink out through the void below a pool — rest on the
    // bottom of the water column. This is also why water never forces a respawn.
    if (deep && col && feetY < col.bottomY) {
      body.setTranslation({ x: t.x, y: col.bottomY + REACH, z: t.z }, true);
      const vv = body.linvel();
      if (vv.y < 0) body.setLinvel({ x: vv.x, y: 0, z: vv.z }, true);
    }

    // Fell off the world (not via water) → respawn.
    if (body.translation().y < P.fallKillY) respawn();
  }

  function respawn() {
    if (gear === 'fly') {
      gear = null;
      gliderRig.visible = false;
      prevFlyPos = null;
      onGliderDrop({ ...lastGroundedPos }); // drop at the last real floor, never lost
    }
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
    wornFins.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    gliderRig.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    world.removeRigidBody(body);
  }

  return {
    body,
    mesh,
    colliderHandle: collider.handle,
    setIntent,
    requestJump,
    setSwimming,
    setWearing,
    get gear() {
      return gear;
    },
    get wearing() {
      return gear === 'scuba';
    },
    fixedUpdate,
    respawn,
    syncMesh,
    position,
    dispose,
  };
}
