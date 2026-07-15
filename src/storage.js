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

// --- File export / import (how levels travel between machines) --------------

// Download the level as a .json file (named after the level).
export function exportLevel(level) {
  const json = JSON.stringify(level.toJSON(), null, 0);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeName = (level.name || 'level').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Read a File (from an <input type="file">) and resolve to a parsed object
// suitable for Level.fromJSON. Rejects if it isn't a vloxels level.
export function readLevelFile(file) {
  return file.text().then((text) => JSON.parse(text));
}
