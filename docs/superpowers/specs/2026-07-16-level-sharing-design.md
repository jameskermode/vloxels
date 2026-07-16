# Vloxels — Level Sharing (share-by-code)

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation planning.

## Goal

Let a small group of friends share Vloxels levels easily. A kid taps **Share**,
gets a short friendly **code** (e.g. `brave-fox-42`), and reads it out to a
friend, who types it into **Load** and instantly plays that level. Today the
only way to move levels between people is manual JSON file export/import; this
replaces that with a one-tap flow backed by a tiny serverless store.

## Approach (decided)

- **Backend:** a single **Cloudflare Worker** + **Workers KV** store. It's the
  lightest real "server": free tier, zero maintenance, global, nothing to keep
  powered on.
- **UX:** **share-by-code**. Share uploads the current level and returns a
  word code; Load fetches a level by code.
- **Access:** **friends-only via a shared secret** baked into the group's build.

## Non-goals (v1)

- No user accounts / real authentication (see Security).
- No in-app gallery / browse / thumbnails / likes (share-by-code only).
- No editing or deleting shared levels after upload (immutable snapshots).
- No moderation tooling beyond the shared secret + a body-size cap.

## Architecture

```
Game (GitHub Pages)  ──HTTPS──▶  Cloudflare Worker  ──▶  Workers KV
  Share / Load UI                 POST /levels           key: code
                                  GET  /levels/:code      value: {name,json,createdAt}
```

### Worker API

One Worker, one file (`worker/src/index.js`). All responses include CORS
headers; `OPTIONS` is handled for preflight.

**`POST /levels`**
- Auth: header `X-Vloxels-Key: <shared secret>`. Missing/wrong → `401`.
- Body: the level JSON (the output of `Level.toJSON()`), `Content-Type:
  application/json`. Reject bodies larger than a cap (~200 KB) → `413`.
- Behaviour: validate it's a `vloxels-level` object; generate a unique word
  code; `KV.put(code, JSON.stringify({ name, json, createdAt }))`; return
  `200 { "code": "brave-fox-42" }`.
- Code collisions: generate, check `KV.get`; retry a few times; extremely rare.

**`GET /levels/:code`**
- Auth: same shared-secret header. (So a code alone, without the group build,
  can't fetch — keeps levels in-group.)
- Behaviour: `KV.get(code)`; `404` if absent; else `200` with the stored level
  JSON (the `json` field, i.e. a normal `vloxels-level` object).

**Errors:** JSON `{ "error": "..." }` with appropriate status
(`400/401/404/413/500`). The client shows friendly messages.

### Code format

`adjective-animal-number`, e.g. `brave-fox-42`, from small curated wordlists
(~120 adjectives × ~120 animals × 100 numbers ≈ 1.4M combos). Kid-friendly to
read aloud and type; collisions negligible. Wordlists live in the Worker.

### Data model (KV)

- Key: the code string (`brave-fox-42`).
- Value: `{ name: string, json: <vloxels-level>, createdAt: <ISO string> }`.
- No TTL in v1 (levels persist). Free-tier storage (1 GB) is ample; a raw level
  is ~85 KB, so ~12k levels fit even uncompressed.

## Game (client) changes

- **`src/share.js`** (new): thin API client.
  - `shareLevel(level)` → `POST`; resolves to a `code` string.
  - `loadShared(code)` → `GET`; resolves to a parsed level object (ready for
    `Level.fromJSON`). Rejects with a friendly error on 404/network.
  - Reads the Worker URL + shared secret from config.
- **`src/config.js`**: add a `share` block — `{ url: '<worker url>', key:
  '<shared secret>' }`. Documented as deployment constants.
- **Toolbar** (`ui/hud.js` `createLevelToolbar`): add two buttons, shown only
  when `config.share.url` is set (so the game still works with no backend):
  - **Share** → `shareLevel(currentLevel)` → dialog: "Level code: **<code>**
    — tell your friends!" with a **Copy** button. Errors → alert.
  - **Load code** → prompt for a code → `loadShared` → `replaceLevel(obj)` (the
    existing path already adopts any grid size) → autosave. Bad code → friendly
    message.
- Wiring in `main.js`: pass the share callbacks into the toolbar, reusing the
  existing `replaceLevel`.

Upload payload is the raw level JSON (~85 KB, mostly zeros) in v1. See
"Compression" under Later.

## Security model (explicit)

The **same secret string lives in two places that must match**: configured on
the Worker (which checks incoming requests against it) and embedded in the
client build (which sends it in the `X-Vloxels-Key` header). Because it ships
**inside the client build**, anyone who views the deployed source can extract
it. This is a deliberate trade:

- It stops random web crawlers / strangers from posting or reading levels.
- It is **not** strong auth and won't stop a determined person who inspects the
  page. For a handful of friends sharing kids' levels, that threat model is
  fine.
- Basic abuse guards: shared-secret gate, a body-size cap, and Cloudflare's
  free-tier rate limits. Optionally we can add a simple per-IP write rate limit
  later.

If real privacy/accounts were ever needed, that's a larger BaaS-style build and
is out of scope here.

## Repo layout additions

```
worker/
  ├── wrangler.toml      # Worker name + KV namespace binding
  ├── src/index.js       # the Worker (routes, auth, code gen, wordlists)
  └── README.md          # one-time setup + deploy walkthrough
src/
  └── share.js           # client API (new)
```

## Deployment & setup (walkthrough required at implementation time)

The user has a Cloudflare account but wants a **step-by-step walkthrough for
creating the KV store**. The implementation plan must include an explicit,
click-by-click guide covering:

1. Installing `wrangler` (or using `npx wrangler`) and `wrangler login`.
2. Creating the KV namespace — both routes:
   - CLI: `npx wrangler kv namespace create VLOXELS_LEVELS` and pasting the
     returned `id` into `wrangler.toml`; and
   - Dashboard: Workers & Pages → KV → Create namespace (as an alternative).
3. Setting the shared secret (as a Worker secret via `wrangler secret put`, or
   a plain var — decide during planning; note the client also needs it).
4. `npx wrangler deploy` and copying the printed `*.workers.dev` URL into
   `src/config.js`.
5. A `curl` smoke test (POST a level, GET it back by code).

## Testing

- **Worker**: `curl` smoke tests for POST (get code), GET (round-trip), wrong
  secret (401), missing code (404), oversized body (413), and CORS preflight.
  Optionally Miniflare/`wrangler dev` for local runs.
- **Client**: Node-level test of `share.js` against a mock fetch (code parsing,
  error handling); manual in-browser Share→Load round-trip between two
  browsers/devices.
- **Regression**: loading a shared level uses the existing `replaceLevel` /
  size-adopt path already covered by tests.

## Build order (rough; refined in the plan)

1. Worker: routes + KV + shared-secret + CORS + code gen + wordlists; deploy;
   curl round-trip. (Includes the KV setup walkthrough.)
2. Client `share.js` + `config.share`.
3. Toolbar Share / Load UI + dialogs; wire to `replaceLevel`.
4. Docs: `worker/README.md`; update main README controls.
5. (Optional, fast-follow) RLE-compress blocks before upload.

## Later (not v1)

- **Compression**: RLE the block array before upload (levels are mostly empty),
  shrinking ~85 KB → ~1 KB for typical builds. Add a compressed encoding to the
  level format (versioned) so it stays backward-compatible.
- **"My codes"**: keep a small local list of codes this device has created so a
  kid can re-copy them.
- Optional per-IP write rate limiting; optional level TTL / cleanup.
