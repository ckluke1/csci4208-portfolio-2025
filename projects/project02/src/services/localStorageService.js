const LS_KEY = 'minesweeper-spa-state-v1';

export function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse local state', err);
    return null;
  }
}

export function savePersistedState(partial) {
  try {
    const existing = loadPersistedState() || {};
    const merged = { ...existing, ...partial, _version: 1 };
    localStorage.setItem(LS_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('Failed to save local state', err);
  }
}

// Separate helpers for TTL caching of fox image
const FOX_IMAGE_KEY = 'minesweeper-fox-image-cache-v1';
const FOX_IMAGE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function loadCachedFoxImage() {
  try {
    const raw = localStorage.getItem(FOX_IMAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.timestamp || Date.now() - data.timestamp > FOX_IMAGE_TTL_MS) {
      return null;
    }
    return data.foxImage;
  } catch {
    return null;
  }
}

export function saveCachedFoxImage(foxImage) {
  try {
    localStorage.setItem(FOX_IMAGE_KEY, JSON.stringify({
      foxImage,
      timestamp: Date.now()
    }));
  } catch { /* ignore */ }
}
