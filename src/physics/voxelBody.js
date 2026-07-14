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

const TERRAIN_FRICTION = 0.8;
const TERRAIN_RESTITUTION = 0.2; // a little bounce so the debug ball is lively

export function createVoxelBody(world) {
  let body = null;
  let colliderCount = 0;

  function remove() {
    if (body) {
      world.removeRigidBody(body); // also removes all its colliders
      body = null;
      colliderCount = 0;
    }
  }

  // (Re)build the terrain body from the current level. Returns collider count.
  function rebuild(level) {
    remove();
    body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    colliderCount = 0;

    for (let z = 0; z < level.sizeZ; z++) {
      for (let y = 0; y < level.sizeY; y++) {
        let x = 0;
        while (x < level.sizeX) {
          if (!level.isSolid(x, y, z)) {
            x++;
            continue;
          }
          // Found the start of a run of solid voxels; extend it along x.
          const runStart = x;
          while (x < level.sizeX && level.isSolid(x, y, z)) x++;
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

    console.log(
      `[vloxels] terrain colliders: ${colliderCount}` +
        (colliderCount > 500 ? '  ⚠️ over the ~500 budget — optimise!' : ''),
    );
    return colliderCount;
  }

  return {
    rebuild,
    remove,
    get body() {
      return body;
    },
    get colliderCount() {
      return colliderCount;
    },
  };
}
