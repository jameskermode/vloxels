// physics/world.js — owns the Rapier world and the fixed-timestep loop.
//
// Physics runs at a rock-steady 60 Hz regardless of render framerate: we
// accumulate real frame time and step the world in fixed 1/60 s chunks. This
// keeps behaviour identical on the fast MacBook and the slow Pi.
//
// The world also owns the EventQueue (rules.js drains sensor events from it in
// Milestone 6).

import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';

const MAX_STEPS_PER_FRAME = 5; // guard against the "spiral of death" after a stall

export function createPhysicsWorld() {
  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);
  let accumulator = 0;

  return {
    world,
    eventQueue,

    // Advance physics by real frame time `dt` (seconds). Steps in fixed 1/60 s
    // chunks. `onStep` (optional) runs once just before each step — that's where
    // per-tick controllers (player, spinners) push their updates. Returns the
    // measured step time in milliseconds (for the HUD).
    step(dt, onStep) {
      accumulator += Math.min(dt, CONFIG.maxFrameDt);
      const t0 = performance.now();
      let steps = 0;
      while (accumulator >= CONFIG.fixedStep) {
        if (onStep) onStep(CONFIG.fixedStep);
        world.step(eventQueue);
        accumulator -= CONFIG.fixedStep;
        if (++steps >= MAX_STEPS_PER_FRAME) {
          accumulator = 0; // fell too far behind; drop the backlog
          break;
        }
      }
      return performance.now() - t0;
    },

    free() {
      world.free();
    },
  };
}
