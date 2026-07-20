import { BLOCKS, BLOCK_LIST } from '../src/blocks.js';
import { categoryOf, groupBlocks, CATEGORIES } from '../src/edit/blockCategories.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const cat = (key, want) => ok(categoryOf(BLOCKS[key]) === want, `${key} → ${want} (got ${categoryOf(BLOCKS[key])})`);
cat('solid', 'terrain'); cat('brick', 'terrain');
cat('hazard', 'water');
cat('coin', 'pickups'); cat('scuba', 'pickups'); cat('glider', 'pickups');
cat('motorSlow', 'machines'); cat('motorFast', 'machines'); cat('blade', 'machines');
cat('board', 'machines'); cat('motorLinearSlow', 'machines'); cat('motorLinearFast', 'machines'); cat('shaft', 'machines');
cat('start', 'markers'); cat('goal', 'markers');
ok(categoryOf({}) === 'misc', 'flagless stub → misc');

ok(CATEGORIES[0].key === 'terrain' && CATEGORIES.find((c) => c.key === 'machines').icon === '⚙️', 'CATEGORIES ordered + iconned');

const groups = groupBlocks(BLOCK_LIST);
ok(groups.map((g) => g.key).join(',') === 'terrain,water,machines,pickups,markers', `five groups in order (got ${groups.map((g) => g.key).join(',')})`);
ok(groups.reduce((n, g) => n + g.blocks.length, 0) === BLOCK_LIST.length, 'every block appears exactly once');
const machines = groups.find((g) => g.key === 'machines').blocks.map((b) => b.key);
ok(JSON.stringify(machines) === JSON.stringify(['motorSlow', 'motorFast', 'blade', 'board', 'motorLinearSlow', 'motorLinearFast', 'shaft']), 'registry order preserved within a group');
ok(groups.every((g) => g.blocks.length > 0), 'no empty groups rendered');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
