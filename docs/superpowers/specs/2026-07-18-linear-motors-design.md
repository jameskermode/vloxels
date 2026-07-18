# Vloxels — Linear Motors (sliding platforms & elevators)

**Date:** 2026-07-18
**Status:** Approved design, ready for implementation planning.

## Goal

Add **linear motors** as a sibling to the rotary motors: a motor drives a
carriage that slides back and forth along a **shaft** (a fixed track you build
like arms). A vertical shaft makes an **elevator**; a horizontal shaft makes a
**sliding platform**. Knock-and-carry physics come for free (a lift lifts you,
a slider slides you) because the carriage is just another kinematic body.

## Decisions (from brainstorming)

- The **shaft is a FIXED rail**; a **carriage** (motor + platform) slides along
  it. Travel distance = **shaft length**. Speed: **Slow/Fast** variants.
- **Shaft is non-solid** (approved call): a visible guide the carriage rides
  *along* (its cells are overlapped by the car as it travels), sidestepping
  collisions. (A solid parallel rail was the rejected, fiddlier alternative.)
- **Two motor blocks (Slow/Fast); orientation inferred from the shaft**
  (approved call): a vertical shaft ⇒ lift, a horizontal shaft ⇒ slider. Leaner
  than 4 explicit Slide/Lift blocks.
- **Additive** — no existing block or behaviour is removed, so no migration and
  old levels/examples are unaffected.

## Block registry changes (`blocks.js`)

Add three blocks (ids continue after the rotary set):

| key | id | name | flags |
|-----|----|------|-------|
| `motorLinearSlow` | 13 | Slow Slider | `motor: 'slow'`, `linear: true`, `solid: true` |
| `motorLinearFast` | 14 | Fast Slider | `motor: 'fast'`, `linear: true`, `solid: true` |
| `shaft` | 15 | Shaft | `shaft: true` (non-solid — no `solid` flag) |

- Rotary motors keep `motor: 'slow'|'fast'` (no `linear` flag). The `linear`
  flag is the only thing that distinguishes a linear motor from a rotary one.
- The **carriage platform reuses the existing `blade`/`board` arm blocks** —
  attach them to a linear motor and they become the moving car. No new platform
  block.
- Colours: motors read as "machine" (e.g. a steel blue/green pair distinct from
  the rotary teal/purple); `shaft` a neutral rail colour (e.g. grey), rendered
  as an ordinary static cube.

Palette gains 3 entries: Slow Slider, Fast Slider, Shaft.

## Assembly model (`assemblies.js`, extended)

`computeAssemblies(level)` gains a `kind` per assembly and, for linear motors,
an axis + distance derived from the shaft:

```
assemblies: [
  // rotary (unchanged):
  { kind: 'rotary', motorCell, speed:'slow'|'fast', cells:[...] },
  // linear (new):
  { kind: 'linear', motorCell, speed:'slow'|'fast',
    cells:[...],            // carriage: motor + connected arm cells (the MOVING part)
    axis: [ax,ay,az],       // unit direction the shaft points from the motor
    distance: N }           // number of shaft cells in that straight line
]
movingCells: Set  // motor + carriage-arm cells for EVERY assembly (NOT shaft cells)
```

- **Motor detection:** any block with `def.motor`. `def.linear` ⇒ linear.
- **Carriage flood-fill:** from the motor through connected `arm` cells
  (`blade`/`board`) — exactly like the rotary carriage. Shaft cells are NOT
  arms, so they're never part of the carriage.
- **Shaft detection (linear only):** from the motor cell, look at the 6
  neighbours for a `shaft` block; follow it in a straight line. `axis` = that
  unit direction; `distance` = count of contiguous shaft cells in that line. If
  shafts leave the motor in more than one direction, pick deterministically
  (check ±x, ±y, ±z in order; take the first, follow it straight). A linear
  motor with no shaft ⇒ `distance: 0` (sits still, harmless).
- **Shaft cells are NOT in `movingCells`** — they stay static (rendered as
  ordinary cubes, non-solid so they carry no collider).

## Physics (`motorBodies.js`, extended)

Each assembly still builds one kinematic position-based body at
`motorCell + 0.5` with a cuboid collider per **carriage** cell at local offset
`cell - motorCell`, high friction. Then, per fixed step:

- **rotary:** `setNextKinematicRotation(quatY(angle))` (unchanged).
- **linear:** `setNextKinematicTranslation(center + axis * offset)` where
  `offset` ping-pongs 0 → distance → 0 via a triangle wave advanced at the
  motor's linear speed. The carriage rides from its built position (`offset 0`)
  to the far end of the shaft (`offset = distance`) and back.

`entries[i]` carries what each kind needs (`{ body, kind, angle }` for rotary;
`{ body, kind, center, axis, distance, speed, phase }` for linear). The player's
carry/knockback code is unchanged — it already handles any kinematic body,
translating or rotating.

## Rendering

- **Carriage:** the existing assembly renderer draws each carriage as a group of
  cubes at local offsets and syncs the group's position+rotation from its body
  — for a linear body only the translation changes (rotation stays identity), so
  **no renderer change is needed**; it already copies `body.translation()`.
- **Shaft:** an ordinary **static** cube via `render/voxels.js` (it's not in
  `movingCells`, so it renders normally). Non-solid ⇒ no terrain collider. The
  carriage overlaps the shaft cells as it travels (fine — the shaft is a guide).
- No new render module.

## Editor

Shaft and linear-motor blocks are ordinary clickable static cubes in EDIT (like
the rotary blocks). Build flow: place a Slider motor, draw a straight **Shaft**
line for the track (up for a lift, sideways for a slider), attach **Board**
cubes to the motor for the riding surface, press Play to watch it go.

## Config (`config.js`)

```js
// add alongside the existing motor spin speeds:
motor: {
  slowSpeed: 0.6, fastSpeed: 4.0,          // rotary (radians/sec) — unchanged
  linearSlowSpeed: 1.5, linearFastSpeed: 4.0, // linear (cells/sec)
},
```

## Examples

Additive, so existing examples are untouched. Add a small demo of both — either
a new bundled example ("Machines") or fold a lift + a sliding platform into an
existing level — so the blocks are discoverable. Decide in the plan.

## Non-goals (v1)

- Straight shafts only — no corners, diagonals, or curved tracks.
- One axis per motor; the shaft is a single straight line.
- Elevators ping-pong continuously — no call-buttons / player triggers / floor
  stops.
- Carriage is built from unit cubes (motor + board/blade); no custom geometry.
- Two linear motors sharing one shaft is an edge case (first motor claims it).

## Testing

- `computeAssemblies`: a linear motor + straight shaft ⇒ `kind:'linear'`,
  correct `axis`+`distance`; carriage = motor + arms; shaft cells excluded from
  the carriage and from `movingCells`; a shaft-less linear motor ⇒ distance 0;
  rotary assemblies unchanged.
- `motorBodies` (real Rapier, Node): a horizontal linear assembly translates
  back and forth between the two endpoints; a box resting on a slider platform
  is carried along; a box on a lift platform is raised then lowered (reuse the
  rotary carry-test approach).
- Rendering: carriage group position tracks the body translation.
- Regression: the rotary motor tests still pass against the extended code.

## Rough build order (refined in the plan)

1. Block registry: 3 new blocks + config linear speeds.
2. Extend `computeAssemblies` with `kind` + linear axis/distance/shaft detection
   (+ tests; rotary unchanged).
3. Extend `motorBodies` with linear translation (+ real-Rapier tests).
4. Wire `main.js` (assemblies now include linear; nothing else changes because
   shaft renders statically and the carriage renderer already syncs translation)
   — verify build + integration test.
5. Add a demo example; update README/blocks table.
