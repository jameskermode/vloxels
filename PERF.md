# Performance log

Frame rate (and, once physics is running, physics step time) at each
milestone. Targets: **60 fps MacBook**, **accept 30 fps Pi**. Red line: if
Pi fps < 25 **or** physics step time > 4 ms, stop and optimise (first suspects:
collider count, CCD scope) before adding features.

Toggle the on-screen counter with **F** (shows fps + ms/physics-step).

| Milestone | Scene | MacBook fps | Pi 400 fps | Pi step time (ms) |
|-----------|-------|-------------|------------|-------------------|
| 4 — physics sandbox | starter platform + debug balls | 60 | 37 | _not captured_ |
| 5 — play mode | starter platform + player (CCD + grounded ray/step) | 60 | 35 | ~0.5 |
| 6 — spinners + rules | player + coin + blades + platform + sensors | 60 | 35 | ~2 |

## Notes

- **M4 (2026-07-14):** Pi 37 fps, MacBook 60 fps — both healthy, above the
  30 fps Pi target.
- **M5 (2026-07-15):** Pi 35 fps, ~0.5 ms/physics-step — comfortably inside
  both budgets (target 30 fps, red line 4 ms/step). The player's CCD +
  per-step grounded raycast add negligible CPU.
- **M6 (2026-07-15):** Pi 35 fps, ~2 ms/physics-step. The kinematic spinners
  (blades/platform) roughly 4×'d the step time vs M5, but it's still half the
  4 ms red line and fps held at 35. Watch it if a level piles on many
  blades/platforms; first levers are spinner count and CCD scope.
