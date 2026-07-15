// play/rules.js — the game rules. Each frame it drains the physics event queue
// and reacts to the player overlapping a sensor:
//   water (kills)  -> respawn at start
//   coin  (collect)-> remove the coin, +1
//   goal  (wins)   -> win!
//
// Blades knockback and platform carry are NOT here — those are real physics
// (kinematic bodies), handled by the solver and player.js.

import { BLOCKS } from '../blocks.js';

export function createRules({ eventQueue, playerColliderHandle, terrain, spinners, hooks }) {
  let coins = 0;
  let won = false;

  // Called once per frame after stepping physics.
  function drain() {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;

      // One of the two handles must be the player; the other, maybe a sensor.
      let sensorHandle = null;
      if (h1 === playerColliderHandle) sensorHandle = h2;
      else if (h2 === playerColliderHandle) sensorHandle = h1;
      else return;

      const info = terrain.sensors.get(sensorHandle);
      if (!info) return;
      const def = BLOCKS[info.blockKey];

      if (def.kills) {
        hooks.onRespawn();
      } else if (def.collect) {
        terrain.removeSensor(sensorHandle);
        spinners.removeCoin(info.cell);
        coins += 1;
        hooks.onCoin(coins);
      } else if (def.wins && !won) {
        won = true;
        hooks.onWin(coins);
      }
    });
  }

  return {
    drain,
    get coins() {
      return coins;
    },
    get won() {
      return won;
    },
  };
}
