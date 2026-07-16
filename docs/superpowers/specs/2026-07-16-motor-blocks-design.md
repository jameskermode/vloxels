# Vloxels — Motor Blocks (composable spinners)

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation planning.

## Goal

Replace the two pre-baked spinner blocks (Blades, Platform) with a **composable**
system: a **motor** block that rotates, and **arm** blocks you attach to it to
build custom spinning obstacles. A 9-year-old's idea — and it also *unifies* the
two behaviours, because "knock you flying" (blades) and "carry you along"
(platform) are the **same kinematic physics** at different orientations. Build
spokes → blades; build a flat disc → a carry-platform; build anything → whatever
they dream up.

## Decisions (from brainstorming)

- **Attachment:** a dedicated **arm** block type; a motor gathers arms by
  flood-fill (6-way adjacency). Terrain (grass/brick) is not attachable, so a
  motor never grabs the ground.
- **Arm flavours:** two — **Blade** and **Board** — physically identical 1×1×1
  cubes, differing only in colour/name so kids can label intent.
- **Old blocks:** replace Blades & Platform; migrate the example levels; auto-
  convert the retired block ids in old saved/shared levels so nothing breaks.
- **Motor speed:** two motor blocks, **Slow Motor** and **Fast Motor** (no per-
  block state).
- **Edit vs play (judgment call, approved):** assemblies are **static in EDIT**
  (plain clickable cubes) and **spin only in PLAY**, so building precise shapes
  is easy.
- **Unattached arms (judgment call, approved):** an arm not connected to a motor
  is just a normal solid cube (usable as a coloured building block).

## Block registry changes (`blocks.js`)

Retire from the palette: `spinner` (id 5, Blades) and `platformSpin` (id 6,
Platform). Keep ids 5 and 6 reserved as **legacy** markers for migration only
(not placeable). Add four new blocks with new ids:

| key | id | name | flags |
|-----|----|------|-------|
| `motorSlow` | 9 | Slow Motor | `motor: 'slow'`, solid |
| `motorFast` | 10 | Fast Motor | `motor: 'fast'`, solid |
| `blade` | 11 | Blade | `arm: true`, solid |
| `board` | 12 | Board | `arm: true`, solid |

Colours: motors read as "machine" (e.g. steel-teal slow, steel-orange fast);
Blade a hazard hue (red/purple), Board a warm plank hue (tan/brown). All four
render as ordinary cubes in EDIT.

Unchanged: solid(1), brick(2), water(3), coin(4), start(7), goal(8).

## Assembly model

New pure helper `src/assemblies.js`:

```
computeAssemblies(level) -> {
  assemblies: [ { motorCell:[x,y,z], speed:'slow'|'fast', cells:[[x,y,z],...] } ],
  movingCells: Set("x,y,z")   // every motor + attached-arm cell
}
```

- Find all motor cells (`motorSlow`/`motorFast`).
- For each motor (deterministic order by grid index), BFS through **unclaimed**
  arm cells (6-way adjacency) to gather its assembly (`cells` = the motor + its
  arms). Claim arms so two motors can't double-claim; if arms bridge two motors,
  the first motor wins and the second gets whatever remains reachable
  (acceptable edge case).
- `movingCells` = union of all assembly cells (motors + attached arms). Arms not
  reachable from any motor are **not** in `movingCells` → they stay static.

Recomputed on demand (cheap, like `computeWater`). Only needed in PLAY, plus at
enter-PLAY to know which cells to exclude from static rendering/physics.

## Physics (`physics/motorBodies.js`, replaces `spinnerBodies.js`)

Per assembly:
- One **kinematic position-based** rigid body at the motor cell centre
  (`motorCell + 0.5`).
- One cuboid collider (half-extent 0.5) per assembly cell, at local offset
  `cell - motorCell`. High friction (`platformFriction`, so it carries),
  restitution ~0.1.
- `update(dt)`: `angle += speed * dt`; `setNextKinematicRotation(quatY(angle))`
  once per fixed step (speed from `config.motor.{slowSpeed,fastSpeed}`).

The player's existing carry (surface-velocity tracking) and knockback (kinematic
contact) code needs no changes — it already handles kinematic bodies.

## Rendering

- **EDIT:** motors + arms render as normal instanced cubes via `render/voxels.js`
  (so faces are clickable for building). `voxels.rebuild(level)` unchanged in
  edit (motors/arms are just solid, non-spinner cubes now).
- **PLAY:** compute assemblies; render each as a group of cube meshes at their
  local offsets, and **sync the group's position+rotation from its kinematic
  body** each frame. Exclude assembly cells from the static voxel cubes:
  `voxels.rebuild(level, movingCells)` skips cells in `movingCells`; the terrain
  collider builder does the same.
- **Coins are untouched** — still a cosmetic spinner mesh + sensor (the existing
  coin path in `render/spinners.js` stays; motors/arms get their own assembly
  renderer, e.g. `render/assemblies.js`).

So today's per-block spinner system generalises into a per-**assembly** system:
`computeAssemblies` → `motorBodies` (physics) + assembly meshes (render), both
active only in PLAY.

## Editor

- Palette: Grass, Brick, Water, Coin, **Slow Motor, Fast Motor, Blade, Board**,
  Start, Goal (old Blades/Platform removed).
- Because motors/arms are ordinary cubes in EDIT, you can face-click to place and
  remove them (a nice improvement — today's spinners can't be clicked).
- Build flow: place a motor, then attach Blade/Board cubes next to it (or to
  other attached arms) to grow the shape; press Play to watch it spin.

## Migration (`migrateLegacyBlocks(level)`)

Called wherever a level is loaded (autosave `load`, shared/imported
`replaceLevel`, example fetch). For each cell holding a legacy id:
- **id 5 (legacy Blades)** → `motorFast` at that cell + `blade` arms in the 4
  horizontal neighbours **if empty** (recreates the cross).
- **id 6 (legacy Platform)** → `motorSlow` at that cell + `board` arms in the
  horizontal neighbours **if empty** (recreates a small disc).
- Best-effort: only fill empty in-bounds neighbours; a bare motor just spins
  harmlessly if there's no room. Guarantees old autosaves and old shared codes
  still open with a spinning thing roughly where it was.

Regenerate the four example levels (`scripts/gen-levels.mjs`) using motor+arms
(e.g. Blade Gauntlet → fast motors with blade spokes; a carry-platform crossing
→ slow motors with board discs).

## Config (`config.js`)

```js
motor: { slowSpeed: 0.6, fastSpeed: 4.0 }, // radians/sec (old platform/blade speeds)
```
(Replaces the `spin.bladeSpeed` / `spin.platformSpeed` usage for motors; keep
`spin.coin*` for coins.)

## Non-goals (v1)

- Only vertical-axis (y) rotation. No horizontal wheels / paddle-wheels yet.
- No per-motor speed (only the two Slow/Fast blocks).
- Motors only **rotate** — they don't translate.
- Arms are 1×1×1 cubes only (compose shapes from them; no custom arm geometry).
- Two motors joined by arms is an edge case (first motor claims the shared
  arms); not a supported "geared" mechanism.

## Testing

- `computeAssemblies`: flood-fill correctness (motor + connected arms; unattached
  arms excluded; terrain never attaches; two-motor claim determinism).
- `motorBodies` with real Rapier (Node): a built assembly spins; a box resting on
  a flat board-disc assembly is carried; a box beside a fast blade-spoke gets
  knocked (reuse the existing player carry/knockback test approach).
- Migration: a level with legacy ids 5/6 converts to motors (+ arms where empty)
  and never crashes / never goes out of bounds.
- Regression: player carry/knockback tests still pass against the new bodies.

## Rough build order (refined in the plan)

1. Block registry: new blocks + legacy id constants; config speeds.
2. `computeAssemblies` (pure) + tests.
3. `motorBodies` kinematic bodies + tests (real Rapier).
4. Play rendering (assembly meshes synced from bodies) + `voxels`/terrain
   exclusion of `movingCells`.
5. `main.js` wiring: enter/exit PLAY builds/frees assemblies; loop update.
6. `migrateLegacyBlocks` + call sites + tests.
7. Regenerate examples; update README/blocks table; remove dead spinner-block
   code paths.
