// assemblies.js — group each motor with its connected arm blocks into one
// spinning assembly. Pure data (no Three/Rapier). Recomputed on demand.

import { blockById } from './blocks.js';

const NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
const key = (x, y, z) => `${x},${y},${z}`;

const isShaft = (level, x, y, z) => {
  const d = blockById(level.get(x, y, z));
  return !!(d && d.shaft);
};

// From the motor cell, find the first neighbour that is a shaft and follow it
// in a straight line. Returns the unit direction + how many shaft cells long.
function detectShaft(level, mx, my, mz) {
  for (const [dx, dy, dz] of NEIGHBORS) {
    if (isShaft(level, mx + dx, my + dy, mz + dz)) {
      let n = 0;
      let x = mx + dx, y = my + dy, z = mz + dz;
      while (isShaft(level, x, y, z)) {
        n++;
        x += dx; y += dy; z += dz;
      }
      return { axis: [dx, dy, dz], distance: n };
    }
  }
  return { axis: [0, 0, 0], distance: 0 };
}

export function computeAssemblies(level) {
  const isArm = (x, y, z) => {
    const d = blockById(level.get(x, y, z));
    return !!(d && d.arm);
  };

  // Motors in grid order (forEachBlock walks the flat array in index order),
  // so the "first motor wins" rule for shared arms is deterministic.
  const motors = [];
  level.forEachBlock((x, y, z, id) => {
    const d = blockById(id);
    if (d && d.motor) motors.push([x, y, z, d.motor, !!d.linear]);
  });

  const claimed = new Set(); // arm cells already taken by a motor
  const movingCells = new Set();
  const assemblies = [];

  for (const [mx, my, mz, speed, isLinear] of motors) {
    const cells = [[mx, my, mz]];
    movingCells.add(key(mx, my, mz));
    const queue = [[mx, my, mz]];
    while (queue.length) {
      const [x, y, z] = queue.shift();
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const k = key(nx, ny, nz);
        if (claimed.has(k)) continue;
        if (isArm(nx, ny, nz)) {
          claimed.add(k);
          movingCells.add(k);
          cells.push([nx, ny, nz]);
          queue.push([nx, ny, nz]);
        }
      }
    }
    if (isLinear) {
      const { axis, distance } = detectShaft(level, mx, my, mz);
      assemblies.push({ kind: 'linear', motorCell: [mx, my, mz], speed, cells, axis, distance });
    } else {
      assemblies.push({ kind: 'rotary', motorCell: [mx, my, mz], speed, cells });
    }
  }

  return { assemblies, movingCells };
}
