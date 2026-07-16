import { makeCode, isValidLevel } from '../src/codes.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const code = makeCode();
ok(/^[a-z]+-[a-z]+-\d{1,2}$/.test(code), `code shape adjective-animal-number (got ${code})`);
// codes vary
const many = new Set(Array.from({ length: 50 }, () => makeCode()));
ok(many.size > 10, `codes are randomised (${many.size} distinct of 50)`);

ok(isValidLevel({ format: 'vloxels-level', version: 1, name: 'x', size: [1, 1, 1], blocks: 'AA==' }), 'accepts a real level');
ok(!isValidLevel({ format: 'nope' }), 'rejects wrong format');
ok(!isValidLevel(null), 'rejects null');
ok(!isValidLevel({ format: 'vloxels-level', size: [1, 1, 1] }), 'rejects missing blocks');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
