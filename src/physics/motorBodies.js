// physics/motorBodies.js — one kinematic body per motor assembly. Each cell of
// the assembly (motor hub + arms) gets a cuboid collider at its offset from the
// motor centre; the body spins about y each fixed step. The player's existing
// carry/knockback handling does the rest.

import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';

function quatY(angle) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

// Triangle wave: offset goes 0 -> distance -> 0 -> ... as `phase` grows.
function pingpong(phase, distance) {
  if (distance <= 0) return 0;
  const period = 2 * distance;
  const t = ((phase % period) + period) % period;
  return t <= distance ? t : period - t;
}

export function createMotorBodies(world) {
  const entries = []; // { body, angle, speed }

  function build(assemblies) {
    clear();
    for (const asm of assemblies) {
      const [cx, cy, cz] = asm.motorCell;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cx + 0.5, cy + 0.5, cz + 0.5),
      );
      for (const [x, y, z] of asm.cells) {
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
            .setTranslation(x - cx, y - cy, z - cz) // local offset from the motor centre
            .setFriction(CONFIG.spin.platformFriction)
            .setRestitution(0.1),
          body,
        );
      }
      if (asm.kind === 'linear') {
        const speed = asm.speed === 'fast' ? CONFIG.motor.linearFastSpeed : CONFIG.motor.linearSlowSpeed;
        entries.push({
          body,
          kind: 'linear',
          center: { x: cx + 0.5, y: cy + 0.5, z: cz + 0.5 },
          axis: asm.axis,
          distance: asm.distance,
          speed,
          phase: 0,
        });
      } else {
        const speed = asm.speed === 'fast' ? CONFIG.motor.fastSpeed : CONFIG.motor.slowSpeed;
        entries.push({ body, kind: 'rotary', angle: 0, speed });
      }
    }
    return entries;
  }

  // Advance every motor's rotation. Call once per FIXED physics step.
  function update(dt) {
    for (const e of entries) {
      if (e.kind === 'linear') {
        e.phase += e.speed * dt;
        const o = pingpong(e.phase, e.distance);
        e.body.setNextKinematicTranslation({
          x: e.center.x + e.axis[0] * o,
          y: e.center.y + e.axis[1] * o,
          z: e.center.z + e.axis[2] * o,
        });
      } else {
        e.angle += e.speed * dt;
        e.body.setNextKinematicRotation(quatY(e.angle));
      }
    }
  }

  function clear() {
    for (const e of entries) world.removeRigidBody(e.body);
    entries.length = 0;
  }

  return { build, update, clear, get entries() { return entries; } };
}
