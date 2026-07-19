# Vloxels — Scuba Kit (a wearable underwater-speed pickup)

**Date:** 2026-07-19
**Status:** Approved design, ready for implementation planning.

## Goal

Add a **scuba kit**: a pickup entity that sits on top of a block (taking up no
space), drawn as a pair of flippers. Walk over it and the player **wears** it —
the flippers vanish from the world and appear below the orange player cylinder —
granting faster, floatier movement **underwater**. It lasts for the rest of the
run (survives deaths/respawns) and is only "used up" by finishing the level.

## Decisions (from brainstorming)

- **Underwater horizontal speed with scuba: 1.3× land speed** (vs the normal
  0.5× water penalty) — water becomes the fastest way to travel.
- **Scuba also improves vertical movement in deep water:** you **hover**
  (neutral buoyancy) instead of sinking when idle, and **swim up faster**.
- **Reuses the coin pickup machinery** (non-solid marker + sensor + cosmetic
  mesh), so it's additive and small.
- **Not unique** — you may place several; the first pickup grants the (permanent)
  ability and any others are consumed harmlessly.
- **Additive** — no existing block, id, or behaviour is removed; no migration.

## Block registry (`blocks.js`)

One new entry (id continues after `shaft` = 15):

| key | id | name | flags |
|-----|----|------|-------|
| `scuba` | 16 | Scuba Kit | `wear: 'scuba'` (non-solid — no `solid` flag) |

- `wear` is a NEW flag: "picking this up puts on gear identified by the string".
  It is the only thing distinguishing a wearable from a coin.
- Colour: **dark teal `0x11333a`** — distinct from the orange player and blue
  water.
- Palette gains one entry: Scuba Kit.

## Pickup model (reuse the coin path)

Coins already work as: non-solid block → **sensor** collider in
`voxelBody.js` → overlap drained in `rules.js` → remove sensor + cosmetic mesh +
fire a hook. The scuba kit rides the same rails:

- **Sensor:** in `voxelBody.js`, the sensor condition becomes
  `def.collect || def.wins || def.wear` (currently `collect || wins`). Everything
  else about `addSensor` is unchanged.
- **Rules:** in `rules.js`'s `drain()`, add a branch after the coin branch:

  ```js
  } else if (def.wear) {
    terrain.removeSensor(sensorHandle);
    spinners.removeItem(info.cell);   // was removeCoin — generalised (see Rendering)
    hooks.onWear(def.wear);           // 'scuba'
  }
  ```

- **Hook:** `main.js` passes a new `onWear` hook into `createRules` that calls
  `play.player.setWearing(kind)` and shows the HUD indicator. (Existing hooks:
  `onRespawn`, `onCoin`, `onWin`.)

## Rendering

### The world entity (a pair of flippers)

`render/spinners.js` already draws bodiless cosmetic pickups (coins) and animates
them in EDIT and PLAY. Extend it — do NOT add a parallel module:

- Add `makeFlippersMesh(color)` — a `THREE.Group` of two small tapered fin shapes
  (flattened boxes, splayed in a shallow V), sitting **low in the cell** so they
  rest on the block below (base near `y + 0.15`, not the cell centre like a coin).
- In `rebuild()`, alongside the `spinner === 'coin'` case, handle
  `def.wear === 'scuba'`: build a flippers mesh, register it in the same `items`
  map (with a marker so `update()` knows how to animate it).
- **Animation:** a gentle vertical **bob** only (reuse `coinBob`/`coinBobSpeed`),
  **no spin** (spinning flippers look wrong).
- Rename `removeCoin(cell)` → `removeItem(cell)` (coins call the same). It only
  removes from `items`, so the rename is mechanical; update the one caller in
  `rules.js`.

### Worn on the player (`play/player.js`)

- Build a small flippers mesh once and add it as a **child of the player mesh**,
  positioned **below the capsule** (at the feet, `y ≈ -REACH`), oriented pointing
  down/back. Start it `visible = false`.
- `setWearing(kind)` sets the `wearing` flag and toggles the flippers child
  `visible = true`.

### HUD indicator

- A small element (a 🤿 emoji / "Scuba" chip) in the HUD, hidden by default,
  shown when scuba is picked up and hidden on respawn-to-fresh / new run. Wire it
  through the `onWear` hook. Keep it subtle; it exists only so the player knows
  they have the kit.

## Physics / effect (`play/player.js` + `config.js`)

A single `wearing` boolean on the player. It changes **only underwater**
behaviour; dry-land movement is byte-for-byte unchanged.

| behaviour | normal water | with scuba |
|-----------|--------------|------------|
| horizontal speed multiplier | `waterSpeedMult` 0.5 | `scubaSpeedMult` **1.3** |
| idle deep-water vertical | sink toward `waterSink` (−1.5) | ease toward `scubaSink` (**0** — hover) |
| swim-up (hold) max speed | `swimSpeed` 6.5 | `scubaSwimSpeed` (**8.5**) |

Implementation in `fixedUpdate`: where the code currently reads
`P.waterSpeedMult`, `P.waterSink`, and `P.swimSpeed`, select the scuba value when
`wearing` is true. No other branch changes. `waterControl`, the deliberate-tap
`swimJump`, and the soft-bottom rest stay as they are.

New `config.js` values under `player`:

```js
scubaSpeedMult: 1.3, // horizontal speed (× land) underwater while wearing scuba
scubaSwimSpeed: 8.5, // faster swim-up with scuba
scubaSink: 0,        // neutral buoyancy: hover instead of sinking when idle
```

## Persistence

- The `wearing` flag lives on the player object.
- `respawn()` **must not clear it** — so it survives deaths within a run
  ("lasts indefinitely once picked up").
- It resets naturally: entering PLAY builds a fresh player (`wearing = false`),
  and the run ends on **win**. Nothing extra to reset. The HUD indicator follows
  the same lifecycle (fresh player/session ⇒ hidden until the next pickup).

## Editor

The Scuba Kit is an ordinary placeable, non-solid marker in EDIT (like a coin):
click to place, right-click/long-press to remove. It renders (flippers, bobbing)
in both modes so it's visible while building.

## Non-goals (v1)

- Scuba does not change dry-land or shallow-wade movement beyond what water
  already does — it only affects while the player is in water.
- No air/oxygen timer; the kit never runs out mid-level (only "used up" by
  winning).
- No separate "take off" interaction; you keep it until the run ends.
- Not stackable / no levels of scuba; wearing is a simple on/off.
- One gear type (`'scuba'`); the `wear` flag is general but only flippers exist.

## Testing (Node + real Rapier, run from repo root)

- **Block registry:** `scuba` has id 16, `wear: 'scuba'`, is non-solid; appears
  in the palette list; `collect`/`wins` blocks unaffected.
- **Sensor wiring:** `voxelBody.rebuild` registers a sensor for a `wear` block
  (sensor count includes it), same as a coin.
- **Rules pickup:** simulate a player-collider ↔ scuba-sensor `started` event ⇒
  `onWear('scuba')` fires, the sensor is removed, `removeItem` called; coins and
  goal branches still behave.
- **Effect (real player, real Rapier):** in a deep-water column, a player with
  `setWearing('scuba')` reaches a **higher horizontal speed** and, when idle,
  **does not sink** (stays vs. drops), and swims up **faster** than an
  un-equipped player. On dry land, equipped vs. un-equipped movement is
  identical (regression).
- **Persistence:** `setWearing('scuba')` then `respawn()` ⇒ still wearing.
- **Rendering:** `spinners.rebuild` creates a flippers item for a scuba block and
  a coin item for a coin; `removeItem` removes the right one; a worn flippers
  child exists on the player mesh and toggles visible with `setWearing`.

## Rough build order (refined in the plan)

1. Block registry entry + config scuba values (+ palette).
2. Sensor wiring in `voxelBody.js` (+ test).
3. `spinners.js`: flippers mesh + `removeItem` rename (+ test).
4. `rules.js` + `main.js` `onWear` hook wiring.
5. `player.js`: `wearing` flag, underwater effect, worn flippers child,
   persistence (+ real-player tests).
6. HUD indicator + a demo (fold a scuba kit into a water example so it's
   discoverable); update README/blocks table.
