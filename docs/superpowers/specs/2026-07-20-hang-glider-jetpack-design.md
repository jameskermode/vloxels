# Vloxels — Hang-glider + Jetpack (a wearable flight power-up)

**Date:** 2026-07-20
**Status:** Approved design, ready for implementation planning.

## Goal

Add a **glider** pickup: a combined hang-glider + twin jetpack that, when worn,
lets you **fly** — hold Space for zippy jetpack thrust (rise), release to glide
down gently, steer freely with the movement keys. Fly into a wall side-on and
you **crash**: the glider drops to the floor below, to be picked up again for
another attempt. Landing on top of surfaces is fine.

## Decisions (from brainstorming)

- **Drop-to-floor on crash:** a side-on wall hit drops the glider to the nearest
  floor **below the crash point**; you go back and re-grab it.
- **Flight feel:** **zippy on ascent** (jetpack thrust while Space is held),
  **floaty** when gliding/descending.
- **Crash = flying INTO a wall** (your commanded sideways motion gets blocked),
  not merely brushing one. Landing on a horizontal surface never crashes you.
- **Gear is mutually exclusive** with the scuba kit — you wear **one** gear at a
  time, and **the most recently picked-up gear wins** (grab the glider while
  scuba'd ⇒ you now wear the glider; the scuba effect turns off).
- **Additive** — no existing block/id/behaviour removed; reuses the `wear`
  pickup machinery the scuba kit introduced.

## Block registry (`blocks.js`)

Add one entry (id continues after `scuba` = 16):

| key | id | name | flags |
|-----|----|------|-------|
| `glider` | 17 | Glider | `wear: 'fly'` (non-solid — no `solid` flag) |

- Colour: **green `0x4caf50`** (the sail colour; the block/palette swatch reads as
  the kite, distinct from the teal scuba and blue water). The jetpack cylinders
  are **grey `0x9098a0`**.
- Already excluded from the plain-voxel renderer (the `def.wear` skip added for
  scuba covers any `wear` block); drawn cosmetically by `spinners.js`.
- Palette gains one entry: Glider.

## Gear model — one slot, most-recent wins (`player.js`)

Replace the scuba-only `wearing` boolean with a single **`gear`** slot:

```
gear: null | 'scuba' | 'fly'
```

- `setWearing(kind)` sets `gear = kind` and shows exactly that gear's mesh
  (hiding the other's). Picking up either pickup calls `setWearing` with its
  kind, so a new pickup simply **replaces** the current gear (mutual exclusion,
  latest wins).
- Effect selection keys on `gear`: the scuba water effects apply when
  `gear === 'scuba'`; flight applies when `gear === 'fly'`.
- Back-compat: keep a `get wearing()` returning `gear === 'scuba'` (so the
  existing scuba tests/logic keep working) and add `get gear()`.

## Pickup (reuse the `wear` path)

Unchanged from scuba: a `wear` block registers a sensor (`voxelBody.js`), the
overlap is drained in `rules.js`'s `wear` branch → `hooks.onWear(def.wear)`.
`main.js`'s `onWear(kind)` calls `player.setWearing(kind)`, shows that gear's HUD
chip (and hides the other's). No change to the pickup plumbing itself — the glider
rides the exact rails the scuba kit already laid, keyed by `def.wear` = `'fly'`.

## Flight physics (`player.js` + `config.js`)

While `gear === 'fly'`, flight **replaces** the normal gravity/jump/water branch:

- **Vertical:** Space held ⇒ `ny` eases toward `fly.rise` (**+6**, zippy);
  Space released ⇒ `ny` eases toward `fly.sink` (**−1.5**, floaty glide). Use
  a firm ease up (responsive thrust) and a soft ease down (drifty).
- **Horizontal:** target = intent × `fly.speed` (**7**) with `fly.control`
  (**0.5**, responsive but slightly drifty) — full free navigation, camera-
  relative, same as the existing intent path.
- You rest naturally when you glide onto a surface (the floor collider stops the
  gentle sink); Space lifts off again. Landing on top is allowed (never a crash).
- Flight takes precedence over water while worn (you can glide over/into water and
  Space still lifts you out); the scuba branch is not reached because `gear` is
  `'fly'`, not `'scuba'`.

Reuses existing inputs — Space via `jumpHeld` (continuous, like swim-hold),
steering via `readMoveIntent` — so **no new controls** and touch works
(jump button + joystick).

New `config.js` block under `player`:

```js
// Glider (hang-glider + jetpack): hold Space for zippy jetpack thrust (rise),
// release to glide down gently; steer freely. Fly into a wall side-on and you
// drop it. Values in units/sec.
fly: {
  rise: 6,       // upward speed while Space (jetpack) is held — zippy
  sink: -1.5,    // gentle glide-down speed when not thrusting — floaty
  speed: 7,      // horizontal navigation speed
  control: 0.5,  // horizontal steering responsiveness (0..1)
  riseEase: 0.4, // how fast vertical velocity eases toward the target (firm up)
  crashSpeed: 2.0, // if you COMMANDED at least this horizontal speed but were
  //                  blocked (moved < ~1/3 of it), you hit a wall ⇒ crash
},
```

## Crash detection + drop lifecycle (the novel part)

**Detection (`player.js`, each fixed step while flying):** remember the position
at the previous step. If last step you commanded a horizontal speed ≥
`fly.crashSpeed` but actually moved less than ~1/3 of the commanded distance,
your sideways motion was blocked by a block — a **side-on crash**. (Landing on a
floor doesn't reduce horizontal movement, so it never trips this. Gently
ascending beside a wall without steering into it doesn't either.)

**On crash:** set `gear = null` (flight ends → you fall under normal gravity),
hide the glider mesh, and call the injected `onGliderDrop(position)` callback with
the player's current position.

**Dropped pickup (`main.js` + small additions):** `onGliderDrop(pos)` finds the
drop cell — scan the level column at `(pos.x, pos.z)` downward from `pos.y` for
the first solid block; the pickup rests in the empty cell just above it. If no
floor is found (a pit), use the player's **last-grounded** cell instead (always a
real floor) so the glider is never lost. Then spawn a runtime pickup there:

- `terrain.addSensor('glider', cx, cy, cz)` — expose the currently-internal
  `addSensor` so a sensor can be added at runtime (not only from placed blocks).
- `spinners.addItem([cx,cy,cz], BLOCKS.glider)` — expose a new `addItem` so a
  cosmetic (bobbing glider icon) can be added at runtime.

Re-pickup needs **no new code**: the runtime sensor's `blockKey` is `'glider'`,
so `rules.js`'s existing `wear` branch fires `onWear('fly')` and calls
`terrain.removeSensor` + `spinners.removeItem` — the same path as a placed glider.

**Persistence / no soft-locks — "the glider always exists somewhere reachable":**

- Crash ⇒ dropped at the floor below (or last-grounded if over a pit).
- **Death while flying** (`respawn()` with `gear === 'fly'`): drop the glider at
  the player's **last-grounded** cell (via `onGliderDrop`), then clear gear — so
  dying can't delete it.
- Death while wearing scuba: keep it (scuba lasts until the level ends, as
  today). Death while not flying: nothing to drop.
- A fresh play session / level reload starts clean (fresh player ⇒ `gear = null`;
  the level's placed gliders are back).

`respawn()` therefore gains a small branch: if `gear === 'fly'`, drop then clear;
otherwise unchanged. The player tracks `lastGroundedPos`, updated each step while
grounded.

## Rendering

- **Worn (`player.js`):** build a glider "rig" once and add it as a child of the
  player mesh, hidden until `gear === 'fly'`: a **triangular delta sail** above
  the head (a flat wide triangle, tilted back) + **two short cylinders** (the
  jetpacks) low on the back. **Green sail (`0x4caf50`), grey cylinders
  (`0x9098a0`).** Toggled by `setWearing`.
- **World pickup + dropped icon (`spinners.js`):** extend the cosmetic renderer
  so a `wear === 'fly'` block draws a small **glider icon** (a compact sail +
  two tiny cylinders), bobbing (no spin) like the scuba flippers. Factor a
  shared `makeGliderMesh(scale)` reused by the worn rig and the pickup/icon.
  `spinners.rebuild` picks the mesh by `def.wear` (`'scuba'` ⇒ flippers,
  `'fly'` ⇒ glider). Add the `addItem(cell, def)` method used by runtime drops.
- **HUD (`hud.js` + `main.js`):** a 🪂 "Flying" chip while `gear === 'fly'`,
  mirroring the scuba chip. `onWear` shows the chip matching the new gear and
  hides the other; both hide on stop. (Because gear is mutually exclusive, at
  most one chip shows.)

## Editor

The Glider is an ordinary placeable, non-solid marker in EDIT (like scuba/coin):
click to place, right-click/long-press to remove; it renders (bobbing glider icon)
in both modes.

## Non-goals (v1)

- No stamina/fuel — flight lasts until you crash, switch gear, or finish the level.
- No mid-air collision damage beyond dropping the glider; the player keeps falling
  normally after a crash (a fall into the void respawns them as usual).
- No new controls — Space (thrust) and the movement keys/joystick are reused.
- One gear slot only (scuba XOR fly); picking one up always replaces the other.
- The dropped pickup is a single runtime entity per drop; no stacking/durability.
- Crash = *steering into* a wall; merely grazing a wall while rising is not a
  crash (tunable via `fly.crashSpeed`).

## Testing (Node + real Rapier, run from repo root)

- **Block registry:** `glider` id 17, `wear:'fly'`, non-solid, in the palette;
  scuba/coin unaffected.
- **Gear mutex (real player):** `setWearing('scuba')` then `setWearing('fly')` ⇒
  `gear==='fly'`, `wearing===false`; the scuba water effect is off and flight is
  on; and vice-versa (fly then scuba).
- **Flight physics (real player, real Rapier):** wearing the glider, holding
  Space rises (gains height) while a non-wearer falls; releasing Space glides
  down gently (sinks far slower than free-fall); horizontal intent navigates at
  ~`fly.speed`. Dry-land/non-wearer movement unchanged (regression).
- **Crash + drop:** flying horizontally INTO a wall fires `onGliderDrop` and
  clears flight; flying the same distance over open floor does NOT
  (`onGliderDrop` never fires, still flying).
- **Dropped pickup lands + re-grants:** after a crash, a sensor + cosmetic exist
  at the floor cell below; simulate the player overlapping it ⇒ `onWear('fly')`
  fires and the dropped pickup is removed (re-pickup works).
- **Death safety:** `respawn()` while `gear==='fly'` drops the glider (onGliderDrop
  fired) and clears gear; `respawn()` while `gear==='scuba'` keeps scuba.
- **Runtime pickup plumbing:** `terrain.addSensor` registers a sensor like a
  placed block; `spinners.addItem` creates a bobbing (non-spinning) cosmetic that
  `removeItem` removes.

## Rough build order (refined in the plan)

1. Block registry entry + config `fly` values (+ palette label).
2. Player gear model: `wearing` boolean → `gear` slot (mutex); keep scuba effects
   working via `gear==='scuba'` (+ regression tests).
3. Flight physics: rise/glide/navigate while `gear==='fly'` (+ real-player tests).
4. Crash detection + `onGliderDrop` callback + death-drop in `respawn()` (+ tests).
5. Runtime pickup plumbing: `terrain.addSensor`, `spinners.addItem`, glider
   cosmetic in `spinners.js`, `makeGliderMesh` (+ tests).
6. `main.js` drop handler (find floor / last-grounded, spawn pickup) + worn glider
   rig on the player + HUD 🪂 chip + onWear gear-switch wiring.
7. Demo example (a glider + some walls/gaps to fly through) + README/blocks table.
