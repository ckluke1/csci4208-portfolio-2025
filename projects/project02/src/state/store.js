// Central app state and pub/sub store

const listeners = new Set();

// Initial state
const initialState = {
  view: 'home', // 'home' | 'game' | 'settings' | 'highscores'
  foxImage: null, // from public API
  foxImageStatus: 'idle', // 'idle' | 'loading' | 'success' | 'error'
  foxImageError: null,
  game: null, // Game instance serialized
  settings: {
    rows: 9,
    cols: 9,
    mines: 10,
    animateMines: true
  },
  highScores: [], // {name, timeSeconds, rows, cols, mines, timestamp}
  highScoresStatus: 'idle', // 'idle' | 'loading' | 'success' | 'error'
  highScoresError: null
};

let state = structuredClone(initialState);

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    fn(state);
  }
}

export function setState(patch) {
  state = { ...state, ...patch };
  notify();
}

export function resetState() {
  state = structuredClone(initialState);
  notify();
}
