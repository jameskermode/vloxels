// physics/spinnerBodies.js — the moving physics for the signature spinners.
//
//   blades   — a kinematic body with two crossed cuboid colliders, spun fast
//              about y. Because it's a REAL kinematic body, the solver imparts
//              genuine knockback to the player on contact (the whole point of
//              using Rapier).
//   platform — a kinematic body with one flat cuboid, spun slowly about y. The
//              player standing on it is carried & rotated by contact friction
//              (friction set high), handled in player.js.
//
// Coins are NOT here: they're pure sensors (built in voxelBody.js) with a
// cosmetic, mesh-only spin (render/spinners.js).
//
// Rotation is advanced once per FIXED step via setNextKinematicRotation(), so
// the kinematic velocity the solver sees is correct and stable.

import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';
import { blockById } from '../blocks.js';

const S = CONFIG.spin;

function quatY(angle) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

export function createSpinnerBodies(world) {
  const entries = []; // { cell:[x,y,z], style, body, angle, speed }

  function build(level) {
    clear();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (!def || !def.spinner || def.spinner === 'coin') return; // coins are sensors

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x + 0.5, y + 0.5, z + 0.5),
      );

      if (def.spinner === 'blades') {
        // Two crossed long boxes (half extents).
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.8, 0.1, 0.125).setFriction(0.4).setRestitution(0.1),
          body,
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.125, 0.1, 0.8).setFriction(0.4).setRestitution(0.1),
          body,
        );
        entries.push({ cell: [x, y, z], style: 'blades', body, angle: 0, speed: S.bladeSpeed });
      } else if (def.spinner === 'platform') {
        // One flat square (2 x 0.25 x 2 units). High friction so it carries you.
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(1.0, 0.125, 1.0)
            .setFriction(S.platformFriction)
            .setRestitution(0),
          body,
        );
        entries.push({ cell: [x, y, z], style: 'platform', body, angle: 0, speed: S.platformSpeed });
      }
    });
    return entries;
  }

  // Advance each spinner's rotation. Call once per FIXED physics step.
  function update(dt) {
    for (const e of entries) {
      e.angle += e.speed * dt;
      e.body.setNextKinematicRotation(quatY(e.angle));
    }
  }

  function clear() {
    for (const e of entries) world.removeRigidBody(e.body);
    entries.length = 0;
  }

  return {
    build,
    update,
    clear,
    get entries() {
      return entries;
    },
  };
}
