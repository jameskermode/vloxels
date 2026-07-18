# Linear Motors (sliding platforms & elevators) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add linear motors — a Slow/Fast Slider motor plus a fixed Shaft rail — so a carriage (motor + Board/Blade arms) slides back and forth along the shaft (vertical shaft = elevator, horizontal = sliding platform).

**Architecture:** Purely additive extension of the existing motor system. A motor is now `rotary` or `linear`. `computeAssemblies` tags each assembly with `kind` and, for linear motors, derives an `axis`+`distance` from the connected straight Shaft line (the carriage stays motor+arms; shaft cells stay static). `motorBodies` translates linear assemblies (`setNextKinematicTranslation`, ping-pong) instead of rotating them. Everything else (the carriage renderer, `main.js` wiring, `movingCells` exclusion) already works unchanged, because the shaft renders as a static cube and the carriage renderer already copies the body translation.

**Tech Stack:** Plain JS ES modules, Three.js, Rapier (`@dimforge/rapier3d-compat`), Vite. Tests are standalone `.mjs` run with `node`.

## Global Constraints

- Plain JavaScript ES modules only — no TypeScript, no framework. Readable for a 9-year-old.
- Tests are standalone `.mjs` run with `node <file>` (no framework); inline `ok(cond,msg)` assert. Test files in `test/` import `src/` via `../src/...`; `@dimforge/rapier3d-compat` and `three` run in Node and resolve from the repo-root `node_modules` (run tests from the repo root).
- ADDITIVE: no existing block, behaviour, or id changes. New block ids: `motorLinearSlow=13`, `motorLinearFast=14`, `shaft=15`. Rotary blocks (motorSlow=9, motorFast=10, blade=11, board=12) and everything else are untouched — so NO migration.
- Colours EXACTLY: motorLinearSlow `0x2f7fb0`, motorLinearFast `0x5f5fd0`, shaft `0x9aa0a6`.
- Config EXACTLY: `motor.linearSlowSpeed = 1.5`, `motor.linearFastSpeed = 4.0` (cells/sec); the existing `motor.slowSpeed/fastSpeed` (rotary, radians/sec) stay.
- `computeAssemblies` gives every assembly a `kind: 'rotary'|'linear'`; linear ones also get `axis: [dx,dy,dz]` (unit direction of the shaft from the motor) and `distance: N` (number of shaft cells in that straight line).
- Shaft is NON-SOLID (no `solid` flag) — it renders as a static cube but carries no collider, and shaft cells are NOT in `movingCells`.
- The player's carry/knockback code (`src/play/player.js`) must NOT change.

---

### Task 1: Block registry + config + palette labels

**Files:**
- Modify: `src/blocks.js`
- Modify: `src/config.js`
- Modify: `src/edit/palette.js`
- Test: `test/linear-blocks.test.mjs`

**Interfaces:**
- Produces: `BLOCKS.motorLinearSlow/motorLinearFast` (ids 13/14, `motor:'slow'|'fast'`, `linear:true`, `solid:true`) and `BLOCKS.shaft` (id 15, `shaft:true`, non-solid); `CONFIG.motor.linearSlowSpeed=1.5`, `linearFastSpeed=4.0`.

- [ ] **Step 1: Write the failing test**

Create `test/linear-blocks.test.mjs`:

```js
import { BLOCKS, blockById } from '../src/blocks.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

ok(BLOCKS.motorLinearSlow.id === 13 && BLOCKS.motorLinearSlow.motor === 'slow' && BLOCKS.motorLinearSlow.linear === true, 'slow slider def');
ok(BLOCKS.motorLinearFast.id === 14 && BLOCKS.motorLinearFast.motor === 'fast' && BLOCKS.motorLinearFast.linear === true, 'fast slider def');
ok(BLOCKS.motorLinearSlow.solid && BLOCKS.motorLinearFast.solid, 'linear motors are solid');
ok(BLOCKS.shaft.id === 15 && BLOCKS.shaft.shaft === true && !BLOCKS.shaft.solid, 'shaft def is non-solid');
ok(blockById(13).key === 'motorLinearSlow' && blockById(15).key === 'shaft', 'blockById maps new ids');
// rotary motors are NOT flagged linear (that flag is what distinguishes them)
ok(!BLOCKS.motorSlow.linear && !BLOCKS.motorFast.linear, 'rotary motors have no linear flag');
ok(CONFIG.motor.linearSlowSpeed === 1.5 && CONFIG.motor.linearFastSpeed === 4.0, 'linear speeds');
ok(CONFIG.motor.slowSpeed === 0.6 && CONFIG.motor.fastSpeed === 4.0, 'rotary speeds untouched');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/linear-blocks.test.mjs`
Expected: FAIL — `Cannot read properties of undefined (reading 'id')`.

- [ ] **Step 3: Add the blocks**

In `src/blocks.js`, inside `BLOCKS`, add these three entries immediately after the existing `board:` entry:

```js
  motorLinearSlow: { id: 13, color: 0x2f7fb0, solid: true, motor: 'slow', linear: true },
  motorLinearFast: { id: 14, color: 0x5f5fd0, solid: true, motor: 'fast', linear: true },
  shaft: { id: 15, color: 0x9aa0a6, shaft: true },
```

- [ ] **Step 4: Add the linear speeds**

In `src/config.js`, change the `motor:` line to include the linear speeds:

```js
  motor: { slowSpeed: 0.6, fastSpeed: 4.0, linearSlowSpeed: 1.5, linearFastSpeed: 4.0 },
```

- [ ] **Step 5: Add palette labels**

In `src/edit/palette.js`, add to the `LABELS` object (so the buttons aren't raw keys):

```js
  motorLinearSlow: 'Slow Slider',
  motorLinearFast: 'Fast Slider',
  shaft: 'Shaft',
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node test/linear-blocks.test.mjs`
Expected: PASS — `8 passed, 0 failed`.

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: succeeds, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/blocks.js src/config.js src/edit/palette.js test/linear-blocks.test.mjs
git commit -m "Linear motors: add linear motor + shaft blocks, speeds, palette labels"
```

---

### Task 2: Extend `computeAssemblies` with kind + linear axis/distance

**Files:**
- Modify: `src/assemblies.js`
- Test: `test/linear-assemblies.test.mjs`

**Interfaces:**
- Consumes: `blockById`; a `Level`.
- Produces: `computeAssemblies(level)` now tags each assembly with `kind: 'rotary'|'linear'`; linear assemblies also carry `axis: [dx,dy,dz]` and `distance: N`. `movingCells` still contains only motor + carriage-arm cells (never shaft cells). Rotary output is otherwise unchanged.

- [ ] **Step 1: Write the failing test**

Create `test/linear-assemblies.test.mjs`:

```js
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
const has = (set, x, y, z) => set.has(`${x},${y},${z}`);

// A vertical lift: motor + a +y shaft of 4 + a ring of board arms (the car floor).
{
  const L = new Level(32, 8, 32);
  L.set(16, 1, 16, B.motorLinearSlow.id);
  for (let y = 2; y <= 5; y++) L.set(16, y, 16, B.shaft.id); // shaft +y, length 4
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(16 + dx, 1, 16 + dz, B.board.id);
  const { assemblies, movingCells } = computeAssemblies(L);
  ok(assemblies.length === 1, `one assembly (${assemblies.length})`);
  const a = assemblies[0];
  ok(a.kind === 'linear', `kind linear (${a.kind})`);
  ok(a.axis.join(',') === '0,1,0', `axis +y (${a.axis})`);
  ok(a.distance === 4, `distance = shaft length 4 (${a.distance})`);
  ok(a.cells.length === 5, `carriage = motor + 4 boards, shaft NOT included (${a.cells.length})`);
  ok(movingCells.size === 5 && !has(movingCells, 16, 3, 16), 'shaft cells stay static (not moving)');
}

// A horizontal slider: shaft +x.
{
  const L = new Level(32, 8, 32);
  L.set(5, 1, 5, B.motorLinearFast.id);
  for (let x = 6; x <= 8; x++) L.set(x, 1, 5, B.shaft.id); // +x, length 3
  const { assemblies } = computeAssemblies(L);
  ok(assemblies[0].kind === 'linear' && assemblies[0].axis.join(',') === '1,0,0' && assemblies[0].distance === 3, 'slider: +x, distance 3');
  ok(assemblies[0].cells.length === 1, 'no arms -> carriage is just the motor');
}

// A rotary motor is still tagged rotary and has no axis/distance.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, B.motorFast.id);
  L.set(11, 1, 10, B.blade.id);
  const { assemblies } = computeAssemblies(L);
  ok(assemblies[0].kind === 'rotary', 'rotary kind preserved');
  ok(assemblies[0].axis === undefined && assemblies[0].cells.length === 2, 'rotary unchanged (no axis; motor+blade)');
}

// A linear motor with no shaft -> distance 0 (sits still, harmless).
{
  const L = new Level(32, 8, 32);
  L.set(20, 1, 20, B.motorLinearSlow.id);
  const { assemblies } = computeAssemblies(L);
  ok(assemblies[0].kind === 'linear' && assemblies[0].distance === 0, 'no shaft -> distance 0');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/linear-assemblies.test.mjs`
Expected: FAIL — `a.kind` is `undefined` (assemblies don't carry `kind` yet).

- [ ] **Step 3: Read `src/assemblies.js`, then extend it**

Read the current file. It collects motors, flood-fills each through `arm` cells into `cells`, and pushes `{ motorCell, speed, cells }`. Make these three changes:

(a) When collecting motors, also capture the `linear` flag. Change the `forEachBlock` that builds `motors` so each entry is `[x, y, z, d.motor, !!d.linear]`:

```js
  const motors = [];
  level.forEachBlock((x, y, z, id) => {
    const d = blockById(id);
    if (d && d.motor) motors.push([x, y, z, d.motor, !!d.linear]);
  });
```

(b) Add a shaft helper near the top (beside `key`/`NEIGHBORS`):

```js
const isShaft = (level, x, y, z) => {
  const d = blockById(level.get(x, y, z));
  return !!(d && d.shaft);
};

// From the motor cell, find the first neighbour that is a shaft and follow it
// in a straight line. Returns the unit direction + how many shaft cells long.
function detectShaft(level, mx, my, mz) {
  for (const [dx, dy, dz] of NEIGHBORS) {
    if (isShaft(level, mx + dx, my + dy, mz + dz)) {
      let n = 0;
      let x = mx + dx, y = my + dy, z = mz + dz;
      while (isShaft(level, x, y, z)) {
        n++;
        x += dx; y += dy; z += dz;
      }
      return { axis: [dx, dy, dz], distance: n };
    }
  }
  return { axis: [0, 0, 0], distance: 0 };
}
```

(c) In the motor loop, after `cells` is built, branch by the linear flag when pushing the assembly:

```js
    if (isLinear) {
      const { axis, distance } = detectShaft(level, mx, my, mz);
      assemblies.push({ kind: 'linear', motorCell: [mx, my, mz], speed, cells, axis, distance });
    } else {
      assemblies.push({ kind: 'rotary', motorCell: [mx, my, mz], speed, cells });
    }
```

(destructure the motor tuple as `const [mx, my, mz, speed, isLinear] of motors`). The carriage flood-fill is unchanged (shaft blocks aren't `arm`s, so they're never gathered into `cells` or `movingCells`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/linear-assemblies.test.mjs`
Expected: PASS — `12 passed, 0 failed`.

- [ ] **Step 5: Verify rotary regression**

Run: `node test/assemblies.test.mjs`
Expected: PASS (adding `kind` doesn't break the existing rotary assertions).

- [ ] **Step 6: Commit**

```bash
git add src/assemblies.js test/linear-assemblies.test.mjs
git commit -m "Linear motors: computeAssemblies tags kind + derives shaft axis/distance"
```

---

### Task 3: Extend `motorBodies` with linear translation

**Files:**
- Modify: `src/physics/motorBodies.js`
- Test: `test/linear-motorbodies.test.mjs`

**Interfaces:**
- Consumes: `RAPIER`, `CONFIG` (`motor.linearSlowSpeed/linearFastSpeed`), assemblies (with `kind`).
- Produces: `motorBodies.update(dt)` rotates rotary bodies (unchanged) and translates linear bodies via `setNextKinematicTranslation`, ping-ponging the carriage between its built position (`offset 0`) and the far end of the shaft (`offset = distance`).

- [ ] **Step 1: Write the failing test**

Create `test/linear-motorbodies.test.mjs`:

```js
import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createMotorBodies } from '../src/physics/motorBodies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// A slow LIFT raises a box resting on its car floor.
{
  const L = new Level(32, 8, 32);
  L.set(16, 1, 16, B.motorLinearSlow.id);
  for (let y = 2; y <= 5; y++) L.set(16, y, 16, B.shaft.id); // shaft +y, length 4
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(16 + dx, 1, 16 + dz, B.board.id);
  const { assemblies } = computeAssemblies(L);
  const phys = createPhysicsWorld();
  const motors = createMotorBodies(phys.world);
  motors.build(assemblies);
  ok(motors.entries[0].kind === 'linear', 'linear entry built');

  // box resting on the car floor (board top ~ y2)
  const box = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(17.5, 2.4, 16.5));
  phys.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setFriction(1.0), box);

  let maxY = -9, minCarY = 99;
  for (let i = 0; i < 300; i++) {
    phys.step(1 / 60, (dt) => motors.update(dt));
    maxY = Math.max(maxY, box.translation().y);
    minCarY = Math.min(minCarY, motors.entries[0].body.translation().y);
  }
  ok(maxY > 4.5, `lift raises the box near the top (max y ${maxY.toFixed(2)})`);
  ok(minCarY < 1.6, `car returns toward the bottom (ping-pong; min car y ${minCarY.toFixed(2)})`);
}

// A horizontal SLIDER translates its body back and forth along +x.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, B.motorLinearFast.id);
  for (let x = 11; x <= 15; x++) L.set(x, 1, 10, B.shaft.id); // +x, length 5
  const { assemblies } = computeAssemblies(L);
  const phys = createPhysicsWorld();
  const motors = createMotorBodies(phys.world);
  motors.build(assemblies);
  let maxX = -9;
  for (let i = 0; i < 200; i++) {
    phys.step(1 / 60, (dt) => motors.update(dt));
    maxX = Math.max(maxX, motors.entries[0].body.translation().x);
  }
  ok(maxX > 15, `slider reaches the far end of the shaft (max x ${maxX.toFixed(2)}, start 10.5 + 5)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/linear-motorbodies.test.mjs`
Expected: FAIL — linear bodies never translate (`motors.entries[0].kind` is `undefined`; the slider's `maxX` stays ~10.5).

- [ ] **Step 3: Read `src/physics/motorBodies.js`, then extend it**

Read the current file (it builds a kinematic body per assembly with a collider per cell and rotates them). Make these changes:

(a) Add a ping-pong helper near `quatY`:

```js
// Triangle wave: offset goes 0 -> distance -> 0 -> ... as `phase` grows.
function pingpong(phase, distance) {
  if (distance <= 0) return 0;
  const period = 2 * distance;
  const t = ((phase % period) + period) % period;
  return t <= distance ? t : period - t;
}
```

(b) In `build`, after the body + colliders are created, push a kind-specific entry (the body/collider creation is identical for both kinds — keep it):

```js
      if (asm.kind === 'linear') {
        const speed = asm.speed === 'fast' ? CONFIG.motor.linearFastSpeed : CONFIG.motor.linearSlowSpeed;
        entries.push({
          body,
          kind: 'linear',
          center: { x: cx + 0.5, y: cy + 0.5, z: cz + 0.5 },
          axis: asm.axis,
          distance: asm.distance,
          speed,
          phase: 0,
        });
      } else {
        const speed = asm.speed === 'fast' ? CONFIG.motor.fastSpeed : CONFIG.motor.slowSpeed;
        entries.push({ body, kind: 'rotary', angle: 0, speed });
      }
```

(Replace the existing single `entries.push({ body, angle: 0, speed })` with this branch. `cx/cy/cz` are the destructured `asm.motorCell` already in scope.)

(c) In `update(dt)`, branch by kind:

```js
  function update(dt) {
    for (const e of entries) {
      if (e.kind === 'linear') {
        e.phase += e.speed * dt;
        const o = pingpong(e.phase, e.distance);
        e.body.setNextKinematicTranslation({
          x: e.center.x + e.axis[0] * o,
          y: e.center.y + e.axis[1] * o,
          z: e.center.z + e.axis[2] * o,
        });
      } else {
        e.angle += e.speed * dt;
        e.body.setNextKinematicRotation(quatY(e.angle));
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/linear-motorbodies.test.mjs`
Expected: PASS — `4 passed, 0 failed`.

- [ ] **Step 5: Verify rotary regression**

Run: `node test/motorbodies.test.mjs`
Expected: PASS (rotary bodies still spin and carry).

- [ ] **Step 6: Commit**

```bash
git add src/physics/motorBodies.js test/linear-motorbodies.test.mjs
git commit -m "Linear motors: motorBodies translates linear assemblies (ping-pong)"
```

---

### Task 4: Integration — verify it flows through the game unchanged

**Files:**
- Test: `test/linear-integration.test.mjs`
- (Possibly) Modify: `src/main.js` — only if the verification below reveals a gap. The design predicts NO change: the shaft renders as a static cube via `voxels.js`, the carriage renderer already syncs the body translation, and `movingCells` already excludes the carriage. Confirm this.

- [ ] **Step 1: Write the integration test**

Create `test/linear-integration.test.mjs`:

```js
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';
import { createPhysicsWorld } from '../src/physics/world.js';
import { createVoxelBody } from '../src/physics/voxelBody.js';
import { createMotorBodies } from '../src/physics/motorBodies.js';
import { createAssemblyRenderer } from '../src/render/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// Terrain + a horizontal slider (motor + a +x shaft + a board on top).
const L = new Level(32, 8, 32);
for (let x = 8; x <= 20; x++) L.set(x, 0, 12, B.solid.id); // terrain
L.set(10, 1, 12, B.motorLinearFast.id);
for (let x = 11; x <= 15; x++) L.set(x, 1, 12, B.shaft.id); // shaft +x, length 5
L.set(10, 2, 12, B.board.id); // a bit of car floor on top

const { assemblies, movingCells } = computeAssemblies(L);
ok(assemblies[0].kind === 'linear' && assemblies[0].distance === 5, 'linear assembly, distance 5');
// carriage (motor + board) is moving; shaft cells are NOT
ok(movingCells.has('10,1,12') && movingCells.has('10,2,12'), 'carriage cells move');
ok(!movingCells.has('12,1,12'), 'shaft cells stay static (rendered as terrain cubes)');

const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
terrain.rebuild(L, movingCells); // shaft is non-solid -> no collider either way; carriage excluded
const motors = createMotorBodies(phys.world);
motors.build(assemblies);
const scene = new THREE.Scene();
const r = createAssemblyRenderer(scene);
r.build(L, assemblies, motors.entries);
for (let i = 0; i < 60; i++) phys.step(1 / 60, (dt) => motors.update(dt));
r.update();
const g = scene.children.find((c) => c.isGroup && c.children.length);
ok(g && g.children[0].children.length === 2, 'carriage rendered (motor + board), synced from body');
ok(g.children[0].position.x > 10.5, `carriage mesh followed the sliding body (x ${g.children[0].position.x.toFixed(2)})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the integration test**

Run: `node test/linear-integration.test.mjs`
Expected: PASS — `5 passed, 0 failed`. (All pieces already compose; this proves the full render+physics path works for a linear motor.)

- [ ] **Step 3: Verify build + full suite**

Run: `npm run build`
Expected: succeeds, no errors.

Run the whole test suite:
`for t in test/*.test.mjs; do echo "== $t"; node "$t" | tail -1; done`
Expected: every file PASSes (linear + rotary + all prior features).

- [ ] **Step 4: Manual browser check**

`npm run dev`: in EDIT place a **Slow Slider**, draw a straight **Shaft** line up from it (for a lift) or sideways (for a slider), stick a couple of **Board** cubes on the motor. Press Play → the car slides along the shaft and back; stand on it to ride. In EDIT everything is static and clickable; the shaft is a visible grey rail.

- [ ] **Step 5: Commit**

If Step 2/3 passed with no `main.js` change, commit just the test:
```bash
git add test/linear-integration.test.mjs
git commit -m "Linear motors: integration test (slides through the full render+physics path)"
```
If a `main.js` gap was found and fixed, include it in the commit and describe it in the message.

---

### Task 5: Demo example + docs

**Files:**
- Modify: `scripts/gen-levels.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add a "Machines" example to the generator**

In `scripts/gen-levels.mjs`, add a new level block before the `manifest` array (uses the existing `level`/`box` helpers and the `spinner` helper added earlier):

```js
// 5) Machines — a rotary spinner, an elevator (vertical shaft) and a sliding
//    platform (horizontal shaft) to show off motors.
{
  const L = level('Machines');
  box(L, 16, 48, 0, 0, 16, 48, B.solid.id); // floor
  // ELEVATOR (slow lift): board car floor + a tall shaft; ride up to a coin.
  L.set(26, 1, 30, B.motorLinearSlow.id);
  for (let y = 2; y <= 8; y++) L.set(26, y, 30, B.shaft.id); // shaft +y, length 7
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(26 + dx, 1, 30 + dz, B.board.id);
  L.set(27, 9, 30, B.coin.id); // reward reachable when the car is near the top
  // SLIDING PLATFORM (fast slider): a +x shaft; carries you and a coin across.
  L.set(34, 1, 34, B.motorLinearFast.id);
  for (let x = 35; x <= 41; x++) L.set(x, 1, 34, B.shaft.id); // shaft +x, length 7
  for (const [dx, dz] of [[0, 1], [0, -1], [-1, 0]]) L.set(34 + dx, 1, 34 + dz, B.board.id);
  L.set(34, 2, 34, B.coin.id); // rides along on the platform
  // a rotary spinner for contrast
  spinner(L, 42, 1, 42, 'fast');
  L.set(20, 1, 30, B.start.id);
  L.set(45, 1, 42, B.goal.id);
  save(L, 'machines.json');
}
```

Add `{ name: 'Machines', file: 'machines.json' }` to the `manifest` array.

- [ ] **Step 2: Regenerate + verify**

Run: `node scripts/gen-levels.mjs`
Expected: writes all levels incl. `machines.json` + `index.json`, no errors.

Verify start/goal + that Machines has the linear + rotary assemblies (run from repo root):
```bash
node -e "(async()=>{const {Level}=await import('./src/level.js');const {BLOCKS}=await import('./src/blocks.js');const {computeAssemblies}=await import('./src/assemblies.js');const {readFileSync}=await import('node:fs');const L=Level.fromJSON(JSON.parse(readFileSync('./public/levels/machines.json')));const s=L.find(BLOCKS.start.id),g=L.find(BLOCKS.goal.id);const {assemblies}=computeAssemblies(L);const kinds=assemblies.map(a=>a.kind).sort().join(',');console.log('start',!!s&&L.isSolid(s[0],s[1]-1,s[2]),'goal',!!g&&L.isSolid(g[0],g[1]-1,g[2]),'assemblies',assemblies.length,'kinds',kinds);})()"
```
Expected: `start true goal true` and `assemblies 3 kinds linear,linear,rotary`.

- [ ] **Step 3: Update the README blocks table**

In `README.md`, add these rows to the blocks table (after the motor/arm rows):

```markdown
| **Slow / Fast Slider** | a linear motor: draw a straight **Shaft** line for the track (up = elevator, sideways = sliding platform) and attach Board/Blade cubes; the car slides along the shaft and back, carrying you |
| **Shaft** | the fixed rail a slider's car travels along; its length sets how far it goes |
```

- [ ] **Step 4: Build + commit**

Run: `npm run build`
Expected: succeeds.

```bash
git add scripts/gen-levels.mjs public/levels README.md
git commit -m "Linear motors: Machines demo example + docs"
```

---

## Self-Review

- **Spec coverage:** new blocks + config (Task 1), `computeAssemblies` kind/axis/distance + shaft detection (Task 2), `motorBodies` linear translation (Task 3), integration through the unchanged render/main path (Task 4), demo + docs (Task 5). Additive — no migration needed (matches spec). Non-goals (straight shafts, single axis, continuous ping-pong) respected.
- **Placeholders:** none — complete code in every step; ids/colours/speeds exact per Global Constraints.
- **Type consistency:** `computeAssemblies` returns `kind`/`axis`/`distance` used verbatim by `motorBodies.build` (Task 3) and the integration test (Task 4); `motorBodies.entries[i]` (`.kind`, `.body`) consumed by the assembly renderer + integration (Task 4); `CONFIG.motor.linear{Slow,Fast}Speed` (Task 1) read in Task 3; shaft `shaft:true`/non-solid (Task 1) drives the `isShaft` detection (Task 2) and static rendering (Task 4). No existing block/id/behaviour altered, so rotary tests stay green.
