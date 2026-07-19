import { BLOCKS, blockById, BLOCK_LIST } from '../src/blocks.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const s = BLOCKS.scuba;
ok(s && s.id === 16, 'scuba has id 16');
ok(s.wear === 'scuba', "scuba has wear:'scuba'");
ok(!s.solid, 'scuba is non-solid');
ok(s.color === 0x11333a, 'scuba colour is dark teal');
ok(blockById(16) === s, 'blockById(16) resolves to scuba');
ok(BLOCK_LIST.includes(s), 'scuba is in the palette list');
// existing pickups untouched
ok(BLOCKS.coin.collect === true && BLOCKS.coin.id === 4, 'coin unchanged');
ok(CONFIG.player.scubaSpeedMult === 1.3, 'scubaSpeedMult is 1.3');
ok(CONFIG.player.scubaSwimSpeed === 8.5, 'scubaSwimSpeed is 8.5');
ok(CONFIG.player.scubaSink === 0, 'scubaSink is 0 (hover)');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
