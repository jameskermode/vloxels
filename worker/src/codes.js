import { ADJECTIVES, ANIMALS } from './words.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A friendly share code, e.g. "brave-fox-42".
export function makeCode() {
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${Math.floor(Math.random() * 100)}`;
}

// Does this object look like a Level.toJSON() result?
export function isValidLevel(obj) {
  return (
    !!obj &&
    obj.format === 'vloxels-level' &&
    Array.isArray(obj.size) &&
    typeof obj.blocks === 'string'
  );
}
