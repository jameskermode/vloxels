# Vloxels

A 3D Bloxels-style game: **build** a voxel level on a grid, then **play** it as
a third-person platformer. The signature feature is **spinning objects** with
**real physics** — spinning platforms carry you, and spinning blades knock you
flying.

Built by a parent + 9-year-old team, so the code favours readability over
cleverness. All the fun tuning knobs live in one place:
[`src/config.js`](src/config.js) — try moon gravity, faster blades, a higher
jump.

## Running it

```bash
npm install
npm run dev      # dev server, reachable on the LAN (for Pi/tablet playtests)
```

Open the printed **Network** URL on the MacBook; open the same URL on the
Raspberry Pi 400 and tablets on the same Wi-Fi to playtest.

Production build / preview:

```bash
npm run build    # static site -> dist/
npm run preview  # serve the built site (also --host)
```

To run standalone on the Pi: `npm run build` there, then serve `dist/` with
`npx serve dist` or `python3 -m http.server`.

## Play online (tablets)

Pushing to `main` auto-deploys to **GitHub Pages** via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). One-time setup:
repo **Settings → Pages → Source: GitHub Actions**. After that the game is
playable from the Pages URL on any tablet, no install.

## Controls

**Everywhere**
- **Tab** or the **▶ Play / ■ Stop** button — switch EDIT ⇄ PLAY.
- **F** — toggle the fps / physics step-time counter.

**Edit mode**
- **Tap / left-click** — place the selected block (snaps to the next cell on a
  face; lands on the working layer in empty space).
- **Right-click / long-press** — remove the block under the pointer.
- **Drag** — orbit the camera.
- **`[` / `]`** or on-screen **▲ / ▼** — move the working layer (build in
  mid-air).
- Bottom-left toolbar: **New** and an **Examples** picker. Your level also
  autosaves to the browser.
- **Share** / **Load Code** (when a sharing backend is configured) — Share
  uploads your level and gives you a short code like `brave-fox-42` (with a
  **Copy link** button — send the link and it opens straight to that level);
  Load Code fetches a level by its code. Opening a `?code=…` link auto-loads it.
  This is how levels travel between devices. Set up the backend once via
  [`worker/README.md`](worker/README.md), then set `share.url` in
  [`src/config.js`](src/config.js).

**Play mode**
- **WASD / arrow keys**, or the **touch joystick** (left half) — move
  (camera-relative).
- **Space**, or the **⤒ Jump** button (right half) — jump. In water, **hold**
  to swim up (you can ride a waterfall up!), or **tap** to hop out onto a ledge.

## Blocks

| Block | What it does |
|-------|--------------|
| **Grass / Brick** | solid terrain you stand on |
| **Coin** | spins & bobs; touch to collect (🪙 tally up top) |
| **Slow / Fast Motor** | spins in place; attach Blade/Board cubes next to it and the whole shape spins as one |
| **Blade / Board** | attach to a motor to build custom spinners — a flat shape carries you, a spinning bar knocks you flying. Loose ones are just solid blocks |
| **Slow / Fast Slider** | a linear motor: draw a straight **Shaft** line for the track (up = elevator, sideways = sliding platform) and attach Board/Blade cubes; the car slides along the shaft and back, carrying you |
| **Shaft** | the fixed rail a slider's car travels along; its length sets how far it goes. Drawn see-through because the car rides *through* it — it's a guide, not a wall, so you pass through it too |
| **Water** | a flowing source — spreads down & sideways. Wade shallow water at half speed; deep water you sink into and tread (hold Space to swim up to a shallow edge). Doesn't kill you |
| **Scuba Kit** | a pair of flippers resting on a block — walk over it to wear it, then move fast and float in water for the rest of the run (🤿 shows up top). Vanishes when picked up |
| **Glider** | a hang-glider + jetpack — walk over it to wear it, then fly: hold Space for zippy thrust up, release to glide down, steer with the keys (🪂 up top). Crash into a wall side-on and it drops to the floor to grab again |
| **Start** | where the player spawns (only one) |
| **Goal** | reach it to win, with your coin tally + Replay (only one) |

Adding a new block type is one entry in [`src/blocks.js`](src/blocks.js).

## Level format

Levels are versioned JSON — a flat grid of block ids stored as base64:

```json
{ "format": "vloxels-level", "version": 1, "name": "Coin Run",
  "size": [64, 16, 64], "blocks": "<base64 Uint8Array>" }
```

Levels store their own size, so any size loads (smaller levels resize the world
to fit). The default world size is set in [`src/config.js`](src/config.js).

They persist to `localStorage`, and travel between the MacBook, Pi and tablets
via **Share codes** (see Controls). Bundled examples live in
[`public/levels/`](public/levels/): **Coin Run**, **Spin Bridge**,
**Blade Gauntlet**, **Waterfall**, **Machines**, and **Sky Course** (regenerate them with
`node scripts/gen-levels.mjs`).

## Performance

Targets 60 fps on the MacBook, 30 fps on the Pi 400. See [`PERF.md`](PERF.md)
for measured numbers per milestone. Key rules: instanced voxels, greedy-merged
colliders, fixed 60 Hz physics, no shadow maps, pixel ratio capped at 1.5.

## Project layout

See [`VLOXELS_SPEC.md`](VLOXELS_SPEC.md) for the full design brief. Source is
organised into `render/`, `physics/`, `play/`, `edit/`, and `ui/` under
[`src/`](src/).
