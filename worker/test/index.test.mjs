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
