import { BLOCKS, blockById } from '../src/blocks.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

ok(BLOCKS.motorLinearSlow.id === 13 && BLOCKS.motorLinearSlow.motor === 'slow' && BLOCKS.motorLinearSlow.linear === true, 'slow slider def');
ok(BLOCKS.motorLinearFast.id === 14 && BLOCKS.motorLinearFast.motor === 'fast' && BLOCKS.motorLinearFast.linear === true, 'fast slider def');
ok(BLOCKS.motorLinearSlow.solid && BLOCKS.motorLinearFast.solid, 'linear motors are solid');
ok(BLOCKS.shaft.id === 15 && BLOCKS.shaft.shaft === true && !BLOCKS.shaft.solid, 'shaft def is non-solid');
ok(blockById(13).key === 'motorLinearSlow' && blockById(15).key === 'shaft', 'blockById maps new ids');
// rotary motors are NOT flagged linear (that flag is what distinguishes them)
ok(!BLOCKS.motorSlow.linear && !BLOCKS.motorFast.linear, 'rotary motors have no linear flag');
ok(CONFIG.motor.linearSlowSpeed === 1.5 && CONFIG.motor.linearFastSpeed === 4.0, 'linear speeds');
ok(CONFIG.motor.slowSpeed === 0.6 && CONFIG.motor.fastSpeed === 4.0, 'rotary speeds untouched');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
