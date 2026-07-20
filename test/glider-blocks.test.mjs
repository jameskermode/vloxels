import { BLOCKS, blockById, BLOCK_LIST } from '../src/blocks.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const g = BLOCKS.glider;
ok(g && g.id === 17, 'glider has id 17');
ok(g.wear === 'fly', "glider has wear:'fly'");
ok(!g.solid, 'glider is non-solid');
ok(g.color === 0x4caf50, 'glider sail colour is green');
ok(blockById(17) === g, 'blockById(17) resolves to glider');
ok(BLOCK_LIST.includes(g), 'glider is in the palette list');
ok(BLOCKS.scuba.id === 16 && BLOCKS.scuba.wear === 'scuba', 'scuba unchanged');
const f = CONFIG.player.fly;
ok(f.rise === 6 && f.sink === -1.5, 'fly rise/sink set');
ok(f.speed === 7 && f.control === 0.5, 'fly speed/control set');
ok(f.riseEase === 0.4 && f.crashSpeed === 2.0, 'fly riseEase/crashSpeed set');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
