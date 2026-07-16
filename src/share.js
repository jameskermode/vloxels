// share.js — talks to the level-sharing Worker (see worker/). Disabled cleanly
// when CONFIG.share.url is empty, so the game runs with no backend.

import { CONFIG } from './config.js';

export function shareEnabled() {
  return !!(CONFIG.share && CONFIG.share.url);
}

// Upload a level, resolve to its share code (e.g. "brave-fox-42").
export async function shareLevel(level) {
  let res;
  try {
    res = await fetch(`${CONFIG.share.url}/levels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vloxels-Key': CONFIG.share.key },
      body: JSON.stringify(level.toJSON()),
    });
  } catch {
    throw new Error('Could not reach the sharing server. Check your connection.');
  }
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(info.error || `Share failed (${res.status})`);
  }
  return (await res.json()).code;
}

// Fetch a shared level by code, resolve to a vloxels-level object.
export async function loadShared(code) {
  let res;
  try {
    res = await fetch(`${CONFIG.share.url}/levels/${encodeURIComponent(code.trim())}`, {
      headers: { 'X-Vloxels-Key': CONFIG.share.key },
    });
  } catch {
    throw new Error('Could not reach the sharing server. Check your connection.');
  }
  if (res.status === 404) throw new Error('No level found for that code.');
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return await res.json();
}
