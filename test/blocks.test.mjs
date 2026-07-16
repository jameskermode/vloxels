import { BLOCKS, blockById, LEGACY_BLADES, LEGACY_PLATFORM } from '../src/blocks.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

ok(BLOCKS.motorSlow.id === 9 && BLOCKS.motorSlow.motor === 'slow', 'motorSlow id/flag');
ok(BLOCKS.motorFast.id === 10 && BLOCKS.motorFast.motor === 'fast', 'motorFast id/flag');
ok(BLOCKS.blade.id === 11 && BLOCKS.blade.arm === true, 'blade id/flag');
ok(BLOCKS.board.id === 12 && BLOCKS.board.arm === true, 'board id/flag');
ok(BLOCKS.motorFast.solid && BLOCKS.blade.solid, 'motors/arms are solid');
ok(blockById(9).key === 'motorSlow' && blockById(11).key === 'blade', 'blockById maps new ids');
ok(LEGACY_BLADES === 5 && LEGACY_PLATFORM === 6, 'legacy id constants');
ok(CONFIG.motor.slowSpeed === 0.6 && CONFIG.motor.fastSpeed === 4.0, 'motor speeds');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
