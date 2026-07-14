// ui/hud.js — on-screen readouts. For Milestone 1 this is just the fps + physics
// step-time counter (toggle with F). Later milestones add the coin count, mode
// button and win overlay here.

export function createFpsCounter() {
  const el = document.getElementById('fps');
  let visible = true;
  let frames = 0;
  let acc = 0; // accumulated real time since last fps update
  let fps = 0;
  let stepMs = 0; // last measured physics step time, milliseconds

  // Toggle visibility with F.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      visible = !visible;
      el.style.display = visible ? '' : 'none';
    }
  });

  return {
    // Call once per animation frame with the real frame dt (seconds).
    tick(dt) {
      frames += 1;
      acc += dt;
      if (acc >= 0.5) {
        fps = Math.round(frames / acc);
        frames = 0;
        acc = 0;
        if (visible) {
          el.textContent = `${fps} fps\n${stepMs.toFixed(2)} ms physics`;
        }
      }
    },
    // Report the most recent physics step time (ms). Shown on next fps update.
    setStepMs(ms) {
      stepMs = ms;
    },
  };
}
