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
