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

// Coin tally shown while playing.
export function createCoinCounter() {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    top: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 12px',
    background: 'rgba(0,0,0,0.45)',
    borderRadius: '10px',
    color: '#ffd24a',
    font: '700 18px system-ui, sans-serif',
    zIndex: '10',
    display: 'none',
  });
  document.body.appendChild(el);
  let total = 0;
  function render(n) {
    el.textContent = `🪙 ${n} / ${total}`;
  }
  return {
    el,
    show(totalCoins) {
      total = totalCoins;
      render(0);
      el.style.display = '';
    },
    set(n) {
      render(n);
    },
    hide() {
      el.style.display = 'none';
    },
  };
}

// Win overlay: coin tally + Replay button. onReplay() restarts the level.
export function createWinOverlay({ onReplay }) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '18px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    font: '800 40px system-ui, sans-serif',
    textAlign: 'center',
    zIndex: '20',
  });
  const title = document.createElement('div');
  title.textContent = '🎉 You win!';
  const tally = document.createElement('div');
  tally.style.font = '600 22px system-ui, sans-serif';
  const btn = document.createElement('button');
  btn.textContent = '↻ Replay';
  Object.assign(btn.style, {
    minWidth: '160px',
    minHeight: '56px',
    border: 'none',
    borderRadius: '12px',
    background: '#27ae60',
    color: '#fff',
    font: '700 20px system-ui, sans-serif',
    cursor: 'pointer',
  });
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', onReplay);
  overlay.append(title, tally, btn);
  document.body.appendChild(overlay);
  return {
    el: overlay,
    show(coins, total) {
      tally.textContent = `Coins: ${coins} / ${total}`;
      overlay.style.display = 'flex';
    },
    hide() {
      overlay.style.display = 'none';
    },
  };
}

// A small overlay showing a share code with a Copy button.
export function showCodeDialog(code) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexDirection: 'column', gap: '14px',
    background: 'rgba(0,0,0,0.6)', color: '#fff', zIndex: '30',
    font: '700 20px system-ui, sans-serif', textAlign: 'center', padding: '20px',
  });
  const label = document.createElement('div');
  label.textContent = 'Level code — tell your friends!';
  const codeEl = document.createElement('div');
  codeEl.textContent = code;
  codeEl.style.font = '800 34px ui-monospace, monospace';
  codeEl.style.color = '#ffd24a';
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '10px';
  const mk = (text, bg, fn) => {
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      minHeight: '48px', padding: '0 18px', border: 'none', borderRadius: '10px',
      background: bg, color: '#fff', font: '700 16px system-ui, sans-serif', cursor: 'pointer',
    });
    b.addEventListener('click', fn);
    return b;
  };
  const copyBtn = mk('Copy code', '#2a3550', () => {
    navigator.clipboard?.writeText(code).then(() => (copyBtn.textContent = 'Copied!'));
  });
  // A one-click link that auto-loads this level when opened.
  const link = `${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`;
  const linkBtn = mk('Copy link', '#2a3550', () => {
    navigator.clipboard?.writeText(link).then(() => (linkBtn.textContent = 'Copied!'));
  });
  const closeBtn = mk('Close', '#27ae60', () => overlay.remove());
  row.append(copyBtn, linkBtn, closeBtn);
  overlay.append(label, codeEl, row);
  document.body.appendChild(overlay);
}

// Edit-mode toolbar: New, an Examples picker, and (when a sharing backend is
// configured) Share / Load Code. Callbacks:
//   onNew(), onLoadExample(file), onShare(), onLoadCode()
export function createLevelToolbar({ onNew, examples, onLoadExample, onShare, onLoadCode }) {
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    left: '8px',
    bottom: '10px',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    padding: '6px',
    background: 'rgba(0,0,0,0.45)',
    borderRadius: '10px',
    zIndex: '10',
  });

  const mkBtn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      minHeight: '40px',
      padding: '0 10px',
      border: 'none',
      borderRadius: '8px',
      background: '#2a3550',
      color: '#fff',
      font: '600 13px system-ui, sans-serif',
      cursor: 'pointer',
    });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', fn);
    return b;
  };

  bar.appendChild(mkBtn('New', onNew));

  if (onShare) bar.appendChild(mkBtn('Share', onShare));
  if (onLoadCode) bar.appendChild(mkBtn('Load Code', onLoadCode));

  // Examples dropdown.
  if (examples && examples.length) {
    const sel = document.createElement('select');
    Object.assign(sel.style, {
      minHeight: '40px',
      borderRadius: '8px',
      border: 'none',
      background: '#2a3550',
      color: '#fff',
      font: '600 13px system-ui, sans-serif',
      padding: '0 8px',
    });
    const def = document.createElement('option');
    def.textContent = 'Examples…';
    def.value = '';
    sel.appendChild(def);
    for (const ex of examples) {
      const o = document.createElement('option');
      o.textContent = ex.name;
      o.value = ex.file;
      sel.appendChild(o);
    }
    sel.addEventListener('pointerdown', (e) => e.stopPropagation());
    sel.addEventListener('change', () => {
      if (sel.value) onLoadExample(sel.value);
      sel.value = '';
    });
    bar.appendChild(sel);
  }

  document.body.appendChild(bar);
  return { el: bar };
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
