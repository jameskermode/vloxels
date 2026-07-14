// level.js — the level data model: a fixed-size 3D grid of block ids stored as a
// flat Uint8Array. Knows nothing about Three.js or Rapier; it's pure data plus
// versioned (de)serialisation so levels can travel as JSON between machines.

import { CONFIG } from './config.js';
import { blockById } from './blocks.js';

export class Level {
  constructor(sizeX = CONFIG.grid.x, sizeY = CONFIG.grid.y, sizeZ = CONFIG.grid.z, name = 'Untitled') {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.name = name;
    this.blocks = new Uint8Array(sizeX * sizeY * sizeZ); // all 0 = empty
  }

  // Flat index for a cell. Order is x fastest, then y, then z — arbitrary but
  // fixed so the base64 blob round-trips.
  index(x, y, z) {
    return x + this.sizeX * (y + this.sizeY * z);
  }

  inBounds(x, y, z) {
    return (
      x >= 0 && x < this.sizeX &&
      y >= 0 && y < this.sizeY &&
      z >= 0 && z < this.sizeZ
    );
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.blocks[this.index(x, y, z)];
  }

  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return;
    this.blocks[this.index(x, y, z)] = id;
  }

  // Is the cell a solid block (terrain you collide with)?
  isSolid(x, y, z) {
    const def = blockById(this.get(x, y, z));
    return !!(def && def.solid);
  }

  // Return the [x,y,z] of the first cell holding this block id, or null.
  // Handy for `start`/`goal` which are unique.
  find(id) {
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] === id) {
        const x = i % this.sizeX;
        const y = Math.floor(i / this.sizeX) % this.sizeY;
        const z = Math.floor(i / (this.sizeX * this.sizeY));
        return [x, y, z];
      }
    }
    return null;
  }

  // Visit every non-empty cell. cb(x, y, z, id).
  forEachBlock(cb) {
    const { sizeX, sizeY } = this;
    for (let i = 0; i < this.blocks.length; i++) {
      const id = this.blocks[i];
      if (id === 0) continue;
      const x = i % sizeX;
      const y = Math.floor(i / sizeX) % sizeY;
      const z = Math.floor(i / (sizeX * sizeY));
      cb(x, y, z, id);
    }
  }

  // --- Serialisation (versioned from day one) --------------------------------

  toJSON() {
    return {
      format: 'vloxels-level',
      version: 1,
      name: this.name,
      size: [this.sizeX, this.sizeY, this.sizeZ],
      blocks: bytesToBase64(this.blocks),
    };
  }

  static fromJSON(obj) {
    if (!obj || obj.format !== 'vloxels-level') {
      throw new Error('Not a vloxels level file');
    }
    const [sx, sy, sz] = obj.size;
    const level = new Level(sx, sy, sz, obj.name || 'Untitled');
    const bytes = base64ToBytes(obj.blocks);
    if (bytes.length !== level.blocks.length) {
      throw new Error(
        `Level blob size mismatch: got ${bytes.length}, expected ${level.blocks.length}`,
      );
    }
    level.blocks.set(bytes);
    return level;
  }
}

// --- base64 <-> Uint8Array (browser-safe, chunked so it never blows the stack)

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000; // 32 KB at a time
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
