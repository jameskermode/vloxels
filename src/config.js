// config.js — ALL tuning lives here, in one place, so a 9-year-old can
// experiment ("what if gravity were moon gravity?") without hunting through
// the code. Every value has a comment.

export const CONFIG = {
  // --- Level grid -----------------------------------------------------------
  // Size of the build volume in voxels: 32 wide, 8 tall, 32 deep.
  grid: { x: 32, y: 8, z: 32 },
  voxelSize: 1, // world units per voxel (keep at 1 — lots of code assumes it)

  // --- Renderer -------------------------------------------------------------
  // Cap pixel ratio: retina looks nice but murders the Pi's little GPU.
  maxPixelRatio: 1.5,
  skyColor: 0x8ecaff, // sky / clear colour
  groundColor: 0x4a6b3a, // big ground plane under the level

  // --- Lights ---------------------------------------------------------------
  hemiSkyColor: 0xbfe3ff,
  hemiGroundColor: 0x556b2f,
  hemiIntensity: 0.9,
  dirColor: 0xffffff,
  dirIntensity: 0.9,
  dirPosition: [12, 20, 8], // direction the sun comes from

  // --- Water flow -----------------------------------------------------------
  // How far water spreads sideways from where it starts (like Minecraft's 7).
  // Bigger = water travels further before petering out. Falling water resets
  // this, so waterfalls create fresh spread where they land.
  water: { reach: 6 },

  // --- Physics --------------------------------------------------------------
  gravity: -20, // snappier than -9.81 for a platformer. Try -3 for the moon!
  fixedStep: 1 / 60, // physics ticks at a rock-steady 60 Hz
  maxFrameDt: 0.05, // clamp real frame time so a lag spike can't explode physics

  // --- Spinners (the signature feature) ------------------------------------
  spin: {
    coinSpeed: 2.0, // radians/sec the coin turns about y
    coinBob: 0.12, // how far the coin bobs up/down (world units)
    coinBobSpeed: 2.5, // how fast it bobs
    bladeSpeed: 4.0, // radians/sec for the spinning blades (fast = scary)
    platformSpeed: 0.6, // radians/sec for carry-platforms (slow = ridable)
    platformFriction: 1.0, // high friction so the player is carried around
  },

  // --- Player (used from Milestone 5 on) -----------------------------------
  player: {
    radius: 0.3,
    halfHeight: 0.45,
    speed: 6, // target horizontal speed, units/sec
    jumpSpeed: 8.5, // upward velocity on jump
    airControl: 0.25, // how much steering you get mid-air (0..1)
    groundControl: 1.0, // full steering when standing on something
    linearDamping: 0.2,
    friction: 0.5,
    coyoteTime: 0.1, // seconds after leaving a ledge you can still jump
    jumpBuffer: 0.1, // seconds a too-early jump press is remembered
    fallKillY: -5, // fall below this world-y and you respawn
  },
};
