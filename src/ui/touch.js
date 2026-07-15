// ui/touch.js — touch controls for the tablets: a virtual joystick on the left
// half of the screen and a jump button on the right. Built on POINTER events
// (not the Touch API) so it also works with a mouse for testing.
//
// The joystick is "floating": wherever you first press in the left half becomes
// its centre, and dragging from there gives the move direction. Only active in
// PLAY mode (setEnabled), so it never fights the editor's tap-to-place. The UI
// only appears once a real touch has been seen.

const MAX_RADIUS = 60; // px from joystick centre = full tilt

export function createTouchControls({ onJump }) {
  let enabled = false;
  let touchSeen = false;
  const vector = { x: 0, y: 0 }; // x: right+, y: up+ (screen), each in [-1,1]
  let joyPointer = null;
  const origin = { x: 0, y: 0 };

  // --- Joystick visuals -----------------------------------------------------
  const base = document.createElement('div');
  Object.assign(base.style, {
    position: 'fixed',
    width: `${MAX_RADIUS * 2}px`,
    height: `${MAX_RADIUS * 2}px`,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    border: '2px solid rgba(255,255,255,0.35)',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '15',
  });
  const knob = document.createElement('div');
  Object.assign(knob.style, {
    position: 'fixed',
    width: '48px',
    height: '48px',
    marginLeft: '-24px',
    marginTop: '-24px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.5)',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '16',
  });

  // --- Jump button ----------------------------------------------------------
  const jumpBtn = document.createElement('button');
  jumpBtn.textContent = '⤒ Jump';
  Object.assign(jumpBtn.style, {
    position: 'fixed',
    right: '24px',
    bottom: '40px',
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(39,174,96,0.8)',
    color: '#fff',
    font: '700 16px system-ui, sans-serif',
    display: 'none',
    zIndex: '15',
    touchAction: 'none',
  });
  let jumpDown = false; // jump button held (continuous swim-up in water)
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (enabled) {
      jumpDown = true;
      onJump();
    }
  });
  const releaseJump = () => (jumpDown = false);
  jumpBtn.addEventListener('pointerup', releaseJump);
  jumpBtn.addEventListener('pointercancel', releaseJump);
  jumpBtn.addEventListener('pointerleave', releaseJump);

  document.body.append(base, knob, jumpBtn);

  function showUI(on) {
    const disp = on && touchSeen ? '' : 'none';
    jumpBtn.style.display = disp;
    if (!on) hideJoystick();
  }

  function hideJoystick() {
    base.style.display = 'none';
    knob.style.display = 'none';
    joyPointer = null;
    vector.x = 0;
    vector.y = 0;
  }

  function placeJoystick(x, y) {
    origin.x = x;
    origin.y = y;
    base.style.left = `${x - MAX_RADIUS}px`;
    base.style.top = `${y - MAX_RADIUS}px`;
    base.style.display = '';
    knob.style.left = `${x}px`;
    knob.style.top = `${y}px`;
    knob.style.display = '';
  }

  function updateKnob(x, y) {
    let dx = x - origin.x;
    let dy = y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > MAX_RADIUS) {
      dx = (dx / len) * MAX_RADIUS;
      dy = (dy / len) * MAX_RADIUS;
    }
    knob.style.left = `${origin.x + dx}px`;
    knob.style.top = `${origin.y + dy}px`;
    vector.x = dx / MAX_RADIUS;
    vector.y = -dy / MAX_RADIUS; // screen y is down; we want up = +
  }

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touchSeen = true;
      if (enabled) showUI(true);
    }
    if (!enabled) return;
    // Left half (and not the jump button) drives the joystick.
    if (e.clientX < window.innerWidth / 2 && joyPointer === null) {
      joyPointer = e.pointerId;
      placeJoystick(e.clientX, e.clientY);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (enabled && e.pointerId === joyPointer) updateKnob(e.clientX, e.clientY);
  });
  const endJoy = (e) => {
    if (e.pointerId === joyPointer) hideJoystick();
  };
  window.addEventListener('pointerup', endJoy);
  window.addEventListener('pointercancel', endJoy);

  return {
    // Current move direction, or {x:0,y:0} when idle. y is "forward".
    getVector: () => vector,
    isJumpHeld: () => jumpDown,
    setEnabled(on) {
      enabled = on;
      if (!on) jumpDown = false;
      showUI(on);
    },
  };
}
