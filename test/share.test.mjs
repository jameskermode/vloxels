import { CONFIG } from '../src/config.js';
import {
  shareEnabled,
  shareLevel,
  loadShared,
  setShareKey,
  getShareKey,
} from '../src/share.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

// Stub localStorage (Node has none by default) — the passphrase lives here.
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

// A minimal fake Level (only needs toJSON).
const fakeLevel = { toJSON: () => ({ format: 'vloxels-level', version: 1, name: 'T', size: [1, 1, 1], blocks: 'AA==' }) };

// Disabled when no url.
CONFIG.share = { url: '' };
ok(shareEnabled() === false, 'disabled with empty url');

// Enabled with url (no key in config anymore).
CONFIG.share = { url: 'https://w.dev' };
ok(shareEnabled() === true, 'enabled with url');

// Passphrase is stored in localStorage, not config.
setShareKey('secret');
ok(getShareKey() === 'secret', 'passphrase stored/retrieved from localStorage');

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
ok(lastReq.opts.headers['X-Vloxels-Key'] === 'secret', 'sends the stored passphrase as the key');

const obj = await loadShared('brave-fox-42');
ok(obj.format === 'vloxels-level', 'loadShared returns a level object');

let threw = '';
try { await loadShared('missing'); } catch (e) { threw = e.message; }
ok(/code/i.test(threw), `missing code rejects with a friendly message (${threw})`);

// Wrong passphrase: 401 -> error flagged `badKey` so the UI can re-prompt.
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
let badShare = false;
try { await shareLevel(fakeLevel); } catch (e) { badShare = e.badKey === true; }
ok(badShare, 'share 401 throws a badKey-flagged error');
let badLoad = false;
try { await loadShared('brave-fox-42'); } catch (e) { badLoad = e.badKey === true; }
ok(badLoad, 'load 401 throws a badKey-flagged error');

// Network/offline failure: fetch() itself rejects.
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
let m1 = '';
try { await shareLevel(fakeLevel); } catch (e) { m1 = e.message; }
ok(/reach/i.test(m1), `share network failure is friendly (${m1})`);
let m2 = '';
try { await loadShared('brave-fox-42'); } catch (e) { m2 = e.message; }
ok(/reach/i.test(m2), `load network failure is friendly (${m2})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
