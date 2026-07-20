import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createPlayer } from '../src/play/player.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

const phys = createPhysicsWorld();
const player = createPlayer(phys.world, new THREE.Scene(), { x: 0, y: 2, z: 0 }, () => false);

ok(player.gear === null, 'starts with no gear');
player.setWearing('scuba');
ok(player.gear === 'scuba' && player.wearing === true, 'wearing scuba');
player.setWearing('fly'); // latest wins, mutex
ok(player.gear === 'fly' && player.wearing === false, 'switching to fly drops scuba (mutex)');
player.setWearing('scuba'); // switch back
ok(player.gear === 'scuba' && player.wearing === true, 'switching back to scuba drops fly');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
