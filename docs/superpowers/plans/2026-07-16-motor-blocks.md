# Motor Blocks (composable spinners) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pre-baked Blades/Platform spinner blocks with a composable **motor + arm** system: a motor rotates, and connected Blade/Board cubes form one spinning kinematic assembly (knock-and-carry emerge from the shape).

**Architecture:** A pure `computeAssemblies(level)` flood-fills each motor's connected arm cubes into an assembly. In PLAY, each assembly becomes one kinematic body (`motorBodies`) plus a rotating mesh group (`assemblies` renderer); its cells are excluded from the static voxel cubes and terrain colliders. In EDIT, motors/arms are plain static clickable cubes. New pieces are added first (non-breaking); a single integration task swaps the game over and removes the old blocks.

**Tech Stack:** Plain JS ES modules, Three.js, Rapier (`@dimforge/rapier3d-compat`), Vite. Tests are standalone `.mjs` run with `node`.

## Global Constraints

- Plain JavaScript ES modules only — no TypeScript, no framework. Readable for a 9-year-old.
- Tests are standalone `.mjs` files run with `node <file>` (no framework); use a tiny inline `ok(cond, msg)` assert. Node 26 provides global `Request`/`Response`/`fetch`; `@dimforge/rapier3d-compat` and `three` run in Node (import from the repo root so `node_modules` resolves).
- Block ids are stable: solid=1, brick=2, water(hazard)=3, coin=4, start=7, goal=8. NEW: motorSlow=9, motorFast=10, blade=11, board=12. Ids 5 (Blades) and 6 (Platform) are RETIRED but reserved as legacy markers for migration only.
- Rotation is vertical-axis (y) only. Motors only rotate (never translate).
- Colours: motorSlow `0x2a9d8f`, motorFast `0x8e44ad`, blade `0xe74c3c`, board `0xc19a6b`.
- Motor speeds: `config.motor.slowSpeed = 0.6`, `config.motor.fastSpeed = 4.0` (radians/sec).
- The player's carry/knockback code (`play/player.js`) must NOT change — it already handles kinematic bodies.

---

### Task 1: Block registry + config (add new blocks; keep old ones for now)

**Files:**
- Modify: `src/blocks.js`
- Modify: `src/config.js`
- Test: `test/blocks.test.mjs`

**Interfaces:**
- Produces: `BLOCKS.motorSlow/motorFast/blade/board` (with ids 9/10/11/12 and flags `motor`/`arm`); `LEGACY_BLADES = 5`, `LEGACY_PLATFORM = 6` exports; `CONFIG.motor = { slowSpeed, fastSpeed }`.

- [ ] **Step 1: Write the failing test**

Create `test/blocks.test.mjs`:

```js
import { BLOCKS, blockById, LEGACY_BLADES, LEGACY_PLATFORM } from '../src/blocks.js';
import { CONFIG } from '../src/config.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

ok(BLOCKS.motorSlow.id === 9 && BLOCKS.motorSlow.motor === 'slow', 'motorSlow id/flag');
ok(BLOCKS.motorFast.id === 10 && BLOCKS.motorFast.motor === 'fast', 'motorFast id/flag');
ok(BLOCKS.blade.id === 11 && BLOCKS.blade.arm === true, 'blade id/flag');
ok(BLOCKS.board.id === 12 && BLOCKS.board.arm === true, 'board id/flag');
ok(BLOCKS.motorFast.solid && BLOCKS.blade.solid, 'motors/arms are solid');
ok(blockById(9).key === 'motorSlow' && blockById(11).key === 'blade', 'blockById maps new ids');
ok(LEGACY_BLADES === 5 && LEGACY_PLATFORM === 6, 'legacy id constants');
ok(CONFIG.motor.slowSpeed === 0.6 && CONFIG.motor.fastSpeed === 4.0, 'motor speeds');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/blocks.test.mjs`
Expected: FAIL — `Cannot read properties of undefined (reading 'id')` (motorSlow missing).

- [ ] **Step 3: Add the blocks + legacy constants**

In `src/blocks.js`, inside the `BLOCKS` object, add these four entries immediately after the `coin` entry (leave `spinner` and `platformSpin` in place for now — a later task removes them):

```js
  motorSlow: { id: 9, color: 0x2a9d8f, solid: true, motor: 'slow' },
  motorFast: { id: 10, color: 0x8e44ad, solid: true, motor: 'fast' },
  blade: { id: 11, color: 0xe74c3c, solid: true, arm: true },
  board: { id: 12, color: 0xc19a6b, solid: true, arm: true },
```

Then, after the `BLOCKS` object definition (near the other exports), add:

```js
// Retired block ids, kept only so migrateLegacyBlocks() can convert old levels.
export const LEGACY_BLADES = 5;
export const LEGACY_PLATFORM = 6;
```

- [ ] **Step 4: Add the motor config**

In `src/config.js`, inside `CONFIG`, add after the `spin: { ... }` block:

```js
  // Motor blocks: how fast the two motor types spin (radians/sec).
  motor: { slowSpeed: 0.6, fastSpeed: 4.0 },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/blocks.test.mjs`
Expected: PASS — `8 passed, 0 failed`.

- [ ] **Step 6: Verify the build still works (old blocks intact)**

Run: `npm run build`
Expected: succeeds, no errors (old `spinner`/`platformSpin` still present; new blocks added).

- [ ] **Step 7: Commit**

```bash
git add src/blocks.js src/config.js test/blocks.test.mjs
git commit -m "Motor blocks: add motor/arm block types + config (old blocks kept)"
```

---

### Task 2: `computeAssemblies` (pure)

**Files:**
- Create: `src/assemblies.js`
- Test: `test/assemblies.test.mjs`

**Interfaces:**
- Consumes: `blockById` from `blocks.js`; a `Level` (`get`, `forEachBlock`, `inBounds`).
- Produces: `computeAssemblies(level) -> { assemblies: [{ motorCell:[x,y,z], speed:'slow'|'fast', cells:[[x,y,z],...] }], movingCells: Set<"x,y,z"> }`.

- [ ] **Step 1: Write the failing test**

Create `test/assemblies.test.mjs`:

```js
import { Level } from '../src/level.js';
import { BLOCKS as B } from '../src/blocks.js';
import { computeAssemblies } from '../src/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
const has = (set, x, y, z) => set.has(`${x},${y},${z}`);

// Motor + a line of 2 blades + a board = one assembly of 4 cells.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, B.motorFast.id);
  L.set(11, 1, 10, B.blade.id);
  L.set(12, 1, 10, B.blade.id); // chained through the first blade
  L.set(10, 1, 11, B.board.id);
  const { assemblies, movingCells } = computeAssemblies(L);
  ok(assemblies.length === 1, `one assembly (${assemblies.length})`);
  ok(assemblies[0].speed === 'fast', 'speed from motor type');
  ok(assemblies[0].cells.length === 4, `4 cells (${assemblies[0].cells.length})`);
  ok(movingCells.size === 4 && has(movingCells, 12, 1, 10), 'movingCells includes chained arm');
}

// Terrain never attaches; a disconnected arm stays static.
{
  const L = new Level(32, 8, 32);
  L.set(5, 1, 5, B.motorSlow.id);
  L.set(6, 1, 5, B.solid.id); // terrain neighbour — not an arm
  L.set(20, 1, 20, B.blade.id); // far away, no motor
  const { assemblies, movingCells } = computeAssemblies(L);
  ok(assemblies[0].cells.length === 1, 'motor with no arms = 1 cell');
  ok(!has(movingCells, 6, 1, 5), 'terrain not attached');
  ok(!has(movingCells, 20, 1, 20), 'lone arm stays static');
  ok(movingCells.size === 1, 'only the motor moves');
}

// Two motors sharing an arm: first motor (lower grid index) claims it.
{
  const L = new Level(32, 8, 32);
  L.set(4, 0, 0, B.motorSlow.id); // lower index
  L.set(5, 0, 0, B.blade.id); // between them
  L.set(6, 0, 0, B.motorFast.id);
  const { assemblies } = computeAssemblies(L);
  const a4 = assemblies.find((a) => a.motorCell[0] === 4);
  const a6 = assemblies.find((a) => a.motorCell[0] === 6);
  ok(a4.cells.length === 2 && a6.cells.length === 1, `first motor claims shared arm (${a4.cells.length}/${a6.cells.length})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/assemblies.test.mjs`
Expected: FAIL — `Cannot find module '../src/assemblies.js'`.

- [ ] **Step 3: Write `computeAssemblies`**

Create `src/assemblies.js`:

```js
// assemblies.js — group each motor with its connected arm blocks into one
// spinning assembly. Pure data (no Three/Rapier). Recomputed on demand.

import { blockById } from './blocks.js';

const NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
const key = (x, y, z) => `${x},${y},${z}`;

export function computeAssemblies(level) {
  const isArm = (x, y, z) => {
    const d = blockById(level.get(x, y, z));
    return !!(d && d.arm);
  };

  // Motors in grid order (forEachBlock walks the flat array in index order),
  // so the "first motor wins" rule for shared arms is deterministic.
  const motors = [];
  level.forEachBlock((x, y, z, id) => {
    const d = blockById(id);
    if (d && d.motor) motors.push([x, y, z, d.motor]);
  });

  const claimed = new Set(); // arm cells already taken by a motor
  const movingCells = new Set();
  const assemblies = [];

  for (const [mx, my, mz, speed] of motors) {
    const cells = [[mx, my, mz]];
    movingCells.add(key(mx, my, mz));
    const queue = [[mx, my, mz]];
    while (queue.length) {
      const [x, y, z] = queue.shift();
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const k = key(nx, ny, nz);
        if (claimed.has(k)) continue;
        if (isArm(nx, ny, nz)) {
          claimed.add(k);
          movingCells.add(k);
          cells.push([nx, ny, nz]);
          queue.push([nx, ny, nz]);
        }
      }
    }
    assemblies.push({ motorCell: [mx, my, mz], speed, cells });
  }

  return { assemblies, movingCells };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/assemblies.test.mjs`
Expected: PASS — `10 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/assemblies.js test/assemblies.test.mjs
git commit -m "Motor blocks: computeAssemblies (flood-fill motor -> arms)"
```

---

### Task 3: `migrateLegacyBlocks`

**Files:**
- Create: `src/migrate.js`
- Test: `test/migrate.test.mjs`

**Interfaces:**
- Consumes: `BLOCKS`, `LEGACY_BLADES`, `LEGACY_PLATFORM` from `blocks.js`; a `Level`.
- Produces: `migrateLegacyBlocks(level) -> level` (mutates in place; converts legacy Blades/Platform ids to motors + best-effort arms).

- [ ] **Step 1: Write the failing test**

Create `test/migrate.test.mjs`:

```js
import { Level } from '../src/level.js';
import { BLOCKS as B, LEGACY_BLADES, LEGACY_PLATFORM } from '../src/blocks.js';
import { migrateLegacyBlocks } from '../src/migrate.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

// Legacy Blades -> fast motor + blade arms in empty horizontal neighbours.
{
  const L = new Level(32, 8, 32);
  L.set(10, 1, 10, LEGACY_BLADES);
  migrateLegacyBlocks(L);
  ok(L.get(10, 1, 10) === B.motorFast.id, 'blades -> fast motor');
  ok(L.get(11, 1, 10) === B.blade.id && L.get(9, 1, 10) === B.blade.id, 'blade arms placed');
  ok(L.get(10, 1, 11) === B.blade.id && L.get(10, 1, 9) === B.blade.id, 'blade arms on z too');
}

// Legacy Platform -> slow motor + board arms.
{
  const L = new Level(32, 8, 32);
  L.set(5, 2, 5, LEGACY_PLATFORM);
  migrateLegacyBlocks(L);
  ok(L.get(5, 2, 5) === B.motorSlow.id, 'platform -> slow motor');
  ok(L.get(6, 2, 5) === B.board.id, 'board arm placed');
}

// Occupied neighbours are NOT overwritten; edges don't go out of bounds.
{
  const L = new Level(32, 8, 32);
  L.set(0, 0, 0, LEGACY_BLADES); // corner
  L.set(1, 0, 0, B.solid.id); // occupied neighbour
  migrateLegacyBlocks(L);
  ok(L.get(0, 0, 0) === B.motorFast.id, 'corner motor placed');
  ok(L.get(1, 0, 0) === B.solid.id, 'occupied neighbour preserved');
  ok(L.get(0, 0, 1) === B.blade.id, 'free neighbour got an arm');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/migrate.test.mjs`
Expected: FAIL — `Cannot find module '../src/migrate.js'`.

- [ ] **Step 3: Write `migrateLegacyBlocks`**

Create `src/migrate.js`:

```js
// migrate.js — convert retired block ids in old saved/shared levels so they
// still open. Legacy Blades -> Fast Motor + blade arms; legacy Platform ->
// Slow Motor + board arms (arms only fill EMPTY, in-bounds horizontal
// neighbours; a bare motor just spins harmlessly if there's no room).

import { BLOCKS, LEGACY_BLADES, LEGACY_PLATFORM } from './blocks.js';

const HORIZ = [
  [1, 0], [-1, 0],
  [0, 1], [0, -1],
];

export function migrateLegacyBlocks(level) {
  // Collect first so we don't rescan cells we just wrote.
  const legacy = [];
  level.forEachBlock((x, y, z, id) => {
    if (id === LEGACY_BLADES || id === LEGACY_PLATFORM) legacy.push([x, y, z, id]);
  });

  for (const [x, y, z, id] of legacy) {
    const motor = id === LEGACY_BLADES ? BLOCKS.motorFast : BLOCKS.motorSlow;
    const arm = id === LEGACY_BLADES ? BLOCKS.blade : BLOCKS.board;
    level.set(x, y, z, motor.id);
    for (const [dx, dz] of HORIZ) {
      const nx = x + dx, nz = z + dz;
      if (level.inBounds(nx, y, nz) && level.get(nx, y, nz) === 0) {
        level.set(nx, y, nz, arm.id);
      }
    }
  }
  return level;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/migrate.test.mjs`
Expected: PASS — `8 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/migrate.js test/migrate.test.mjs
git commit -m "Motor blocks: migrateLegacyBlocks (old Blades/Platform -> motor+arms)"
```

---

### Task 4: `motorBodies` (kinematic physics)

**Files:**
- Create: `src/physics/motorBodies.js`
- Test: `test/motorbodies.test.mjs`

**Interfaces:**
- Consumes: `RAPIER`, `CONFIG` (`motor.slowSpeed/fastSpeed`, `spin.platformFriction`); an assembly list from `computeAssemblies`.
- Produces: `createMotorBodies(world) -> { build(assemblies), update(dt), clear(), entries }` where `entries[i] = { body, angle, speed }` parallel to `assemblies`.

- [ ] **Step 1: Write the failing test**

Create `test/motorbodies.test.mjs`:

```js
import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from './src/level.js';
import { BLOCKS as B } from './src/blocks.js';
import { computeAssemblies } from './src/assemblies.js';
import { createPhysicsWorld } from './src/physics/world.js';
import { createMotorBodies } from './src/physics/motorBodies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// A slow motor with a flat board disc carries a box resting on top.
{
  const L = new Level(32, 8, 32);
  // motor hub + a 3x3-ish board disc at y=1
  L.set(16, 1, 16, B.motorSlow.id);
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
    L.set(16 + dx, 1, 16 + dz, B.board.id);
  }
  const { assemblies } = computeAssemblies(L);
  const phys = createPhysicsWorld();
  const motors = createMotorBodies(phys.world);
  motors.build(assemblies);
  ok(motors.entries.length === 1 && motors.entries[0].speed === 0.6, 'one slow body built');

  // a box resting on the disc top (disc top ~ y=2)
  const box = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(17.5, 2.6, 16.5));
  phys.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setFriction(1.0), box);

  const before = { x: box.translation().x, z: box.translation().z };
  for (let i = 0; i < 120; i++) phys.step(1 / 60, (dt) => motors.update(dt));
  const after = box.translation();
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  ok(after.y > 2.0, `box stays on the disc (y=${after.y.toFixed(2)})`);
  ok(moved > 0.1, `spinning disc carries the box (moved ${moved.toFixed(2)})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

(Note: this test imports from `./src/...` — it must be RUN FROM THE REPO ROOT so `node_modules` resolves. Place the file at repo root as `test/motorbodies.test.mjs` but run it from root, OR keep it at root. To keep resolution simple, create it at repo ROOT named `motorbodies.test.mjs`? No — keep it in `test/` and run `node test/motorbodies.test.mjs` from the repo root; the `./src/...` relative imports resolve against the file, and `@dimforge/...`/`three` resolve against the nearest `node_modules` which is the repo root. This works because Node resolves package imports by walking up from the file's dir to the repo root.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/motorbodies.test.mjs`
Expected: FAIL — `Cannot find module './src/physics/motorBodies.js'`.

- [ ] **Step 3: Write `motorBodies`**

Create `src/physics/motorBodies.js`:

```js
// physics/motorBodies.js — one kinematic body per motor assembly. Each cell of
// the assembly (motor hub + arms) gets a cuboid collider at its offset from the
// motor centre; the body spins about y each fixed step. The player's existing
// carry/knockback handling does the rest.

import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';

function quatY(angle) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

export function createMotorBodies(world) {
  const entries = []; // { body, angle, speed }

  function build(assemblies) {
    clear();
    for (const asm of assemblies) {
      const [cx, cy, cz] = asm.motorCell;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cx + 0.5, cy + 0.5, cz + 0.5),
      );
      for (const [x, y, z] of asm.cells) {
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
            .setTranslation(x - cx, y - cy, z - cz) // local offset from the motor centre
            .setFriction(CONFIG.spin.platformFriction)
            .setRestitution(0.1),
          body,
        );
      }
      const speed = asm.speed === 'fast' ? CONFIG.motor.fastSpeed : CONFIG.motor.slowSpeed;
      entries.push({ body, angle: 0, speed });
    }
    return entries;
  }

  // Advance every motor's rotation. Call once per FIXED physics step.
  function update(dt) {
    for (const e of entries) {
      e.angle += e.speed * dt;
      e.body.setNextKinematicRotation(quatY(e.angle));
    }
  }

  function clear() {
    for (const e of entries) world.removeRigidBody(e.body);
    entries.length = 0;
  }

  return { build, update, clear, get entries() { return entries; } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/motorbodies.test.mjs`
Expected: PASS — `3 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/physics/motorBodies.js test/motorbodies.test.mjs
git commit -m "Motor blocks: kinematic motorBodies (assembly spins + carries)"
```

---

### Task 5: `movingCells` exclusion in `voxels` + `voxelBody`

**Files:**
- Modify: `src/render/voxels.js`
- Modify: `src/physics/voxelBody.js`
- Test: `test/voxelbody-exclude.test.mjs`

**Interfaces:**
- Produces: `voxels.rebuild(level, movingCells?)` and `voxelBody.rebuild(level, movingCells?)` both skip any cell whose `"x,y,z"` key is in the optional `movingCells` Set. With no arg, behaviour is unchanged.

- [ ] **Step 1: Write the failing test**

Create `test/voxelbody-exclude.test.mjs`:

```js
import RAPIER from '@dimforge/rapier3d-compat';
import { Level } from './src/level.js';
import { BLOCKS as B } from './src/blocks.js';
import { createPhysicsWorld } from './src/physics/world.js';
import { createVoxelBody } from './src/physics/voxelBody.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// A 3-in-a-row solid strip = 1 merged collider. Excluding the middle cell
// splits it into 2 (proving movingCells is honoured by the terrain builder).
const L = new Level(32, 8, 32);
L.set(10, 0, 5, B.solid.id);
L.set(11, 0, 5, B.solid.id);
L.set(12, 0, 5, B.solid.id);

const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
ok(terrain.rebuild(L) === 1, 'no exclusion -> 1 merged run');
ok(terrain.rebuild(L, new Set(['11,0,5'])) === 2, 'excluding the middle -> 2 runs');
ok(terrain.rebuild(L, new Set(['10,0,5', '11,0,5', '12,0,5'])) === 0, 'excluding all -> 0');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/voxelbody-exclude.test.mjs`
Expected: FAIL — `terrain.rebuild(L, Set)` ignores the second arg, so the second assertion fails (still returns 1).

- [ ] **Step 3: Add exclusion to `voxelBody.js`**

In `src/physics/voxelBody.js`, change the `rebuild` signature and the run-merge so a cell counts as solid only when it isn't excluded. Replace the `rebuild(level)` header and the inner `while (x < level.sizeX)` solid checks:

- Change `function rebuild(level) {` to `function rebuild(level, movingCells) {`.
- Add near the top of `rebuild` (after `remove();` / body creation, before the loops):

```js
    const solidAt = (x, y, z) =>
      level.isSolid(x, y, z) && !(movingCells && movingCells.has(`${x},${y},${z}`));
```

- In the greedy-merge loop, replace both uses of `level.isSolid(x, y, z)` with `solidAt(x, y, z)` (the `if (!level.isSolid(...)) { x++; continue; }` guard and the `while (x < level.sizeX && level.isSolid(...))` run extension).

(The coin/goal sensor pass is unchanged — those blocks are never in `movingCells`.)

- [ ] **Step 4: Add exclusion to `voxels.js`**

In `src/render/voxels.js`, change `function rebuild(level) {` to `function rebuild(level, movingCells) {`, and in BOTH the counting pass and the placement pass add a skip for excluded cells. In each `level.forEachBlock((x, y, z, id) => {` body, right after the `const def = blockById(id);` line, extend the existing early-return guard so it also skips excluded cells:

- Counting pass: change `if (!def || def.spinner || def.flow) return;` to
  `if (!def || def.spinner || def.flow || (movingCells && movingCells.has(\`${x},${y},${z}\`))) return;`
- Placement pass: make the same change to its guard.

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/voxelbody-exclude.test.mjs`
Expected: PASS — `3 passed, 0 failed`.

- [ ] **Step 6: Verify build + no rendering regression**

Run: `npm run build`
Expected: succeeds (both functions still work with no second arg — the game's existing `rebuild(level)` calls are unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/render/voxels.js src/physics/voxelBody.js test/voxelbody-exclude.test.mjs
git commit -m "Motor blocks: movingCells exclusion in voxels + terrain colliders"
```

---

### Task 6: Assembly renderer

**Files:**
- Create: `src/render/assemblies.js`
- Test: `test/assembly-render.test.mjs`

**Interfaces:**
- Consumes: `THREE`, `blockById`; a `Level`, an assembly list, and the parallel `motorBodies.entries` (each has `.body` with `translation()`/`rotation()`).
- Produces: `createAssemblyRenderer(scene) -> { build(level, assemblies, bodyEntries), update(), clear() }`. Each assembly renders as a `THREE.Group` of coloured unit cubes at local offsets, synced from its body.

- [ ] **Step 1: Write the failing test**

Create `test/assembly-render.test.mjs`:

```js
import * as THREE from 'three';
import { Level } from './src/level.js';
import { BLOCKS as B } from './src/blocks.js';
import { computeAssemblies } from './src/assemblies.js';
import { createAssemblyRenderer } from './src/render/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));

const L = new Level(32, 8, 32);
L.set(8, 1, 8, B.motorFast.id);
L.set(9, 1, 8, B.blade.id);
L.set(7, 1, 8, B.blade.id);
const { assemblies } = computeAssemblies(L);

// Fake body entries (parallel to assemblies) — moved + rotated.
const fakeBodies = assemblies.map(() => ({
  body: { translation: () => ({ x: 8.5, y: 1.5, z: 8.5 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) },
}));

const scene = new THREE.Scene();
const r = createAssemblyRenderer(scene);
r.build(L, assemblies, fakeBodies);
// one group per assembly, each with a mesh per cell
const group = scene.children.find((c) => c.isGroup);
ok(group && group.children.length === 1, `one assembly group (${group ? group.children.length : 'none'})`);
ok(group.children[0].children.length === 3, `3 cube meshes (motor + 2 blades) (${group.children[0].children.length})`);
r.update();
ok(Math.abs(group.children[0].position.x - 8.5) < 1e-6, 'group synced from its body translation');
r.clear();
ok(!scene.children.some((c) => c.isGroup && c.children.length), 'clear removes the assembly meshes');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/assembly-render.test.mjs`
Expected: FAIL — `Cannot find module './src/render/assemblies.js'`.

- [ ] **Step 3: Write the assembly renderer**

Create `src/render/assemblies.js`:

```js
// render/assemblies.js — draws each motor assembly (motor hub + arms) as a group
// of coloured cubes at their offsets from the motor centre, and syncs the whole
// group's position+rotation from its kinematic body every frame (PLAY only).

import * as THREE from 'three';
import { blockById } from '../blocks.js';

const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function createAssemblyRenderer(scene) {
  const group = new THREE.Group();
  scene.add(group);
  let items = []; // { mesh: THREE.Group, body }

  function clear() {
    for (const it of items) {
      group.remove(it.mesh);
      it.mesh.traverse((o) => {
        if (o.material) o.material.dispose();
      });
    }
    items = [];
  }

  // assemblies + bodyEntries are parallel arrays (bodyEntries[i].body).
  function build(level, assemblies, bodyEntries) {
    clear();
    assemblies.forEach((asm, i) => {
      const [cx, cy, cz] = asm.motorCell;
      const g = new THREE.Group();
      for (const [x, y, z] of asm.cells) {
        const def = blockById(level.get(x, y, z));
        const mesh = new THREE.Mesh(
          CUBE,
          new THREE.MeshLambertMaterial({ color: def ? def.color : 0xffffff }),
        );
        mesh.position.set(x - cx, y - cy, z - cz); // local offset from the motor centre
        g.add(mesh);
      }
      group.add(g);
      items.push({ mesh: g, body: bodyEntries[i].body });
    });
  }

  // Sync each assembly group from its body. Call once per frame in PLAY.
  function update() {
    for (const it of items) {
      const t = it.body.translation();
      const r = it.body.rotation();
      it.mesh.position.set(t.x, t.y, t.z);
      it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  return { build, update, clear };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/assembly-render.test.mjs`
Expected: PASS — `4 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/render/assemblies.js test/assembly-render.test.mjs
git commit -m "Motor blocks: assembly renderer (cube groups synced from bodies)"
```

---

### Task 7: Integration — swap the game to motors; remove old blocks

**Files:**
- Modify: `src/main.js`
- Modify: `src/render/spinners.js` (strip to coins only)
- Modify: `src/blocks.js` (remove `spinner`/`platformSpin` from the palette)
- Delete: `src/physics/spinnerBodies.js`
- Test: `test/integration-motors.test.mjs`

**Interfaces:**
- Consumes: `computeAssemblies`, `createMotorBodies`, `createAssemblyRenderer`, `migrateLegacyBlocks`, and the `movingCells` params added in Task 5.

- [ ] **Step 1: Write the failing integration test**

Create `test/integration-motors.test.mjs`:

```js
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Level } from './src/level.js';
import { BLOCKS as B } from './src/blocks.js';
import { computeAssemblies } from './src/assemblies.js';
import { createPhysicsWorld } from './src/physics/world.js';
import { createVoxelBody } from './src/physics/voxelBody.js';
import { createMotorBodies } from './src/physics/motorBodies.js';
import { createAssemblyRenderer } from './src/render/assemblies.js';

let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.error('FAIL:', m)));
await RAPIER.init();

// End-to-end: a level with a motor+arms and some terrain. Assembly cells are
// excluded from terrain colliders; the assembly is its own kinematic body.
const L = new Level(32, 8, 32);
for (let x = 10; x <= 14; x++) L.set(x, 0, 12, B.solid.id); // terrain strip
L.set(12, 1, 12, B.motorFast.id); // motor sits above terrain
L.set(13, 1, 12, B.blade.id);
L.set(11, 1, 12, B.blade.id);

const { assemblies, movingCells } = computeAssemblies(L);
ok(assemblies.length === 1 && movingCells.size === 3, 'one assembly, 3 moving cells');

const phys = createPhysicsWorld();
const terrain = createVoxelBody(phys.world);
const nSolid = terrain.rebuild(L, movingCells);
ok(nSolid >= 1, 'terrain colliders built, assembly excluded');
// the motor/arm cells must NOT be terrain colliders — cast a ray where the
// blade is: no static collider there (it's a kinematic body instead)
const motors = createMotorBodies(phys.world);
motors.build(assemblies);
ok(motors.entries.length === 1, 'motor body built');
const scene = new THREE.Scene();
const r = createAssemblyRenderer(scene);
r.build(L, assemblies, motors.entries);
for (let i = 0; i < 30; i++) phys.step(1 / 60, (dt) => motors.update(dt));
r.update();
ok(scene.children.some((c) => c.isGroup && c.children.length === 1), 'assembly rendered + synced');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/integration-motors.test.mjs`
Expected: PASS actually is possible here since all pieces exist — but run it to confirm the pieces compose. If it passes already, that's fine (this task's real work is the main.js swap). Proceed to wire the game.

- [ ] **Step 3: Strip `render/spinners.js` to coins only**

In `src/render/spinners.js`, remove the blades/platform handling so it renders ONLY coins:
- In `rebuild(level)`, keep only the `def.spinner === 'coin'` branch (a coin mesh). Remove the `makeBladesMesh`/`makePlatformMesh` functions and their branches.
- Remove `linkBodies`/`unlinkBodies` (no longer any body-driven spinner meshes here) from the returned object and their definitions.
- In `update(dt)`, keep only the coin spin+bob (remove the `it.body` sync branch and the else-cosmetic blades/platform branch).
- Keep `removeCoin(cell)` and `clear()`.

- [ ] **Step 4: Delete the old spinner bodies**

```bash
git rm src/physics/spinnerBodies.js
```

- [ ] **Step 5: Remove old blocks from the palette**

In `src/blocks.js`, delete the `spinner:` and `platformSpin:` entries from the `BLOCKS` object. (Leave the `LEGACY_BLADES`/`LEGACY_PLATFORM` constants — migration still needs the numbers 5/6.)

- [ ] **Step 6: Rewire `main.js`**

Make these edits in `src/main.js`:

(a) Imports — remove the spinnerBodies import and add the new ones:
```js
import { createMotorBodies } from './physics/motorBodies.js';
import { computeAssemblies } from './assemblies.js';
import { createAssemblyRenderer } from './render/assemblies.js';
import { migrateLegacyBlocks } from './migrate.js';
```
Delete: `import { createSpinnerBodies } from './physics/spinnerBodies.js';`

(b) Migrate on load. Change the level load line:
```js
const level = migrateLegacyBlocks(load() || buildStarterLevel());
```
And in `replaceLevel(obj)`, after `incoming = Level.fromJSON(obj);` succeeds, add `migrateLegacyBlocks(incoming);` before copying its fields into `level`.

(c) Create the assembly renderer once, next to `createSpinners`:
```js
const assemblies = createAssemblyRenderer(scene);
```

(d) In `enterPlay()`, replace the spinner-bodies setup with assembly setup. Where it currently does `const spinBodies = createSpinnerBodies(...)` / `spinBodies.build(level)` / `spinners.rebuild(level)` / `spinners.linkBodies(...)`, use:
```js
const { assemblies: asmList, movingCells } = computeAssemblies(level);
const motorBodies = createMotorBodies(physics.world);
motorBodies.build(asmList);
assemblies.build(level, asmList, motorBodies.entries);
voxels.rebuild(level, movingCells); // hide the cells that are now spinning
terrain.rebuild(level, movingCells); // ...and exclude them from static colliders
spinners.rebuild(level); // coins only now
```
Replace `terrain.rebuild(level)` in enterPlay with the `terrain.rebuild(level, movingCells)` above. Store `motorBodies` on the `play` session object (add `motorBodies` to the `play = { ... }` literal); remove `spinBodies` from it.

(e) In the PLAY branch of the frame loop, replace the spinBodies step + spinner sync:
- In the `physics.step(dt, (fixedDt) => { ... })` callback, replace `play.spinBodies.update(fixedDt)` with `play.motorBodies.update(fixedDt)`.
- After the step, replace any `spinners.update(dt)` that was syncing blades/platform with: keep `spinners.update(dt)` (coins) AND add `assemblies.update()`.

(f) In `exitPlay()`, replace `play.spinBodies.clear()` with `play.motorBodies.clear(); assemblies.clear();`, and after restoring the level rebuild voxels WITHOUT movingCells: `voxels.rebuild(level);` (it already calls `voxels.rebuild(level)` — ensure no `movingCells` is passed on exit). Also `spinners.unlinkBodies()` calls must be removed (that method no longer exists).

(g) Remove any remaining references to `spinBodies`, `linkBodies`, `unlinkBodies` in `main.js`.

- [ ] **Step 7: Run the integration test + build**

Run: `node test/integration-motors.test.mjs`
Expected: PASS — `5 passed, 0 failed`.

Run: `npm run build`
Expected: succeeds, no errors, no unresolved imports (spinnerBodies is gone).

Run every prior motor test to confirm nothing regressed:
`node test/blocks.test.mjs && node test/assemblies.test.mjs && node test/migrate.test.mjs && node test/motorbodies.test.mjs && node test/voxelbody-exclude.test.mjs && node test/assembly-render.test.mjs`
Expected: all PASS.

- [ ] **Step 8: Manual browser check**

`npm run dev`: in EDIT, place a Fast Motor and a few Blades next to it (they're plain cubes). Press Play → the motor + connected blades spin as one; stand on a flat Board assembly → carried; get hit by a blade → knocked. In EDIT they're static and clickable.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Motor blocks: swap game to motor assemblies; remove old spinner blocks"
```

---

### Task 8: Regenerate examples + docs

**Files:**
- Modify: `scripts/gen-levels.mjs`
- Modify: `README.md`
- Test: (regeneration validated by running the generator + a spot check)

- [ ] **Step 1: Update the generator to use motors + arms**

In `scripts/gen-levels.mjs`, add a helper near the top (after `box`):

```js
// Place a spinner as a motor hub + a cross of arms (a quick blades/platform).
const spinner = (L, x, y, z, kind) => {
  const motor = kind === 'fast' ? B.motorFast.id : B.motorSlow.id;
  const arm = kind === 'fast' ? B.blade.id : B.board.id;
  L.set(x, y, z, motor);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(x + dx, y, z + dz, arm);
};
```

Then replace the two spinner usages:
- In **Blade Gauntlet**, replace each `L.set(x, 1, z, B.spinner.id)` with `spinner(L, x, 1, z, 'fast')`.
- In **Spin Bridge** and **Waterfall**, replace each `L.set(x, 2, ..., B.platformSpin.id)` (the stepping platforms) with `spinner(L, x, 2, ..., 'slow')`. (Keep their positions; the arms extend one cell around each — verify they don't collide with adjacent platforms; if two motors are only 2 apart, widen the spacing so their arm crosses don't overlap.)

- [ ] **Step 2: Regenerate and spot-check**

Run: `node scripts/gen-levels.mjs`
Expected: writes the four levels + `index.json` with no errors.

Run this spot check (a motor assembly exists and spins in the regenerated Blade Gauntlet):
```bash
node -e "import('./src/level.js').then(async(m)=>{const {Level}=m;const {BLOCKS}=await import('./src/blocks.js');const {computeAssemblies}=await import('./src/assemblies.js');const {readFileSync}=await import('node:fs');const L=Level.fromJSON(JSON.parse(readFileSync('./public/levels/blade-gauntlet.json')));const {assemblies}=computeAssemblies(L);console.log('assemblies:',assemblies.length,'first size:',assemblies[0]?.cells.length);})"
```
Expected: several assemblies, each with >1 cell (motor + arms).

- [ ] **Step 3: Update the README blocks table**

In `README.md`, replace the Blades and Platform rows with:
```markdown
| **Slow / Fast Motor** | spins in place; attach Blade/Board cubes next to it and the whole shape spins as one |
| **Blade / Board** | attach to a motor to build custom spinners — a flat shape carries you, a spinning bar knocks you flying. Loose ones are just solid blocks |
```

- [ ] **Step 4: Build + commit**

Run: `npm run build`
Expected: succeeds.

```bash
git add scripts/gen-levels.mjs public/levels README.md
git commit -m "Motor blocks: regenerate examples with motors+arms; docs"
```

---

## Self-Review

- **Spec coverage:** new blocks + config (Task 1), `computeAssemblies` (Task 2), migration (Task 3), `motorBodies` physics (Task 4), `movingCells` exclusion (Task 5), assembly rendering (Task 6), integration/swap + remove old blocks + strip spinners + delete spinnerBodies (Task 7), examples + docs (Task 8). Non-goals (single axis, no per-motor speed, no translation) respected. All covered.
- **Placeholders:** none — every code step has complete code; colours/ids/speeds are exact per Global Constraints.
- **Type consistency:** `computeAssemblies` returns `{ assemblies, movingCells }` used identically in Tasks 4–7; `motorBodies.entries[i].body` consumed by the assembly renderer (Task 6) and main (Task 7); `rebuild(level, movingCells?)` signature consistent across `voxels`/`voxelBody` (Task 5) and its callers (Task 7); `migrateLegacyBlocks(level)` used at the load sites (Task 7). `spinner`/`platformSpin` removed only in Task 7 after all consumers stop referencing them.
