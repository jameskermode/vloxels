# Vloxels

A 3D Bloxels-style game: build a voxel level on a grid, then play it as a
third-person platformer. The signature feature is **spinning objects** with
**real physics** — spinning platforms carry you, blades knock you flying.

Built by a parent + 9-year-old team, so the code favours readability over
cleverness. All the fun tuning knobs live in one file: [`src/config.js`](src/config.js).

## Running it

```bash
npm install
npm run dev      # dev server, reachable on the LAN (for Pi/tablet playtests)
```

Then open the printed URL. On the same network, the Raspberry Pi 400 and
tablets can open the `http://<macbook-ip>:5173/` URL to playtest.

Production build:

```bash
npm run build    # outputs static site to dist/
npm run preview  # serve the built site (also --host)
```

To run standalone on the Pi you can `npm run build` there too, then serve
`dist/` with `npx serve dist` or `python3 -m http.server`.

## Controls (grows each milestone)

- **F** — toggle the fps / physics-step-time counter.

More controls (build, play, jump, mode toggle) arrive in later milestones.

## Milestones

See [`VLOXELS_SPEC.md`](VLOXELS_SPEC.md) for the full brief. Built in order:

1. **Scaffold + spinning cube** ← _current_
2. Level + instanced voxels
3. Editor
4. Physics sandbox
5. Play mode
6. Spinners + rules
7. Touch + polish

## Level format

Levels are versioned JSON (see the spec) and persist to `localStorage`, with
export/import as `.json` files so they travel between the MacBook, Pi and
tablets. Bundled example levels live in `public/levels/`.
