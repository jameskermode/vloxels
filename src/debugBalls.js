// debugBalls.js — Milestone 4 sandbox toy. Drops dynamic spheres into the
// physics world so you can watch them bounce and roll around the terrain,
// proving the greedy-merged colliders work. Pure fun / diagnostics; the real
// player body arrives in Milestone 5.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const RADIUS = 0.4;
const COLORS = [0xff5252, 0x4caf50, 0x2196f3, 0xffc107, 0xe040fb, 0x00bcd4];

export function createDebugBalls(world, scene) {
  const geom = new THREE.SphereGeometry(RADIUS, 16, 12);
  const balls = []; // { body, mesh }
  let colorIdx = 0;

  function drop(x, y, z) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.6).setFriction(0.4),
      body,
    );
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshLambertMaterial({ color: COLORS[colorIdx++ % COLORS.length] }),
    );
    scene.add(mesh);
    balls.push({ body, mesh });
  }

  // Copy each body's transform onto its mesh (render follows physics).
  function sync() {
    for (const { body, mesh } of balls) {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  function clear() {
    for (const { body, mesh } of balls) {
      world.removeRigidBody(body);
      scene.remove(mesh);
      mesh.material.dispose();
    }
    balls.length = 0;
  }

  return {
    drop,
    sync,
    clear,
    get count() {
      return balls.length;
    },
  };
}
