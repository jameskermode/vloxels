import { CONFIG } from '../src/config.js';
import { shareEnabled, shareLevel, loadShared } from '../src/share.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

// A minimal fake Level (only needs toJSON).
const fakeLevel = { toJSON: () => ({ format: 'vloxels-level', version: 1, name: 'T', size: [1, 1, 1], blocks: 'AA==' }) };

// Disabled when no url.
CONFIG.share = { url: '', key: '' };
ok(shareEnabled() === false, 'disabled with empty url');

// Enable + stub fetch.
CONFIG.share = { url: 'https://w.dev', key: 'secret' };
ok(shareEnabled() === true, 'enabled with url');

let lastReq = null;
globalThis.fetch = async (url, opts) => {
  lastReq = { url, opts };
  if (opts && opts.method === 'POST') {
    return new Response(JSON.stringify({ code: 'brave-fox-42' }), { status: 200 });
  }
  if (String(url).endsWith('/levels/missing')) return new Response('{}', { status: 404 });
  return new Response(JSON.stringify({ format: 'vloxels-level', version: 1, name: 'T', size: [1, 1, 1], blocks: 'AA==' }), { status: 200 });
};

const code = await shareLevel(fakeLevel);
ok(code === 'brave-fox-42', `shareLevel returns the code (${code})`);
ok(lastReq.url === 'https://w.dev/levels' && lastReq.opts.method === 'POST', 'POSTs to /levels');
ok(lastReq.opts.headers['X-Vloxels-Key'] === 'secret', 'sends the shared key');

const obj = await loadShared('brave-fox-42');
ok(obj.format === 'vloxels-level', 'loadShared returns a level object');

let threw = '';
try { await loadShared('missing'); } catch (e) { threw = e.message; }
ok(/code/i.test(threw), `missing code rejects with a friendly message (${threw})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
