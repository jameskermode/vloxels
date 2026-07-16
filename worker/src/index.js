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
