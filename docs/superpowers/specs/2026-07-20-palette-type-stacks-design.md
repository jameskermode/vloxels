# Vloxels — Palette Type-Stacks (declutter the block picker)

**Date:** 2026-07-20
**Status:** Approved design, ready for implementation planning.

## Goal

The block palette is one horizontal row of 15 coloured buttons and is getting
crowded. Replace it with **5 category buttons**; each opens a **vertical stack**
of that type's blocks — on **hover** (desktop) or **tap** (touch).

## Decisions (from brainstorming)

- **Open behaviour:** desktop hovers a category to reveal its stack; touch taps
  to open it (tap a block to pick, tap away/another category to close).
- **Category button = compact icon + colour swatch**, tinted to the currently-
  picked block in that group; the group holding the live selection is outlined.
- **Grouping is derived from existing block flags** (no per-block edits; new
  blocks auto-sort into a group). Water is its own single-item group.

## Categories

Display order, icon, and the flag rule that slots each block:

| order | key | icon | label | blocks (via `categoryOf`) |
|-------|-----|------|-------|---------------------------|
| 1 | terrain | 🧱 | Terrain | Grass, Brick |
| 2 | water | 💧 | Water | Water |
| 3 | machines | ⚙️ | Machines | Slow/Fast Motor, Blade, Board, Slow/Fast Slider, Shaft |
| 4 | pickups | 🪙 | Pickups | Coin, Scuba Kit, Glider |
| 5 | markers | 🚩 | Markers | Start, Goal |

`categoryOf(def)` (first match wins — machines before terrain, since motor arms
are also `solid`):

```
if (def.motor || def.arm || def.shaft) return 'machines';
if (def.collect || def.wear)          return 'pickups';
if (def.unique || def.wins)           return 'markers';
if (def.flow)                          return 'water';
if (def.solid)                         return 'terrain';
return 'misc'; // fallback bucket so a future block never vanishes
```

A `CATEGORIES` list in `palette.js` holds `{ key, icon, label }` in display
order (plus a trailing `misc` shown only if non-empty). Blocks are taken from
`BLOCK_LIST` and bucketed by `categoryOf`, preserving registry order within a
group. An empty group renders no button.

## Layout & interaction

- The bar stays fixed at bottom-centre: a flex row of category buttons (48px
  touch targets, same dark rounded bar).
- **Category button:** the emoji, on a background tinted to that group's
  *remembered pick* (the last block chosen in the group; defaults to the
  group's first block). The group that contains the globally-selected block
  gets the white selection outline.
- **The stack:** an absolutely-positioned column that sits **above** its
  category button (bottom-anchored, so it grows upward), hidden by default.
  Each entry is a labelled coloured button — exactly today's block button —
  stacked vertically, newest design otherwise unchanged.
- **Reveal:**
  - Desktop **hover**: a `<style>` rule shows the stack while the category
    (or its stack, which is a child) is `:hover`.
  - Touch **tap**: clicking/tapping the category toggles an `open` class
    (`.vx-open`) that also shows the stack; opening one category closes the
    others.
  - **Pick:** clicking a block sets the selection, records it as that group's
    remembered pick, and closes the stack (removes `open`).
  - **Dismiss:** a document-level `pointerdown` outside the palette removes
    `open` from all categories.
- **Single-block group (Water):** its category button selects the block
  directly on click — no one-item popup.
- Taps inside the palette `stopPropagation` on `pointerdown` (as today) so they
  don't fall through to the 3D canvas.

## Public API (unchanged)

`createPalette()` still returns `{ el, getSelectedId(), setSelectedId(id) }`.
`main.js` and the editor keep working untouched. `setSelectedId` updates the
selection, sets the owning group's remembered pick, and refreshes highlights.

## Testing

DOM/hover/tap behaviour is browser-verified (build + playtest) — the project has
no DOM test harness. The **pure grouping logic** is extracted and unit-tested in
Node:

- `categoryOf(def)` returns the right group for every current block (Grass→
  terrain, Water→water, each motor/arm/shaft→machines, Coin/Scuba/Glider→
  pickups, Start/Goal→markers) and `misc` for a flagless stub.
- Grouping `BLOCK_LIST` yields the 5 expected non-empty groups in order, every
  block appears in exactly one group, and registry order is preserved within a
  group.
- `npm run build` succeeds; a quick manual check that a new block added to the
  registry would appear under its derived group (covered by the grouping test).

## Non-goals (v1)

- No drag-and-drop, no search, no reordering, no favourites.
- No per-block `category` field in `blocks.js` (derived from flags instead).
- No keyboard navigation (the palette has none today).
- Category set is fixed in `palette.js`; not user-configurable.

## Rough build order (refined in the plan)

1. Extract `categoryOf` + a `groupBlocks(list)` helper (pure, exported) with
   Node tests.
2. Rewrite `palette.js` DOM to render category buttons + hover/tap stacks using
   those helpers; keep the public API; build check.
