# Vloxels — Project Skeleton & Implementation Brief

A 3D Bloxels-style game: build a voxel level on a grid, then play it as a
third-person platformer. Signature feature: **spinning objects** placeable in
the landscape (rotating hazards, coins, platforms) with **real physics** —
spinning platforms carry the player, blades knock them flying. Built by a
parent + 9-year-old team, so favour readable code and small, demo-able
milestones over cleverness.

## Target platforms & performance budget

- **Dev machine:** MacBook (implement here with Claude Code).
- **Primary playtest target:** Raspberry Pi 400, Chromium, WebGL2 on
  VideoCore VI. This is the performance floor — treat it as a low-end
  mobile GPU. Note the Pi 400's CPU (Cortex-A72) is also weak: the physics
  budget matters as much as the render budget.
- **Also playable on:** Amazon Fire tablet (Silk browser) and Samsung
  Android tablet (Chrome), via URL. Touch controls required.

Performance rules (non-negotiable, enforce from milestone 1):
- Voxels rendered via `THREE.InstancedMesh`, one instance pool per block
  type. Never one `Mesh` per voxel.
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))`.
- No shadow maps. Lighting = 1 hemisphere light + 1 directional light.
- Flat-shaded low-poly aesthetic; `MeshLambertMaterial` or vertex colours.
  No PBR textures, no postprocessing.
- Antialias off on the renderer; rely on low pixel ratio + chunky style.
- Physics: fixed 60 Hz timestep with an accumulator; **merged voxel
  colliders** (see below), never one collider per voxel; keep total
  collider count < ~500 on a typical level.
- Target 60 fps on MacBook, accept 30 fps on Pi. Show an fps counter
  (plus physics step time in ms) toggleable with `F`.

## Stack

- **Three.js** (latest), plain **JavaScript ES modules** — no TypeScript,
  no framework. A 9yo will read this code.
- **Rapier** physics via **`@dimforge/rapier3d-compat`**. The `-compat`
  build inlines the wasm as base64, so it works with Vite with zero
  bundler configuration — one async `RAPIER.init()` at boot. Chosen over
  cannon-es (unmaintained-ish, slower, poorer contact quality on rotating
  kinematic bodies) and Ammo.js (heavy, awful API for beginners). Rapier
  is fast enough on the Pi's A72 for this scene size, deterministic, and
  its API reads cleanly.
- **Vite** for dev server and static build. `npm create vite@latest`
  vanilla template as the base.
- No backend. Levels persist to `localStorage` and export/import as JSON
  files. Static hosting (GitHub Pages) is the deployment story for tablets.

`package.json` scripts:
- `dev` → `vite --host` (so Pi/tablets on the LAN can playtest against the
  MacBook during development)
- `build` → `vite build`
- `preview` → `vite preview --host`

## Repository layout

```
vloxels/
├── index.html
├── package.json
├── vite.config.js
├── README.md              # how to run, controls, level format
├── public/
│   └── levels/            # bundled example levels (JSON)
└── src/
    ├── main.js            # bootstrap: RAPIER.init(), renderer, modes, loop
    ├── config.js          # grid size, colours, physics tuning in ONE place
    ├── blocks.js          # block type registry (the heart of the design)
    ├── level.js           # Level class: 3D grid data + (de)serialisation
    ├── storage.js         # localStorage save/load, JSON file export/import
    ├── render/
    │   ├── scene.js       # scene, lights, ground plane, sky colour
    │   ├── voxels.js      # InstancedMesh builder; rebuild-on-edit
    │   └── spinners.js    # spinner meshes, synced FROM physics bodies
    ├── physics/
    │   ├── world.js       # Rapier world, fixed-step loop, event queue
    │   ├── voxelBody.js   # static body + greedy-merged cuboid colliders
    │   └── spinnerBodies.js # kinematic bodies for platforms/blades, sensors
    ├── play/
    │   ├── player.js      # dynamic capsule body + movement controller
    │   ├── camera.js      # third-person follow camera
    │   └── rules.js       # coins, hazards→respawn, goal→win (sensor events)
    ├── edit/
    │   ├── editor.js      # raycast placement/removal, layer navigation
    │   └── palette.js     # block picker UI
    └── ui/
        ├── hud.js         # mode toggle, coin count, win overlay, fps
        └── touch.js       # virtual joystick + jump button (pointer events)
```

## Core design

### Block registry (`blocks.js`)

Single source of truth. Every block type is an entry:

```js
export const BLOCKS = {
  solid:   { id: 1, color: 0x7ec850, solid: true },
  brick:   { id: 2, color: 0xb0522d, solid: true },
  hazard:  { id: 3, color: 0xe04040, solid: false, kills: true },
  coin:    { id: 4, color: 0xffd24a, solid: false, collect: true, spinner: 'coin' },
  spinner: { id: 5, color: 0xc040e0, solid: false, kills: false, spinner: 'blades' },
  platformSpin: { id: 6, color: 0x40a0e0, solid: false, spinner: 'platform' },
  start:   { id: 7, color: 0xffffff, solid: false, unique: true },
  goal:    { id: 8, color: 0x40e0a0, solid: false, wins: true },
};
```

(Note `blades` no longer kills by default — with real physics, getting
whacked off the platform by a spinning blade is funnier and fairer than
instant death. A `killBlades` variant can kill via sensor if wanted.)

Adding a new block type = adding one entry (+ optionally a spinner style).
This is the main extension point the 9yo will use.

### Level model (`level.js`)

- Fixed-size 3D grid, default **32 × 8 × 32** (x, y, z), stored as a flat
  `Uint8Array` of block ids. Grid size lives in `config.js`.
- Methods: `get(x,y,z)`, `set(x,y,z,id)`, `isSolid(x,y,z)`, `find(id)`,
  `toJSON()`, `static fromJSON(obj)`.
- JSON format (versioned from day one):

```json
{
  "format": "vloxels-level",
  "version": 1,
  "name": "Lava Run",
  "size": [32, 8, 32],
  "blocks": "<base64 of the Uint8Array>"
}
```

### Physics world (`physics/world.js`)

- One `RAPIER.World`, gravity `(0, -20, 0)` (snappier than −9.81 for a
  platformer; tune in `config.js`).
- **Fixed timestep**: accumulate real dt (clamped to 50 ms), step the world
  at exactly 1/60 s per step, render with the latest state (no
  interpolation in v1 — at these speeds it's not visible).
- Owns the `RAPIER.EventQueue`; `rules.js` drains sensor intersection
  events each frame.
- Physics runs **only in PLAY mode**. Entering PLAY builds the world from
  the level; leaving PLAY frees it (`world.free()`) — rebuild is cheap and
  avoids stale-body bugs after edits.

### Voxel colliders (`physics/voxelBody.js`)

- One **static rigid body** for all solid terrain.
- **Greedy run merging**: walk the grid and merge consecutive solid voxels
  along x into single cuboid colliders (1D merging is ~15 lines, teachable,
  and typically cuts collider count 5–10×; full 3D greedy meshing is
  explicitly out of scope). Assert/log the final collider count.
- Non-solid special blocks (`hazard`, `coin`, `goal`) get **sensor
  colliders** (one cuboid each, slightly shrunk, e.g. 0.8³) attached to the
  static body, with `userData`-style lookup table mapping collider handle →
  {blockKey, cell} for `rules.js`.

### Spinners (`render/spinners.js` + `physics/spinnerBodies.js`) — the signature feature

Each spinner block gets a mesh **and** (in PLAY mode) a physics body. The
mesh is synced *from* the body every frame (`body.translation()` /
`body.rotation()`), so render and physics can never disagree.

- `coin`: thin gold cylinder, spins about **y**, gentle bob. Physics: a
  small **sensor** cuboid only (no solid body) — purely collectable, the
  visual spin is cosmetic (mesh-driven, no kinematic body needed).
- `blades`: two crossed long boxes spinning fast about **y**. Physics: a
  **kinematic position-based** rigid body with two cuboid colliders
  (the crossed boxes), rotated each step via
  `setNextKinematicRotation()`. The solver then imparts realistic knockback
  to the player on contact — this is the payoff of using a real engine.
- `platform`: flat square platform (e.g. 2×0.25×2 units, centred on the
  cell), kinematic position-based body, slow y-rotation via
  `setNextKinematicRotation()`. The player standing on it is carried and
  rotated by contact friction — set platform collider friction ~1.0.

Spin speeds and sizes live in `config.js`. Expected spinner count < 100.

In EDIT mode there are no bodies; `spinners.js` falls back to simple
mesh-only rotation so the level still looks alive while editing.

### Player (`play/player.js`)

- **Dynamic rigid body**: capsule (radius 0.3, half-height 0.45),
  `lockRotations()` so it never tips over, `setCcdEnabled(true)` (fast
  blades + thin colliders = tunnelling risk), linear damping ~0.2,
  friction ~0.5, restitution 0.
- Movement controller (runs before each physics step):
  - Read input direction (camera-relative), compute target horizontal
    velocity (`speed` ~6 u/s), and drive the body toward it by setting
    `linvel` x/z directly while **preserving** y — but blend rather than
    stomp: `v.x = lerp(v.x, target.x, control)` with `control` ~0.25 in
    air, ~1.0 grounded. Stomping x/z entirely would cancel blade knockback
    and platform carry, which is the whole point of the engine.
  - **Grounded check**: short downward ray or shape-cast from the capsule
    base (Rapier `castShape`), excluding the player's own collider.
  - Jump = set `linvel.y = jumpSpeed` (~8.5) when grounded, with coyote
    time (~0.1 s) and a jump buffer (~0.1 s) — cheap to add, makes it feel
    dramatically better for a kid.
- Falling below y = −5 → respawn at `start` (teleport with
  `setTranslation`, zero velocity).
- All tuning constants in `config.js` with comments — velocity tuning is a
  brilliant parent+kid experiment ("what if gravity were moon gravity?").

### Rules (`play/rules.js`)

Drains the physics event queue each frame:
- Player ∩ `collect` sensor → remove coin (mesh + sensor), increment count.
- Player ∩ `kills` sensor → respawn at `start`.
- Player ∩ `goal` sensor → win overlay with coin tally and Replay button.

### Camera (`play/camera.js`)

- Third-person follow: offset behind and above the player, smoothed with
  exponential damping. No orbit controls in play mode (keep it simple on
  touch). Editor mode uses `OrbitControls`.

### Editor (`edit/editor.js`)

- Raycast from pointer against a **ground plane + existing voxels**;
  clicking a voxel face places the selected block in the adjacent cell
  (Minecraft-style), right-click / long-press removes.
- A horizontal "working layer" indicator (y-level) adjustable with
  `[` / `]` or on-screen buttons helps place blocks in mid-air.
- Palette (`edit/palette.js`): row of coloured buttons generated from
  `BLOCKS`, current selection highlighted. Big touch targets (min 48 px).
- `start` and `goal` are unique: placing a new one removes the old one.

### Modes & loop (`main.js`)

- `await RAPIER.init()` before anything else at boot.
- Two modes: **EDIT** and **PLAY**, toggled by a big HUD button (and `Tab`).
- Entering PLAY snapshots the level (so collected coins restore on returning
  to EDIT), builds the physics world, spawns the player at `start`
  (default: grid centre top if unset). Leaving PLAY frees the world.
- Single `requestAnimationFrame` loop: accumulate dt → fixed physics steps
  (PLAY only) → sync meshes from bodies → render. Spinner meshes animate in
  both modes (body-driven in PLAY, cosmetic in EDIT).

### Input (`ui/touch.js` + keyboard)

- Keyboard: WASD/arrows move, Space jump, Tab toggles mode.
- Touch: left-half virtual joystick (pointer events, not the Touch API —
  works with mouse too), right-half jump button. Show touch UI only when a
  touch pointer is detected.

### Storage (`storage.js`)

- Autosave current level to `localStorage` on every edit (debounced 1 s).
- "Export" downloads the JSON file; "Import" via `<input type="file">`.
  This is how levels travel between MacBook, Pi, and tablets.

## Milestones (implement in order; each ends demo-able)

1. **Scaffold + spinning cube.** Vite project, `RAPIER.init()` smoke test
   (log a stepped world), renderer, lights, ground grid, one spinning cube,
   fps counter. *Proves the toolchain — including wasm — end-to-end;
   playtest this on the Pi and in Fire's Silk browser immediately.*
2. **Level + instanced voxels.** Level model, block registry, hardcoded
   test level rendered via InstancedMesh.
3. **Editor.** Raycast place/remove, palette, layer control, OrbitControls,
   autosave to localStorage.
4. **Physics sandbox.** Build static voxel colliders (with greedy run
   merging) from the level; drop a dynamic debug ball into the world to
   watch it bounce around the terrain. *Kids love this milestone.*
5. **Play mode.** Player capsule body, movement controller, grounded
   check, jump, follow camera, mode toggle, respawn on falling.
6. **Spinners + rules.** Coins, kinematic blades (knockback!), spinning
   carry-platforms, goal, win screen.
7. **Touch + polish.** Virtual joystick, jump button, export/import,
   2–3 bundled example levels, README with controls.

## Testing & playtest workflow

- MacBook dev: `npm run dev`; playtest from Pi/tablets over LAN via the
  `--host` URL while iterating.
- Pi standalone: `npm run build`, copy `dist/` (or `git pull` + build on
  the Pi — build is fine there, dev server also works), serve with
  `npx serve dist` or `python3 -m http.server`.
- Tablets: same LAN URL, or push `dist/` to GitHub Pages.
- Keep a `PERF.md` noting fps **and physics step time** on Pi at each
  milestone; if Pi fps < 25 or step time > 4 ms, stop and optimise
  (first suspects: collider count, CCD scope) before adding features.

## Explicit non-goals (v1)

No multiplayer, no sound (leave a stub `sfx.js` hook), no textures, no
level browser/sharing service, no chunked/infinite worlds, no full 3D
greedy meshing (1D run merging only), no ragdolls/joints, no TypeScript,
no React. Resist all of these.
