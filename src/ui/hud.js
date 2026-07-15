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

// A small on-screen control for the editor's working layer: ▲ / ▼ buttons and
// a "Layer N" readout. onUp/onDown are called when the buttons are pressed.
export function createLayerControl({ onUp, onDown }) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px',
    background: 'rgba(0,0,0,0.45)',
    borderRadius: '10px',
    color: '#fff',
    font: '600 13px system-ui, sans-serif',
    zIndex: '10',
  });

  const mkBtn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      minWidth: '48px',
      minHeight: '48px',
      border: 'none',
      borderRadius: '8px',
      background: '#2a3550',
      color: '#fff',
      font: '700 18px system-ui, sans-serif',
      cursor: 'pointer',
    });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', fn);
    return b;
  };

  const readout = document.createElement('span');
  readout.style.minWidth = '64px';
  readout.style.textAlign = 'center';

  box.appendChild(mkBtn('▼', onDown));
  box.appendChild(readout);
  box.appendChild(mkBtn('▲', onUp));
  document.body.appendChild(box);

  return {
    el: box,
    setValue(y) {
      readout.textContent = `Layer ${y}`;
    },
  };
}

// The big EDIT / PLAY mode toggle button. onToggle() is called on click.
export function createModeButton({ onToggle }) {
  const btn = document.createElement('button');
  Object.assign(btn.style, {
    position: 'fixed',
    top: '64px',
    right: '8px',
    minWidth: '96px',
    minHeight: '48px',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    font: '700 16px system-ui, sans-serif',
    cursor: 'pointer',
    zIndex: '10',
  });
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', onToggle);
  document.body.appendChild(btn);

  return {
    el: btn,
    // Show what pressing it will DO next (so it reads as an action).
    setMode(mode) {
      if (mode === 'play') {
        btn.textContent = '■ Stop';
        btn.style.background = '#c0392b';
      } else {
        btn.textContent = '▶ Play';
        btn.style.background = '#27ae60';
      }
    },
  };
}
