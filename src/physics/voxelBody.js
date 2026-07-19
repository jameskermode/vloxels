// physics/voxelBody.js — turns the solid terrain into ONE static rigid body
// with a small number of merged box colliders.
//
// Greedy RUN MERGING (1D): for each (y, z) row we walk along x and merge
// consecutive solid voxels into a single long cuboid collider. This is ~15
// lines, easy to explain, and typically cuts the collider count 5-10x versus
// one box per voxel — which keeps us comfortably under the ~500-collider
// budget the Pi needs. (Full 3D greedy meshing is deliberately out of scope.)

import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';
import { blockById } from '../blocks.js';

const TERRAIN_FRICTION = 0.8;
const TERRAIN_RESTITUTION = 0.2; // a little bounce so the debug ball is lively
const SENSOR_HALF = 0.4; // shrunk sensor cuboid (0.8³) so you must really touch it

export function createVoxelBody(world) {
  let body = null;
  let colliderCount = 0;
  // collider handle -> { blockKey, cell:[x,y,z], collider } for the non-solid
  // special blocks (water/coin/goal). rules.js reads this to react to overlaps.
  const sensors = new Map();

  function remove() {
    if (body) {
      world.removeRigidBody(body); // also removes all its colliders
      body = null;
      colliderCount = 0;
      sensors.clear();
    }
  }

  // (Re)build the terrain body from the current level. Returns collider count.
  function rebuild(level, movingCells) {
    remove();
    body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    colliderCount = 0;

    const solidAt = (x, y, z) =>
      level.isSolid(x, y, z) && !(movingCells && movingCells.has(`${x},${y},${z}`));

    for (let z = 0; z < level.sizeZ; z++) {
      for (let y = 0; y < level.sizeY; y++) {
        let x = 0;
        while (x < level.sizeX) {
          if (!solidAt(x, y, z)) {
            x++;
            continue;
          }
          // Found the start of a run of solid voxels; extend it along x.
          const runStart = x;
          while (x < level.sizeX && solidAt(x, y, z)) x++;
          const length = x - runStart;

          // One cuboid covering the whole run. Rapier cuboids take HALF extents.
          const hx = length / 2;
          const desc = RAPIER.ColliderDesc.cuboid(hx, 0.5, 0.5)
            .setTranslation(runStart + hx, y + 0.5, z + 0.5)
            .setFriction(TERRAIN_FRICTION)
            .setRestitution(TERRAIN_RESTITUTION);
          world.createCollider(desc, body);
          colliderCount++;
        }
      }
    }

    // Sensor colliders fire intersection events that rules.js turns into coin
    // pickups / winning. One shrunk cuboid each, attached to the static body.
    const addSensor = (blockKey, x, y, z) => {
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(SENSOR_HALF, SENSOR_HALF, SENSOR_HALF)
          .setTranslation(x + 0.5, y + 0.5, z + 0.5)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      sensors.set(collider.handle, { blockKey, cell: [x, y, z], collider });
    };

    // Coins and the goal come from placed blocks. (Water is not a sensor — the
    // player samples the water field directly for wade/sink physics.)
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (def && (def.collect || def.wins || def.wear)) addSensor(def.key, x, y, z);
    });

    console.log(
      `[vloxels] terrain colliders: ${colliderCount}, sensors: ${sensors.size}` +
        (colliderCount > 500 ? '  ⚠️ over the ~500 budget — optimise!' : ''),
    );
    return colliderCount;
  }

  // Remove a single sensor (used when a coin is collected).
  function removeSensor(handle) {
    const info = sensors.get(handle);
    if (!info) return;
    world.removeCollider(info.collider, false);
    sensors.delete(handle);
  }

  return {
    rebuild,
    remove,
    removeSensor,
    get sensors() {
      return sensors;
    },
    get body() {
      return body;
    },
    get colliderCount() {
      return colliderCount;
    },
  };
}
