# Level Sharing (share-by-code) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let friends share Vloxels levels by a short word code, backed by a tiny Cloudflare Worker + KV store.

**Architecture:** A single Cloudflare Worker exposes `POST /levels` (store a level, return a word code like `brave-fox-42`) and `GET /levels/:code` (fetch it back), with a shared-secret header gating both and CORS enabled. The game gains a `share.js` API client and **Share** / **Load Code** toolbar buttons that reuse the existing `replaceLevel` path (which already adopts any grid size).

**Tech Stack:** Cloudflare Workers (ES-module Worker), Workers KV, `wrangler` CLI. Client is plain ES-module JS (no framework), tested with Node.

## Global Constraints

- Plain JavaScript ES modules only — no TypeScript, no framework. Readable for a 9-year-old.
- The game is a static site (GitHub Pages); the Worker is the only backend.
- Levels are the object returned by `Level.toJSON()`: `{ format: "vloxels-level", version: 1, name, size: [x,y,z], blocks: "<base64>" }`.
- Shared secret is sent in the `X-Vloxels-Key` header; the same value is configured on the Worker (`env.SHARE_KEY`) and embedded in the client (`CONFIG.share.key`).
- KV binding name: `VLOXELS_LEVELS`. Worker name: `vloxels-levels`.
- Tests are standalone `.mjs` files run with `node <file>` (the repo has no test framework). Use a tiny inline `ok(cond, msg)` assert helper.
- Node 18+ provides global `Request`, `Response`, `URL`, `fetch` — the Worker's `fetch(request, env)` export is testable in Node by passing a mock `env`.

---

### Task 1: Worker word codes (pure helpers)

**Files:**
- Create: `worker/src/words.js`
- Create: `worker/src/codes.js`
- Test: `worker/test/codes.test.mjs`

**Interfaces:**
- Produces: `makeCode(): string` → a code like `"brave-fox-42"`. `isValidLevel(obj): boolean` → true iff `obj` looks like a `vloxels-level`.

- [ ] **Step 1: Write the failing test**

Create `worker/test/codes.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node worker/test/codes.test.mjs`
Expected: FAIL — `Cannot find module '../src/codes.js'`.

- [ ] **Step 3: Write the wordlists**

Create `worker/src/words.js`:

```js
// Small, kid-friendly wordlists for share codes. Expand freely — more words =
// more unique codes (currently ~24 x 24 x 100 = ~57k combinations).
export const ADJECTIVES = [
  'brave', 'shiny', 'happy', 'sneaky', 'mighty', 'fuzzy', 'zippy', 'jolly',
  'clever', 'sparkly', 'bouncy', 'grumpy', 'speedy', 'wobbly', 'chunky', 'silly',
  'golden', 'purple', 'spooky', 'cosmic', 'turbo', 'mega', 'tiny', 'wild',
];
export const ANIMALS = [
  'fox', 'otter', 'panda', 'shark', 'tiger', 'gecko', 'llama', 'moose',
  'raven', 'bunny', 'newt', 'wolf', 'crab', 'toad', 'hawk', 'seal',
  'yak', 'mole', 'bat', 'owl', 'koala', 'dingo', 'lynx', 'wombat',
];
```

- [ ] **Step 4: Write the code helpers**

Create `worker/src/codes.js`:

```js
import { ADJECTIVES, ANIMALS } from './words.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A friendly share code, e.g. "brave-fox-42".
export function makeCode() {
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${Math.floor(Math.random() * 100)}`;
}

// Does this object look like a Level.toJSON() result?
export function isValidLevel(obj) {
  return (
    !!obj &&
    obj.format === 'vloxels-level' &&
    Array.isArray(obj.size) &&
    typeof obj.blocks === 'string'
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node worker/test/codes.test.mjs`
Expected: PASS — `6 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add worker/src/words.js worker/src/codes.js worker/test/codes.test.mjs
git commit -m "Level sharing: worker word-code + level-validation helpers"
```

---

### Task 2: Worker request handler (routes, auth, KV, CORS)

**Files:**
- Create: `worker/src/index.js`
- Create: `worker/wrangler.toml`
- Test: `worker/test/index.test.mjs`

**Interfaces:**
- Consumes: `makeCode`, `isValidLevel` from `worker/src/codes.js`.
- Produces: `export default { async fetch(request, env) }`. `env` has `SHARE_KEY: string` and `VLOXELS_LEVELS` (a KV namespace with `get(key)` / `put(key, value)`).

- [ ] **Step 1: Write the failing test**

Create `worker/test/index.test.mjs`:

```js
import worker from '../src/index.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

// In-memory mock KV.
function mockKV() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); } };
}
const env = () => ({ SHARE_KEY: 'secret', VLOXELS_LEVELS: mockKV() });
const LEVEL = { format: 'vloxels-level', version: 1, name: 'Test', size: [1, 1, 1], blocks: 'AA==' };
const req = (method, path, { key, body } = {}) =>
  new Request(`https://w.dev${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Vloxels-Key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

// OPTIONS preflight (no key) returns CORS.
{
  const res = await worker.fetch(req('OPTIONS', '/levels'), env());
  ok(res.status === 204 || res.status === 200, 'OPTIONS ok');
  ok(res.headers.get('Access-Control-Allow-Origin') === '*', 'OPTIONS has CORS');
}
// Wrong key -> 401.
{
  const res = await worker.fetch(req('POST', '/levels', { key: 'wrong', body: LEVEL }), env());
  ok(res.status === 401, 'wrong key rejected');
}
// POST then GET round-trip.
{
  const e = env();
  const post = await worker.fetch(req('POST', '/levels', { key: 'secret', body: LEVEL }), e);
  ok(post.status === 200, 'POST ok');
  const { code } = await post.json();
  ok(typeof code === 'string' && code.includes('-'), `got a code (${code})`);
  const get = await worker.fetch(req('GET', `/levels/${code}`, { key: 'secret' }), e);
  ok(get.status === 200, 'GET ok');
  const back = await get.json();
  ok(back.blocks === LEVEL.blocks && back.name === 'Test', 'round-trips the level');
  ok(get.headers.get('Access-Control-Allow-Origin') === '*', 'GET has CORS');
}
// Missing code -> 404.
{
  const res = await worker.fetch(req('GET', '/levels/nope-nope-9', { key: 'secret' }), env());
  ok(res.status === 404, 'unknown code -> 404');
}
// Not a level -> 400.
{
  const res = await worker.fetch(req('POST', '/levels', { key: 'secret', body: { hello: 1 } }), env());
  ok(res.status === 400, 'non-level body -> 400');
}
// Oversized -> 413.
{
  const big = { ...LEVEL, blocks: 'A'.repeat(200_001) };
  const res = await worker.fetch(req('POST', '/levels', { key: 'secret', body: big }), env());
  ok(res.status === 413, 'oversized -> 413');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node worker/test/index.test.mjs`
Expected: FAIL — `Cannot find module '../src/index.js'`.

- [ ] **Step 3: Write the Worker**

Create `worker/src/index.js`:

```js
import { makeCode, isValidLevel } from './codes.js';

const MAX_BODY = 200_000; // ~200 KB cap (a raw level is ~85 KB)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Vloxels-Key',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // Shared-secret gate (applies to POST and GET; OPTIONS handled above).
    if (request.headers.get('X-Vloxels-Key') !== env.SHARE_KEY) {
      return json({ error: 'unauthorized' }, 401);
    }

    const parts = new URL(request.url).pathname.split('/').filter(Boolean); // ['levels', ':code']

    // POST /levels  -> store, return a code.
    if (request.method === 'POST' && parts.length === 1 && parts[0] === 'levels') {
      const body = await request.text();
      if (body.length > MAX_BODY) return json({ error: 'level too big' }, 413);
      let obj;
      try {
        obj = JSON.parse(body);
      } catch {
        return json({ error: 'invalid json' }, 400);
      }
      if (!isValidLevel(obj)) return json({ error: 'not a vloxels level' }, 400);

      let code = makeCode();
      for (let i = 0; i < 5 && (await env.VLOXELS_LEVELS.get(code)); i++) code = makeCode();
      await env.VLOXELS_LEVELS.put(
        code,
        JSON.stringify({ name: obj.name || 'Untitled', json: obj, createdAt: new Date().toISOString() }),
      );
      return json({ code });
    }

    // GET /levels/:code  -> the stored level object (or 404).
    if (request.method === 'GET' && parts.length === 2 && parts[0] === 'levels') {
      const stored = await env.VLOXELS_LEVELS.get(parts[1]);
      if (!stored) return json({ error: 'not found' }, 404);
      return json(JSON.parse(stored).json);
    }

    return json({ error: 'not found' }, 404);
  },
};
```

- [ ] **Step 4: Write wrangler.toml**

Create `worker/wrangler.toml` (the `id` is filled in during Task 3's walkthrough):

```toml
name = "vloxels-levels"
main = "src/index.js"
compatibility_date = "2024-11-01"

# KV binding — the `id` comes from `wrangler kv namespace create` (see README).
[[kv_namespaces]]
binding = "VLOXELS_LEVELS"
id = "PASTE_KV_NAMESPACE_ID_HERE"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node worker/test/index.test.mjs`
Expected: PASS — `10 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.js worker/wrangler.toml worker/test/index.test.mjs
git commit -m "Level sharing: worker POST/GET handler with auth, KV, CORS"
```

---

### Task 3: KV setup + deploy walkthrough (worker/README.md)

**Files:**
- Create: `worker/README.md`

This task delivers the exact, click-by-click setup the user asked for and ends with a live Worker verified by curl. There is no automated test — the deliverable is the working deployment, smoke-tested with `curl`.

- [ ] **Step 1: Write the walkthrough**

Create `worker/README.md`:

````markdown
# Vloxels level-sharing Worker

A tiny Cloudflare Worker + KV store behind the game's Share / Load Code buttons.

## One-time setup

You need a (free) Cloudflare account. All commands run from this `worker/` folder.

### 1. Log in

```bash
npx wrangler login
```

A browser window opens — approve access. (Installs `wrangler` on first run.)

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create VLOXELS_LEVELS
```

It prints something like:

```
[[kv_namespaces]]
binding = "VLOXELS_LEVELS"
id = "abc123def456..."
```

Copy that `id` and paste it into `wrangler.toml`, replacing `PASTE_KV_NAMESPACE_ID_HERE`.

_(Dashboard alternative: **Workers & Pages → KV → Create a namespace**, name it
`VLOXELS_LEVELS`, then copy its ID into `wrangler.toml`.)_

### 3. Set the shared secret

Pick a passphrase your group will use (any string). It must match the one you
put in the game's `src/config.js` (`share.key`).

```bash
npx wrangler secret put SHARE_KEY
# paste the passphrase when prompted
```

### 4. Deploy

```bash
npx wrangler deploy
```

It prints your Worker URL, e.g. `https://vloxels-levels.<you>.workers.dev`.
Put that URL in the game's `src/config.js` (`share.url`).

## Smoke test

Replace `URL` and `KEY` with your Worker URL and passphrase:

```bash
# Share a level, capture the code:
curl -s -X POST URL/levels -H "X-Vloxels-Key: KEY" -H "Content-Type: application/json" \
  -d '{"format":"vloxels-level","version":1,"name":"Hi","size":[1,1,1],"blocks":"AA=="}'
# -> {"code":"brave-fox-42"}

# Fetch it back:
curl -s URL/levels/brave-fox-42 -H "X-Vloxels-Key: KEY"
# -> {"format":"vloxels-level",...}

# Wrong key is rejected:
curl -s -o /dev/null -w "%{http_code}\n" URL/levels/brave-fox-42 -H "X-Vloxels-Key: nope"
# -> 401
```

## Local dev (optional)

```bash
echo 'SHARE_KEY = "devsecret"' > .dev.vars   # local-only secret for wrangler dev
npx wrangler dev                              # runs on http://localhost:8787
```

`.dev.vars` is git-ignored.
````

- [ ] **Step 2: Add worker/.gitignore**

Create `worker/.gitignore`:

```
node_modules/
.dev.vars
.wrangler/
```

- [ ] **Step 3: Do the setup (user + agent together)**

Follow `worker/README.md` steps 1–4: `wrangler login`, create the KV namespace, paste the `id` into `wrangler.toml`, `wrangler secret put SHARE_KEY`, `wrangler deploy`. Record the printed Worker URL.

- [ ] **Step 4: Smoke test the live Worker**

Run the three `curl` commands from the README's Smoke test section against the deployed URL.
Expected: POST returns `{"code":"..."}`; GET returns the level JSON; wrong-key returns `401`.

- [ ] **Step 5: Commit**

```bash
git add worker/README.md worker/.gitignore worker/wrangler.toml
git commit -m "Level sharing: worker deploy walkthrough + KV setup"
```

(Note: `wrangler.toml` now contains the real KV namespace `id`. That id is not a secret; the `SHARE_KEY` was set via `wrangler secret put` and is NOT in the repo.)

---

### Task 4: Client API (`src/share.js`) + config

**Files:**
- Create: `src/share.js`
- Modify: `src/config.js` (add a `share` block)
- Test: `test/share.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.share = { url, key }` from `src/config.js`; `level.toJSON()`.
- Produces: `shareEnabled(): boolean`, `shareLevel(level): Promise<string>` (resolves to a code), `loadShared(code): Promise<object>` (resolves to a `vloxels-level` object; rejects with a friendly `Error` on 404/failure).

- [ ] **Step 1: Add the config block**

In `src/config.js`, inside the `CONFIG` object (e.g. right after the `water` block), add:

```js
  // Level sharing backend (optional). Leave `url` empty to hide the Share /
  // Load Code buttons and run with no server. Fill these in after deploying
  // worker/ (see worker/README.md). `key` must match the Worker's SHARE_KEY.
  share: { url: '', key: '' },
```

- [ ] **Step 2: Write the failing test**

Create `test/share.test.mjs`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/share.test.mjs`
Expected: FAIL — `Cannot find module '../src/share.js'`.

- [ ] **Step 4: Write the client**

Create `src/share.js`:

```js
// share.js — talks to the level-sharing Worker (see worker/). Disabled cleanly
// when CONFIG.share.url is empty, so the game runs with no backend.

import { CONFIG } from './config.js';

export function shareEnabled() {
  return !!(CONFIG.share && CONFIG.share.url);
}

// Upload a level, resolve to its share code (e.g. "brave-fox-42").
export async function shareLevel(level) {
  const res = await fetch(`${CONFIG.share.url}/levels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Vloxels-Key': CONFIG.share.key },
    body: JSON.stringify(level.toJSON()),
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(info.error || `Share failed (${res.status})`);
  }
  return (await res.json()).code;
}

// Fetch a shared level by code, resolve to a vloxels-level object.
export async function loadShared(code) {
  const res = await fetch(`${CONFIG.share.url}/levels/${encodeURIComponent(code.trim())}`, {
    headers: { 'X-Vloxels-Key': CONFIG.share.key },
  });
  if (res.status === 404) throw new Error('No level found for that code.');
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return await res.json();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/share.test.mjs`
Expected: PASS — `7 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add src/share.js src/config.js test/share.test.mjs
git commit -m "Level sharing: client API (share.js) + config"
```

---

### Task 5: Toolbar Share / Load Code UI + wiring

**Files:**
- Modify: `src/ui/hud.js` (extend `createLevelToolbar`; add `showCodeDialog`)
- Modify: `src/main.js` (wire share callbacks)

**Interfaces:**
- Consumes: `shareEnabled`, `shareLevel`, `loadShared` from `src/share.js`; existing `replaceLevel(obj)` in `main.js`; existing `createLevelToolbar({...})`.
- Produces: toolbar gains **Share** and **Load Code** buttons when `onShare` / `onLoadCode` callbacks are passed; `showCodeDialog(code)` shows a copyable code overlay.

This task is UI wiring; verification is manual in the browser plus the Task 4 unit tests for the underlying calls. No new automated test.

- [ ] **Step 1: Add showCodeDialog to hud.js**

In `src/ui/hud.js`, add this exported function (place it near `createLevelToolbar`):

```js
// A small overlay showing a share code with a Copy button.
export function showCodeDialog(code) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexDirection: 'column', gap: '14px',
    background: 'rgba(0,0,0,0.6)', color: '#fff', zIndex: '30',
    font: '700 20px system-ui, sans-serif', textAlign: 'center', padding: '20px',
  });
  const label = document.createElement('div');
  label.textContent = 'Level code — tell your friends!';
  const codeEl = document.createElement('div');
  codeEl.textContent = code;
  codeEl.style.font = '800 34px ui-monospace, monospace';
  codeEl.style.color = '#ffd24a';
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '10px';
  const mk = (text, bg, fn) => {
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      minHeight: '48px', padding: '0 18px', border: 'none', borderRadius: '10px',
      background: bg, color: '#fff', font: '700 16px system-ui, sans-serif', cursor: 'pointer',
    });
    b.addEventListener('click', fn);
    return b;
  };
  const copyBtn = mk('Copy', '#2a3550', () => {
    navigator.clipboard?.writeText(code).then(() => (copyBtn.textContent = 'Copied!'));
  });
  const closeBtn = mk('Close', '#27ae60', () => overlay.remove());
  row.append(copyBtn, closeBtn);
  overlay.append(label, codeEl, row);
  document.body.appendChild(overlay);
}
```

- [ ] **Step 2: Add Share / Load buttons in createLevelToolbar**

In `src/ui/hud.js`, find `createLevelToolbar` and its options. Change its signature to also accept `onShare` and `onLoadCode`, and after the existing buttons (New / Export / Import) but before the examples dropdown, add:

```js
  if (onShare) bar.appendChild(mkBtn('Share', onShare));
  if (onLoadCode) bar.appendChild(mkBtn('Load Code', onLoadCode));
```

Also add `onShare` and `onLoadCode` to the destructured parameters of `createLevelToolbar({ ... })`.

- [ ] **Step 3: Wire it in main.js**

In `src/main.js`, add to the imports:

```js
import { shareEnabled, shareLevel, loadShared } from './share.js';
import { createLevelToolbar, showCodeDialog } from './ui/hud.js';
```

(The `createLevelToolbar` import already exists in the `./ui/hud.js` import list — add `showCodeDialog` to that same import instead of duplicating.)

Then, where `createLevelToolbar({ ... })` is called, add these two options (only enabled when a backend is configured):

```js
    onShare: shareEnabled()
      ? async () => {
          try {
            const code = await shareLevel(level);
            showCodeDialog(code);
          } catch (e) {
            alert(`Share failed: ${e.message}`);
          }
        }
      : null,
    onLoadCode: shareEnabled()
      ? async () => {
          const code = prompt('Enter a level code:');
          if (!code) return;
          try {
            replaceLevel(await loadShared(code));
          } catch (e) {
            alert(e.message);
          }
        }
      : null,
```

- [ ] **Step 4: Verify build + no regressions**

Run: `npm run build`
Expected: `28 modules transformed` becomes `29 modules transformed` (adds `share.js`); no errors.

Run: `node test/share.test.mjs`
Expected: PASS — `7 passed, 0 failed`.

- [ ] **Step 5: Manual browser check**

With `CONFIG.share` filled in (real Worker URL + key), run `npm run dev`. In EDIT mode: click **Share** → a code dialog appears; **Copy** copies it. Click **Load Code**, paste the code → the level loads. (With `CONFIG.share.url` empty, the two buttons are absent and everything else works.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/hud.js src/main.js
git commit -m "Level sharing: Share / Load Code toolbar buttons + code dialog"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document sharing in the README**

In `README.md`, under the editor controls / toolbar description, add:

```markdown
- **Share** / **Load Code** (when a sharing backend is configured) — Share
  uploads your level and gives you a short code like `brave-fox-42` to send a
  friend; Load Code fetches a level by its code. Set up the backend once via
  [`worker/README.md`](worker/README.md), then fill in `share` in
  [`src/config.js`](src/config.js). Without it, levels still travel via
  Export/Import files.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Docs: level sharing (Share / Load Code)"
```

---

## Deferred (not in this plan)

- **RLE compression** of the blocks before upload (levels are mostly zeros; ~85 KB → ~1 KB). Add a versioned compressed encoding to the level format so it stays backward-compatible. Do as a fast-follow once the basic flow works.
- **"My codes"** local list so a device can re-copy codes it has created.
- Optional per-IP write rate limiting; optional level TTL/cleanup.

## Self-Review

- **Spec coverage:** Worker API (Tasks 1–2), KV setup walkthrough (Task 3), client `share.js` + config (Task 4), toolbar Share/Load UI (Task 5), README (Task 6), security via shared secret (Task 2 auth + Task 3 secret setup), word codes (Task 1), body-size cap (Task 2). RLE compression + "my codes" explicitly deferred per spec. All covered.
- **Placeholders:** `PASTE_KV_NAMESPACE_ID_HERE` in `wrangler.toml` is intentional and resolved in Task 3; `share: { url: '', key: '' }` is intentionally empty (filled post-deploy). No unresolved TODOs in code steps.
- **Type consistency:** `makeCode`/`isValidLevel` (Task 1) used in Task 2; `shareEnabled`/`shareLevel`/`loadShared` (Task 4) used in Task 5; `showCodeDialog(code)` (Task 5 Step 1) used in Task 5 Step 3; `CONFIG.share.{url,key}` consistent across Tasks 4–5; `X-Vloxels-Key` / `env.SHARE_KEY` consistent across Tasks 2–4 and the README.
