# Performance log

Frame rate (and, once physics is running, physics step time) at each
milestone. Targets: **60 fps MacBook**, **accept 30 fps Pi**. Red line: if
Pi fps < 25 **or** physics step time > 4 ms, stop and optimise (first suspects:
collider count, CCD scope) before adding features.

Toggle the on-screen counter with **F** (shows fps + ms/physics-step).

| Milestone | Scene | MacBook fps | Pi 400 fps | Pi step time (ms) |
|-----------|-------|-------------|------------|-------------------|
| 4 — physics sandbox | starter platform + debug balls | 60 | 37 | _TBD (press F)_ |

## Notes

- **M4 (2026-07-14):** Pi 37 fps, MacBook 60 fps — both healthy, above the
  30 fps Pi target. Physics step time on the Pi not yet captured; press **F**
  while balls are bouncing and note the "ms physics" figure so we have a
  baseline before the player + spinners add load in M5/M6.
