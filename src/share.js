// share.js — talks to the level-sharing Worker (see worker/). Disabled cleanly
// when CONFIG.share.url is empty, so the game runs with no backend.
//
// The friends-only passphrase is NEVER stored in the code or the built bundle:
// each player types it once, it's kept in localStorage on their device, and
// sent with each request. The Worker (which holds the real secret) accepts or
// rejects — so nothing secret ships in this public repo.

import { CONFIG } from './config.js';

const KEY_STORAGE = 'vloxels.shareKey';

export function shareEnabled() {
  return !!(CONFIG.share && CONFIG.share.url);
}

// Read a `?code=...` share code out of a URL query string (e.g. location.search),
// or null if there isn't one. Pure, so it's unit-testable.
export function shareCodeFromSearch(search) {
  try {
    return new URLSearchParams(search).get('code');
  } catch {
    return null;
  }
}

export function getShareKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}
export function setShareKey(key) {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* ignore */
  }
}
export function clearShareKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

// Do the fetch; turn a network failure into a friendly error, and a 401 (wrong
// passphrase) into an error flagged `badKey` so the UI can re-prompt.
async function request(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('Could not reach the sharing server. Check your connection.');
  }
  if (res.status === 401) {
    const err = new Error('That passphrase did not work.');
    err.badKey = true;
    throw err;
  }
  return res;
}

// Upload a level, resolve to its share code (e.g. "brave-fox-42").
export async function shareLevel(level) {
  const res = await request(`${CONFIG.share.url}/levels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Vloxels-Key': getShareKey() },
    body: JSON.stringify(level.toJSON()),
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(info.error || `Share failed (${res.status})`);
  }
  return (await res.json()).code;
}

// Fetch a shared level by code, resolve to a vloxels-level object.
export async function loadShared(code) {
  const res = await request(`${CONFIG.share.url}/levels/${encodeURIComponent(code.trim())}`, {
    headers: { 'X-Vloxels-Key': getShareKey() },
  });
  if (res.status === 404) throw new Error('No level found for that code.');
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return await res.json();
}
