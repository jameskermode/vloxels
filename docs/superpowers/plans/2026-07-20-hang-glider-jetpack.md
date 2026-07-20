# Hang-glider + Jetpack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wearable glider (hang-glider + twin jetpack) that lets you fly — hold Space for zippy thrust, release to glide down, steer freely; crash into a wall side-on and it drops to the floor to be re-grabbed.

**Architecture:** Reuse the `wear` pickup machinery (sensor → `onWear`). One mutually-exclusive gear slot on the player (`null|'scuba'|'fly'`, latest pickup wins). Flight replaces the normal gravity/jump branch while worn. A side-on crash (commanded horizontal motion got blocked) drops a runtime pickup on the floor below via new `terrain.addSensor` / `spinners.addItem` methods; re-pickup flows through the existing `wear` path.

**Tech Stack:** Vanilla ES modules, Three.js (Group cosmetics, ShapeGeometry sail), Rapier (`@dimforge/rapier3d-compat`) dynamic capsule. Node-runnable `.mjs` tests with an inline `ok()`, run from the repo root importing `../src/...`. Three + Rapier run in Node.

## Global Constraints

- Plain JS, readable for a 9-year-old; every new config value gets a comment.
- **Additive only** — no existing block id/flag/behaviour removed; no migration.
- New block: `glider`, **id 17**, flag `wear: 'fly'`, colour `0x4caf50` (green sail), **non-solid**.
- Gear is **mutually exclusive**: the player has ONE gear slot `gear ∈ {null,'scuba','fly'}`; picking up either pickup replaces the current (latest wins). Scuba water effects apply only when `gear==='scuba'`; flight only when `gear==='fly'`.
- Flight tuning (exact): `fly.rise` +6, `fly.sink` −1.5, `fly.speed` 7, `fly.control` 0.5, `fly.riseEase` 0.4, `fly.crashSpeed` 2.0.
- Jetpack cylinders are grey `0x9098a0`; sail green `0x4caf50`.
- **Crash = steering into a wall** (commanded horizontal ≥ `fly.crashSpeed` but actual move < ~1/3 of it). Landing on a horizontal surface never crashes.
- **No soft-locks:** the glider always drops onto a reachable floor (or the last-grounded cell over a pit); dying while flying drops it (doesn't delete it). Scuba still lasts until level end.
- Tests use real Rapier/Three in Node; each prints `N passed, M failed` and exits non-zero on failure; run from repo root.

---

### Task 1: Block registry + config + palette label

**Files:**
- Modify: `src/blocks.js` (add `glider`)
- Modify: `src/config.js` (add `player.fly`)
- Modify: `src/edit/palette.js` (label)
- Test: `test/glider-blocks.test.mjs`

**Interfaces:**
- Produces: `BLOCKS.glider = { id:17, color:0x4caf50, wear:'fly', key:'glider' }`; `blockById(17)===BLOCKS.glider`; `CONFIG.player.fly.{rise,sink,speed,control,riseEase,crashSpeed}`.

- [ ] **Step 1: Write the failing test** — `test/glider-blocks.test.mjs`

```js
import { BLOCKS, blockById, BLOCK_LIST } from '../src/blocks.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const g = BLOCKS.glider;
ok(g && g.id === 17, 'glider has id 17');
ok(g.wear === 'fly', "glider has wear:'fly'");
ok(!g.solid, 'glider is non-solid');
ok(g.color === 0x4caf50, 'glider sail colour is green');
ok(blockById(17) === g, 'blockById(17) resolves to glider');
ok(BLOCK_LIST.includes(g), 'glider is in the palette list');
ok(BLOCKS.scuba.id === 16 && BLOCKS.scuba.wear === 'scuba', 'scuba unchanged');
const f = CONFIG.player.fly;
ok(f.rise === 6 && f.sink === -1.5, 'fly rise/sink set');
ok(f.speed === 7 && f.control === 0.5, 'fly speed/control set');
ok(f.riseEase === 0.4 && f.crashSpeed === 2.0, 'fly riseEase/crashSpeed set');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node test/glider-blocks.test.mjs` — Expected: FAIL (`glider` undefined).

- [ ] **Step 3: Add the block** — in `src/blocks.js`, after the `scuba` line inside `BLOCKS`:

```js
  glider: { id: 17, color: 0x4caf50, wear: 'fly' }, // wearable: fly (hang-glider + jetpack); picked up like scuba
```

- [ ] **Step 4: Add config** — in `src/config.js`, inside `player: { ... }`, after the scuba block:

```js
    // Glider (hang-glider + jetpack): hold Space for zippy jetpack thrust
    // (rise), release to glide down gently; steer freely with the move keys.
    // Fly INTO a wall side-on and you drop it. Values in units/sec.
    fly: {
      rise: 6, // upward speed while Space (jetpack) is held — zippy
      sink: -1.5, // gentle glide-down speed when not thrusting — floaty
      speed: 7, // horizontal navigation speed
      control: 0.5, // horizontal steering responsiveness (0..1)
      riseEase: 0.4, // how fast vertical velocity eases toward its target
      crashSpeed: 2.0, // commanded ≥ this horizontal speed but blocked ⇒ wall crash
    },
```

- [ ] **Step 5: Palette label** — in `src/edit/palette.js`, add to `LABELS` (after `scuba`):

```js
  glider: 'Glider',
```

- [ ] **Step 6: Run test, verify pass** — Run: `node test/glider-blocks.test.mjs` — Expected: `10 passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add src/blocks.js src/config.js src/edit/palette.js test/glider-blocks.test.mjs
git commit -m "Glider: add glider block, flight config, palette label"
```

---

### Task 2: `spinners.js` — glider mesh, pickup rendering, `addItem`

**Files:**
- Modify: `src/render/spinners.js`
- Test: `test/glider-spinners.test.mjs`

**Interfaces:**
- Consumes: `BLOCKS.glider` (Task 1).
- Produces: exports `makeGliderMesh(scale=1) -> THREE.Group` (green delta sail + two grey cylinders), reused by the worn rig. `createSpinners` returns `{ rebuild, addItem, removeItem, update, clear }` — `addItem(cell, def)` adds a runtime pickup for any pickup block (coin/scuba/glider). A `wear:'fly'` block renders as a bobbing (non-spinning) glider icon.

- [ ] **Step 1: Write the failing test** — `test/glider-spinners.test.mjs`

```js
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createSpinners, makeGliderMesh } from '../src/render/spinners.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

// makeGliderMesh: a Group with a sail + two cylinders (>=3 children).
const g = makeGliderMesh(1);
ok(g.isGroup && g.children.length >= 3, 'makeGliderMesh has a sail + two jetpacks');

const scene = new THREE.Scene();
const sp = createSpinners(scene);
const L = new Level(8, 4, 8);
L.set(2, 1, 2, B.coin.id);
L.set(4, 1, 4, B.glider.id);
sp.rebuild(L);

ok(typeof sp.addItem === 'function', 'spinners exposes addItem');

// Animate; the glider pickup must bob but NOT spin. Find the pickup groups:
// coin group = 1 mesh child, glider group = 3+ mesh children.
sp.update(0.5);
const groups = [];
scene.traverse((o) => { if (o.isGroup && o.children.length >= 1 && o.children.every((c) => c.isMesh)) groups.push(o); });
const coinGroup = groups.find((gg) => gg.children.length === 1);
const gliderGroup = groups.find((gg) => gg.children.length >= 3);
ok(coinGroup && Math.abs(coinGroup.rotation.y) > 0.001, 'the coin spins');
ok(gliderGroup && gliderGroup.rotation.y === 0, 'the glider pickup does NOT spin');

// addItem places a runtime pickup that removeItem can remove.
sp.addItem([6, 1, 6], B.glider);
sp.removeItem([6, 1, 6]);
sp.removeItem([6, 1, 6]); // no-op, must not throw
sp.update(0.1);
ok(true, 'addItem + removeItem work and are safe to repeat');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails** — Run: `node test/glider-spinners.test.mjs` — Expected: FAIL (`makeGliderMesh` not exported).

- [ ] **Step 3: Add `makeGliderMesh`** — in `src/render/spinners.js`, after `makeFlippersMesh`:

```js
// A hang-glider + twin jetpack: a flat green triangular sail overhead and two
// grey cylinders (the jetpacks) on the back. Reused for the world pickup icon
// and, larger, for the rig drawn on a flying player.
export function makeGliderMesh(scale = 1) {
  const group = new THREE.Group();
  const tri = new THREE.Shape();
  tri.moveTo(0, 0.55);
  tri.lineTo(-0.6, -0.45);
  tri.lineTo(0.6, -0.45);
  tri.closePath();
  const sail = new THREE.Mesh(
    new THREE.ShapeGeometry(tri),
    new THREE.MeshLambertMaterial({ color: 0x4caf50, side: THREE.DoubleSide }),
  );
  sail.rotation.x = -Math.PI / 2 + 0.35; // lay it near-flat overhead, nose up
  sail.position.set(0, 0.95, 0);
  group.add(sail);
  const jetGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.45, 10);
  for (const side of [-1, 1]) {
    const jet = new THREE.Mesh(jetGeo, new THREE.MeshLambertMaterial({ color: 0x9098a0 }));
    jet.position.set(side * 0.22, -0.05, -0.32);
    group.add(jet);
  }
  group.scale.setScalar(scale);
  return group;
}
```

- [ ] **Step 4: Factor pickup-building + handle glider in rebuild/addItem** — replace the `rebuild` function with a shared builder + `rebuild` + `addItem`:

```js
  // Build the cosmetic for one pickup block, or null if it isn't a pickup.
  function buildPickup(def) {
    if (def.spinner === 'coin') return { mesh: makeCoinMesh(def.color), yOff: 0.5, style: 'coin' };
    if (def.wear === 'scuba') return { mesh: makeFlippersMesh(def.color), yOff: 0.2, style: 'flippers' };
    if (def.wear === 'fly') return { mesh: makeGliderMesh(0.6), yOff: 0.3, style: 'glider' };
    return null;
  }

  // Add one pickup cosmetic at a cell (no-op if the block isn't a pickup).
  function addItem(cell, def) {
    const p = buildPickup(def);
    if (!p) return;
    const [x, y, z] = cell;
    const baseY = y + p.yOff;
    p.mesh.position.set(x + 0.5, baseY, z + 0.5);
    group.add(p.mesh);
    items.set(key(x, y, z), { style: p.style, mesh: p.mesh, baseY, cell: [x, y, z] });
  }

  // (Re)build all cosmetic pickups from the level.
  function rebuild(level) {
    clear();
    level.forEachBlock((x, y, z, id) => {
      const def = blockById(id);
      if (def) addItem([x, y, z], def);
    });
  }
```

- [ ] **Step 5: Bob-only for glider too** — in `update`, the spin line already guards `style === 'coin'`, so glider/flippers only bob. No change needed beyond confirming. Update the return to expose `addItem`:

```js
  return { rebuild, addItem, removeItem, update, clear };
```

- [ ] **Step 6: Refresh the header comment** — change the top comment's "coins and bobbing flippers" to mention the glider too (one line, e.g. "coins, scuba flippers, and glider pickups").

- [ ] **Step 7: Run test, verify pass** — Run: `node test/glider-spinners.test.mjs` — Expected: `6 passed, 0 failed`. Also run `node test/scuba-spinners.test.mjs` — Expected: still passes (rebuild refactor is behaviour-preserving).

- [ ] **Step 8: Commit**

```bash
git add src/render/spinners.js test/glider-spinners.test.mjs
git commit -m "Glider: glider cosmetic mesh + runtime addItem; factor pickup builder"
```

---

### Task 3: Expose `terrain.addSensor` for runtime drops

**Files:**
- Modify: `src/physics/voxelBody.js` (lift `addSensor` to a method, expose it)
- Test: `test/glider-addsensor.test.mjs`

**Interfaces:**
- Produces: `createVoxelBody(world).addSensor(blockKey, x, y, z)` — adds a sensor (same shape as placed-block sensors) at runtime; the sensor appears in `terrain.sensors` mapped to `{ blockKey, cell, collider }`.

- [ ] **Step 1: Write the failing test** — `test/glider-addsensor.test.mjs`

```js
import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

const L = new Level(8, 4, 8);
L.set(2, 0, 2, B.solid.id);
const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
mute(() => terrain.rebuild(L));
const before = terrain.sensors.size;

terrain.addSensor('glider', 4, 1, 4); // runtime drop
const added = [...terrain.sensors.values()].find((s) => s.blockKey === 'glider');
ok(terrain.sensors.size === before + 1, 'addSensor adds one sensor');
ok(added && added.cell[0] === 4 && added.cell[1] === 1 && added.cell[2] === 4, 'runtime sensor cell is correct');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails** — Run: `node test/glider-addsensor.test.mjs` — Expected: FAIL (`addSensor` not a function).

- [ ] **Step 3: Lift `addSensor` to a method** — in `src/physics/voxelBody.js`, delete the local `const addSensor = ...` inside `rebuild` and add a top-level function inside `createVoxelBody` (it uses the outer `body`/`sensors`), e.g. just after `remove()`:

```js
  // Add a sensor cuboid for a pickup block (coins/goal from the level, or a
  // glider dropped at runtime). Fires COLLISION_EVENTS that rules.js drains.
  function addSensor(blockKey, x, y, z) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(SENSOR_HALF, SENSOR_HALF, SENSOR_HALF)
        .setTranslation(x + 0.5, y + 0.5, z + 0.5)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    sensors.set(collider.handle, { blockKey, cell: [x, y, z], collider });
  }
```

In `rebuild`, the loop that previously called the local `addSensor` now calls this method (delete the old inline `const addSensor` block; keep the `forEachBlock(... addSensor(def.key,...))` loop unchanged since the name still resolves).

- [ ] **Step 4: Expose it** — add `addSensor,` to the returned object of `createVoxelBody`.

- [ ] **Step 5: Run test, verify pass** — Run: `node test/glider-addsensor.test.mjs` — Expected: `2 passed, 0 failed`. Also `node test/scuba-sensor.test.mjs` — Expected: still passes.

- [ ] **Step 6: Commit**

```bash
git add src/physics/voxelBody.js test/glider-addsensor.test.mjs
git commit -m "Glider: expose terrain.addSensor for runtime dropped pickups"
```

---

### Task 4: Player gear model (mutex) + worn glider rig

**Files:**
- Modify: `src/play/player.js`
- Test: `test/glider-gear.test.mjs`

**Interfaces:**
- Consumes: `makeGliderMesh` from `render/spinners.js` (Task 2), `BLOCKS.glider.color` (Task 1).
- Produces: player state `gear ∈ {null,'scuba','fly'}`. `setWearing(kind)` sets `gear` and shows exactly that gear's mesh. `get gear()` added; `get wearing()` now returns `gear==='scuba'`. The scuba water effects key on `gear==='scuba'`. No flight yet.

- [ ] **Step 1: Write the failing test** — `test/glider-gear.test.mjs`

```js
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createPlayer } from '../src/play/player.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

const phys = createPhysicsWorld();
const player = createPlayer(phys.world, new THREE.Scene(), { x: 0, y: 2, z: 0 }, () => false);

ok(player.gear === null, 'starts with no gear');
player.setWearing('scuba');
ok(player.gear === 'scuba' && player.wearing === true, 'wearing scuba');
player.setWearing('fly'); // latest wins, mutex
ok(player.gear === 'fly' && player.wearing === false, 'switching to fly drops scuba (mutex)');
player.setWearing('scuba'); // switch back
ok(player.gear === 'scuba' && player.wearing === true, 'switching back to scuba drops fly');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails** — Run: `node test/glider-gear.test.mjs` — Expected: FAIL (`player.gear` undefined).

- [ ] **Step 3: Import the glider mesh** — in `src/play/player.js`, extend the spinners import:

```js
import { makeFlippersMesh, makeGliderMesh } from '../render/spinners.js';
```

- [ ] **Step 4: Add the glider rig + switch to a gear slot** — replace the scuba `wornFins`/`wearing` block (currently `const wornFins = ...; ... let wearing = false;`) with:

```js
  // Gear worn on the player. Mutually exclusive: one slot, latest pickup wins.
  const wornFins = makeFlippersMesh(BLOCKS.scuba.color);
  wornFins.position.set(0, -REACH + 0.05, 0); // scuba fins at the feet
  wornFins.rotation.x = 0.5;
  wornFins.visible = false;
  mesh.add(wornFins);

  const gliderRig = makeGliderMesh(1); // green sail overhead + grey jetpacks on the back
  gliderRig.visible = false;
  mesh.add(gliderRig);

  let gear = null; // null | 'scuba' | 'fly'
```

- [ ] **Step 5: `setWearing` sets the slot** — replace the existing `setWearing`:

```js
  // Put on gear (mutually exclusive). Scuba lasts until the level ends; the
  // glider until you crash or die (see respawn / flight, added later).
  function setWearing(kind) {
    gear = kind;
    wornFins.visible = kind === 'scuba';
    gliderRig.visible = kind === 'fly';
  }
```

- [ ] **Step 6: Effects key on the slot** — in `fixedUpdate`, change the three scuba selections from `wearing ? ...` to `gear === 'scuba' ? ...`:
  - `const speedMult = inWater ? (gear === 'scuba' ? P.scubaSpeedMult : P.waterSpeedMult) : 1;`
  - `const swimMax = gear === 'scuba' ? P.scubaSwimSpeed : P.swimSpeed;`
  - `ny = lerp(v.y, gear === 'scuba' ? P.scubaSink : P.waterSink, 0.15);`

- [ ] **Step 7: Getters** — in the return object, replace `get wearing()` and add `get gear()`:

```js
    setWearing,
    get gear() {
      return gear;
    },
    get wearing() {
      return gear === 'scuba';
    },
```

- [ ] **Step 8: Dispose the rig too** — in `dispose()`, after the `wornFins.traverse(...)` disposal, add the same for `gliderRig`:

```js
    gliderRig.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
```

- [ ] **Step 9: Run tests, verify pass** — Run: `node test/glider-gear.test.mjs` (Expected `4 passed`), then `node test/scuba-player.test.mjs` (Expected: still `5 passed` — scuba effects/persistence unchanged via `gear==='scuba'` and `get wearing()`).

- [ ] **Step 10: Commit**

```bash
git add src/play/player.js test/glider-gear.test.mjs
git commit -m "Glider: mutually-exclusive gear slot + worn glider rig (scuba unchanged)"
```

---

### Task 5: Flight physics + crash + drop-on-death

**Files:**
- Modify: `src/play/player.js`
- Test: `test/glider-flight.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.player.fly` (Task 1), the gear slot (Task 4).
- Produces: `createPlayer(world, scene, spawn, isWaterCell, onGliderDrop)` — new 5th param, a callback `onGliderDrop(pos)` fired when a crash or death drops the glider. While `gear==='fly'`, flight replaces the normal branch: Space (via `setSwimming`) thrusts up, release glides down, intent navigates. A side-on wall crash and death-while-flying both clear gear and fire `onGliderDrop`.

- [ ] **Step 1: Write the failing test** — `test/glider-flight.test.mjs`

```js
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createPlayer } from '../src/play/player.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

function world(build) {
  const L = new Level(40, 20, 12); build(L);
  const phys = createPhysicsWorld();
  const terrain = createVoxelBody(phys.world);
  mute(() => terrain.rebuild(L));
  return { phys };
}
function floor(L) { for (let x = 0; x < 40; x++) for (let z = 0; z < 12; z++) L.set(x, 0, z, B.solid.id); }

// Hold Space while flying → RISE; a non-wearer just falls.
{
  const { phys } = world(floor);
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false);
  fly.setWearing('fly');
  const { phys: p2 } = world(floor);
  const none = createPlayer(p2.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false);
  for (let i = 0; i < 60; i++) {
    for (const [pl, ph] of [[fly, phys], [none, p2]]) {
      pl.setIntent(0, 0); pl.setSwimming(true); pl.fixedUpdate(1 / 60); ph.world.step(ph.eventQueue);
    }
  }
  ok(fly.body.translation().y > 4.5, `holding Space with the glider rises (y ${fly.body.translation().y.toFixed(2)})`);
  ok(none.body.translation().y < 2, `a non-wearer falls (y ${none.body.translation().y.toFixed(2)})`);
}

// Release Space while flying → glide down GENTLY (far slower than free-fall).
{
  const { phys } = world(floor);
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 12, z: 6 }, () => false);
  fly.setWearing('fly');
  const { phys: p2 } = world(floor);
  const none = createPlayer(p2.world, new THREE.Scene(), { x: 5, y: 12, z: 6 }, () => false);
  for (let i = 0; i < 40; i++) {
    for (const [pl, ph] of [[fly, phys], [none, p2]]) {
      pl.setIntent(0, 0); pl.setSwimming(false); pl.fixedUpdate(1 / 60); ph.world.step(ph.eventQueue);
    }
  }
  const glideDrop = 12 - fly.body.translation().y, fallDrop = 12 - none.body.translation().y;
  ok(glideDrop < fallDrop - 1, `glide sinks gently vs free-fall (${glideDrop.toFixed(2)} vs ${fallDrop.toFixed(2)})`);
}

// Fly INTO a wall → crash (onGliderDrop fires, gear cleared); flying over open
// floor the same distance does NOT crash.
{
  let dropped = null;
  const { phys } = world((L) => { floor(L); for (let y = 1; y <= 4; y++) for (let z = 0; z < 12; z++) L.set(12, y, z, B.solid.id); });
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 6, y: 2, z: 6 }, () => false, (pos) => { dropped = pos; });
  fly.setWearing('fly');
  for (let i = 0; i < 90 && fly.gear === 'fly'; i++) { fly.setIntent(1, 0); fly.setSwimming(false); fly.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); }
  ok(dropped !== null && fly.gear === null, 'flying into a wall crashes (onGliderDrop fired, gear cleared)');

  let dropped2 = null;
  const { phys: p2 } = world(floor);
  const fly2 = createPlayer(p2.world, new THREE.Scene(), { x: 6, y: 2, z: 6 }, () => false, (pos) => { dropped2 = pos; });
  fly2.setWearing('fly');
  for (let i = 0; i < 90; i++) { fly2.setIntent(1, 0); fly2.setSwimming(false); fly2.fixedUpdate(1 / 60); p2.world.step(p2.eventQueue); }
  ok(dropped2 === null && fly2.gear === 'fly', 'flying over open floor does NOT crash');
}

// Death while flying drops the glider; scuba survives respawn.
{
  let dropped = null;
  const { phys } = world(floor);
  const fly = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false, (pos) => { dropped = pos; });
  fly.setWearing('fly');
  fly.fixedUpdate(1 / 60); phys.world.step(phys.eventQueue); // establish last-grounded / prev pos
  fly.respawn();
  ok(dropped !== null && fly.gear === null, 'death while flying drops the glider');

  const scuba = createPlayer(phys.world, new THREE.Scene(), { x: 5, y: 3, z: 6 }, () => false, () => {});
  scuba.setWearing('scuba');
  scuba.respawn();
  ok(scuba.gear === 'scuba', 'scuba survives respawn');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails** — Run: `node test/glider-flight.test.mjs` — Expected: FAIL (no flight; `createPlayer` ignores the 5th arg).

- [ ] **Step 3: Accept the drop callback** — change the signature:

```js
export function createPlayer(world, scene, spawn, isWaterCell = () => false, onGliderDrop = () => {}) {
```

- [ ] **Step 4: Add flight state** — near the other controller state (after `let gear = null;` or by the controller-state block), add:

```js
  let lastGroundedPos = { x: spawn.x, y: spawn.y, z: spawn.z }; // safe drop spot over a pit
  let prevFlyPos = null; // position at the previous fly step (crash detection)
  let prevCmdVelH = 0; // horizontal speed we drove last fly step (crash detection)
```

- [ ] **Step 5: Add `flyUpdate` + `crash`** — add these functions (e.g. before `fixedUpdate`):

```js
  // Drop the glider (crash or death): clear flight and tell main where it fell.
  function crash(pos) {
    gear = null;
    gliderRig.visible = false;
    prevFlyPos = null;
    onGliderDrop({ x: pos.x, y: pos.y, z: pos.z });
  }

  // Flight: hold Space (swimHeld) for zippy thrust up, release to glide down
  // gently; steer with intent. If we commanded a real sideways move but got
  // blocked by a block, we hit a wall side-on ⇒ crash. Called instead of the
  // normal branch while gear === 'fly'.
  function flyUpdate(dt, t) {
    if (prevFlyPos) {
      const movedH = Math.hypot(t.x - prevFlyPos.x, t.z - prevFlyPos.z);
      if (prevCmdVelH >= P.fly.crashSpeed && movedH < (prevCmdVelH * dt) / 3) {
        crash(t);
        return;
      }
    }
    const v = body.linvel();
    const nvx = lerp(v.x, intent.x * P.fly.speed, P.fly.control);
    const nvz = lerp(v.z, intent.z * P.fly.speed, P.fly.control);
    const ny = lerp(v.y, swimHeld ? P.fly.rise : P.fly.sink, P.fly.riseEase);
    body.setLinvel({ x: nvx, y: ny, z: nvz }, true);
    prevFlyPos = { x: t.x, y: t.y, z: t.z };
    prevCmdVelH = Math.hypot(nvx, nvz);
    if (body.translation().y < P.fallKillY) respawn(); // fell out ⇒ respawn (drops glider)
  }
```

- [ ] **Step 6: Branch into flight + track last-grounded** — the current `fixedUpdate` begins with exactly these two lines:

```js
    const ground = groundBody();
    const grounded = ground !== null;
```

  Replace **those two lines only** with:

```js
    const t0 = body.translation();
    const ground = groundBody();
    if (ground) lastGroundedPos = { x: t0.x, y: t0.y, z: t0.z };
    if (gear === 'fly') { flyUpdate(dt, t0); return; }
    const grounded = ground !== null;
```

  Everything after those lines stays byte-for-byte the same (including the later `const t = body.translation();`). `ground`/`grounded` are still defined for the normal path, and `groundBody()` is still called exactly once.

- [ ] **Step 7: Drop on death while flying** — change `respawn()` to drop first when flying:

```js
  function respawn() {
    if (gear === 'fly') {
      gear = null;
      gliderRig.visible = false;
      prevFlyPos = null;
      onGliderDrop({ ...lastGroundedPos }); // drop at the last real floor, never lost
    }
    body.setTranslation(spawnPos, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    jumpBuffer = 0;
    coyote = 0;
  }
```

- [ ] **Step 8: Run tests, verify pass** — Run: `node test/glider-flight.test.mjs` (Expected all pass), then `node test/scuba-player.test.mjs` and `node test/elevator-glue.test.mjs` (Expected: both still pass — the normal branch is unchanged when `gear !== 'fly'`).

- [ ] **Step 9: Commit**

```bash
git add src/play/player.js test/glider-flight.test.mjs
git commit -m "Glider: flight physics (thrust/glide/steer), wall-crash + death drop"
```

---

### Task 6: Wire it up — drop handler, HUD, gear-switch (`main.js` + `hud.js`)

**Files:**
- Modify: `src/ui/hud.js` (add `createGliderIndicator`)
- Modify: `src/main.js` (drop handler, indicator, onWear gear switch, createPlayer arg, exitPlay)
- Test: `test/glider-drop-integration.test.mjs`

**Interfaces:**
- Consumes: `terrain.addSensor` (Task 3), `spinners.addItem` (Task 2), `player` onGliderDrop (Task 5), `rules` wear branch (existing).
- Produces: end-to-end drop → floor pickup → re-pickup; a 🪂 chip while `gear==='fly'`; mutually-exclusive HUD chips.

- [ ] **Step 1: Write the failing integration test** — `test/glider-drop-integration.test.mjs` (proves the runtime drop lands on the floor and re-pickup re-grants flight, using the same pieces `main.js` wires — without a browser)

```js
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createSpinners } from '../src/render/spinners.js';
import { createRules } from '../src/play/rules.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();
const mute = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

const L = new Level(12, 8, 12);
for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) L.set(x, 0, z, B.solid.id); // floor top y1
const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
mute(() => terrain.rebuild(L));
const spinners = createSpinners(new THREE.Scene());
spinners.rebuild(L);

// The drop handler main.js will use: find the floor below and spawn a pickup.
function dropGlider(pos) {
  const cx = Math.floor(pos.x), cz = Math.floor(pos.z);
  let fy = Math.floor(pos.y);
  while (fy > 0 && !L.isSolid(cx, fy, cz)) fy--;
  const dy = L.isSolid(cx, fy, cz) ? fy + 1 : Math.floor(pos.y);
  terrain.addSensor('glider', cx, dy, cz);
  spinners.addItem([cx, dy, cz], B.glider);
  return [cx, dy, cz];
}
const cell = dropGlider({ x: 5.5, y: 4, z: 5.5 });
ok(cell[1] === 1, `dropped glider rests on the floor (cell y ${cell[1]})`); // floor top is y1

// Re-pickup: a ball (stand-in player) overlapping the dropped sensor fires onWear('fly').
let worn = null;
const ball = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cell[0] + 0.5, 3, cell[2] + 0.5));
const ballCol = phys.world.createCollider(RAPIER.ColliderDesc.ball(0.3).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), ball);
const rules = createRules({
  eventQueue: phys.eventQueue,
  playerColliderHandle: ballCol.handle,
  terrain, spinners,
  hooks: { onRespawn: () => {}, onCoin: () => {}, onWin: () => {}, onWear: (k) => { worn = k; } },
});
for (let i = 0; i < 120 && worn === null; i++) { phys.world.step(phys.eventQueue); rules.drain(); }
ok(worn === 'fly', 'walking onto a dropped glider re-grants flight (onWear fly)');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails** — Run: `node test/glider-drop-integration.test.mjs` — Expected: FAIL initially only if pieces are missing; since Tasks 2–3 added `addItem`/`addSensor`, this test should actually PASS already (it exercises library code, not `main.js`). Run it — if it passes, that confirms the runtime-drop plumbing; proceed. (This test guards the plumbing `main.js` depends on.)

- [ ] **Step 3: Add the glider HUD indicator** — in `src/ui/hud.js`, mirror `createScubaIndicator`:

```js
// Small "you're flying" chip, shown while the glider is worn.
export function createGliderIndicator() {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', top: '8px', right: '8px', padding: '6px 12px',
    background: 'rgba(0,0,0,0.45)', borderRadius: '10px', color: '#b6f0a0',
    font: '700 18px system-ui, sans-serif', zIndex: '10', display: 'none',
  });
  el.textContent = '🪂 Flying';
  document.body.appendChild(el);
  return { el, show() { el.style.display = ''; }, hide() { el.style.display = 'none'; } };
}
```

- [ ] **Step 4: Wire `main.js`**

  a. Add `createGliderIndicator` to the hud import list.

  b. Where `scubaIndicator` is created (~line 148), add:

  ```js
  const gliderIndicator = createGliderIndicator();
  ```

  c. Add a top-level drop handler function in `main.js` (function declaration, so it hoists), near the other play helpers:

  ```js
  // A crashed/dropped glider falls to the nearest floor below and becomes a
  // pickup again (walk back and grab it). Over a pit it lands at the last-
  // grounded cell the player passed in, so it's never lost.
  function dropGlider(pos) {
    const cx = Math.floor(pos.x), cz = Math.floor(pos.z);
    let fy = Math.floor(pos.y);
    while (fy > 0 && !level.isSolid(cx, fy, cz)) fy--;
    const dy = level.isSolid(cx, fy, cz) ? fy + 1 : Math.max(0, Math.floor(pos.y));
    play.terrain.addSensor('glider', cx, dy, cz);
    spinners.addItem([cx, dy, cz], BLOCKS.glider);
    sfx.coin(); // a little "clunk" (reuse the pickup blip)
  }
  ```

  Ensure `BLOCKS` is imported in `main.js` (it may already be; if not, add `import { BLOCKS } from './blocks.js';`).

  d. Pass the drop handler to `createPlayer` (~line 281):

  ```js
  const player = createPlayer(
    physics.world, scene, spawnFor(level),
    (x, y, z) => wetSet.has(`${x},${y},${z}`),
    (pos) => dropGlider(pos),
  );
  ```

  e. Change the `onWear` hook to switch gear and swap the chips (mutex):

  ```js
        onWear: (kind) => {
          player.setWearing(kind);
          scubaIndicator[kind === 'scuba' ? 'show' : 'hide']();
          gliderIndicator[kind === 'fly' ? 'show' : 'hide']();
          sfx.coin();
        },
  ```

  f. In `exitPlay()`, next to `scubaIndicator.hide();`, add:

  ```js
  gliderIndicator.hide();
  ```

- [ ] **Step 5: Build check** — Run: `npm run build` — Expected: succeeds, no errors.

- [ ] **Step 6: Run the integration test + full suite** — Run: `node test/glider-drop-integration.test.mjs` (Expected pass), then `for t in test/*.test.mjs; do echo "== $t"; node "$t" | tail -1; done` (Expected: every file `0 failed`).

- [ ] **Step 7: Commit**

```bash
git add src/ui/hud.js src/main.js test/glider-drop-integration.test.mjs
git commit -m "Glider: drop handler + flight HUD chip + onWear gear switch"
```

---

### Task 7: Demo example + docs

**Files:**
- Modify: `scripts/gen-levels.mjs` (a small flying demo — a glider + walls/gaps)
- Modify: `public/levels/*.json` (regenerated)
- Modify: `README.md` (blocks table + examples list)
- Test: none (generator + docs); verified by regeneration + build

- [ ] **Step 1: Add a "Sky Course" example** — in `scripts/gen-levels.mjs`, add a new level block before the `manifest` array:

```js
// 6) Sky Course — grab the glider, then fly over gaps and between walls to the
//    goal. Crash into a wall and the glider drops for another try.
{
  const L = level('Sky Course');
  box(L, 2, 12, 0, 0, 28, 36, B.solid.id); // start platform
  L.set(6, 1, 32, B.glider.id); // grab the glider here
  L.set(4, 1, 32, B.start.id);
  // a couple of tall walls with gaps to fly between
  for (let y = 1; y <= 6; y++) for (let z = 28; z <= 36; z++) { if (z < 31 || z > 33) L.set(20, y, z, B.solid.id); }
  for (let y = 1; y <= 6; y++) for (let z = 28; z <= 36; z++) { if (z < 30 || z > 32) L.set(30, y, z, B.solid.id); }
  // landing pad + goal across a big gap
  box(L, 44, 52, 0, 0, 28, 36, B.solid.id);
  L.set(48, 1, 32, B.goal.id);
  L.set(48, 1, 30, B.coin.id);
  save(L, 'sky-course.json');
}
```

Add to the `manifest` array: `{ name: 'Sky Course', file: 'sky-course.json' },`.

- [ ] **Step 2: Regenerate** — Run: `node scripts/gen-levels.mjs` — Expected: writes all levels incl. `sky-course.json`, no errors.

- [ ] **Step 3: Verify the glider is present and reachable** — Run:

```bash
node -e "(async()=>{const {Level}=await import('./src/level.js');const {BLOCKS}=await import('./src/blocks.js');const {readFileSync}=await import('node:fs');const L=Level.fromJSON(JSON.parse(readFileSync('./public/levels/sky-course.json')));const g=L.find(BLOCKS.glider.id);const s=L.find(BLOCKS.start.id);const go=L.find(BLOCKS.goal.id);console.log('glider',g,'solid below',g&&L.isSolid(g[0],g[1]-1,g[2]),'start',!!s,'goal',!!go);})()"
```
Expected: prints the glider cell with `solid below true`, and start/goal present.

- [ ] **Step 4: README** — in `README.md`, add a blocks-table row after the Scuba Kit row:

```md
| **Glider** | a hang-glider + jetpack — walk over it to wear it, then fly: hold Space for zippy thrust up, release to glide down, steer with the keys (🪂 up top). Crash into a wall side-on and it drops to the floor to grab again |
```

And add **Sky Course** to the bundled-examples list (the "Coin Run, Spin Bridge, …" sentence).

- [ ] **Step 5: Build check** — Run: `npm run build` — Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-levels.mjs public/levels README.md
git commit -m "Glider: Sky Course demo; document in the blocks table"
```

---

## Notes for the executor

- Run every test from the **repo root**: `node test/<name>.test.mjs`.
- After Task 6, sweep the whole suite: `for t in test/*.test.mjs; do echo "== $t"; node "$t" | tail -1; done` — all `0 failed`.
- Cross-file touch points: `makeGliderMesh` (Task 2) is imported by `player.js` (Task 4); `terrain.addSensor` (Task 3) + `spinners.addItem` (Task 2) are used by `main.js` (Task 6). Keep the task order.
- `player.js` is edited by Task 4 (gear) then Task 5 (flight) — sequential, same file, no conflict.
