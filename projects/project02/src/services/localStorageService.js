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

// Separate helpers for TTL caching of quote
const QUOTE_KEY = 'minesweeper-quote-cache-v1';
const QUOTE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function loadCachedQuote() {
  try {
    const raw = localStorage.getItem(QUOTE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.timestamp || Date.now() - data.timestamp > QUOTE_TTL_MS) {
      return null;
    }
    return data.quote;
  } catch {
    return null;
  }
}

export function saveCachedQuote(quote) {
  try {
    localStorage.setItem(QUOTE_KEY, JSON.stringify({
      quote,
      timestamp: Date.now()
    }));
  } catch { /* ignore */ }
}
