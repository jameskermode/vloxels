// storage.js — persistence. Milestone 3 uses localStorage autosave/load so a
// level survives a page refresh. JSON file export/import (how levels travel
// between the MacBook, Pi and tablets) is wired up in Milestone 7.

import { Level } from './level.js';

const KEY = 'vloxels.currentLevel';

// Save immediately (used by the debounced autosaver below).
export function save(level) {
  try {
    localStorage.setItem(KEY, JSON.stringify(level.toJSON()));
    return true;
  } catch (err) {
    console.warn('[vloxels] save failed:', err);
    return false;
  }
}

// Load the autosaved level, or null if there isn't one / it's corrupt.
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return Level.fromJSON(JSON.parse(raw));
  } catch (err) {
    console.warn('[vloxels] load failed, ignoring saved level:', err);
    return null;
  }
}

// Returns a function you call after every edit; it saves at most once per
// `delay` ms so rapid edits don't hammer localStorage.
export function createAutosaver(delay = 1000) {
  let timer = null;
  return function autosave(level) {
    clearTimeout(timer);
    timer = setTimeout(() => save(level), delay);
  };
}
