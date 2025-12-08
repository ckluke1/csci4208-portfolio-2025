import { subscribe, setState } from './state/store.js';
import { renderApp } from './ui/AppView.js';
import { initRouter } from './router.js';
import { loadPersistedState, savePersistedState } from './services/localStorageService.js';
import { fetchMotivationQuote } from './services/publicApi.js';
import { fetchHighScores } from './services/jsonbinService.js';

const root = document.getElementById('app-root');

function bootFromLocal() {
  const persisted = loadPersistedState();
  if (!persisted) return;
  const patch = {};
  if (persisted.settings) patch.settings = persisted.settings;
  if (persisted.game) patch.game = persisted.game;
  setState(patch);
}

async function bootNetworking() {
  // Quote
  try {
    setState({ quoteStatus: 'loading' });
    const { quote } = await fetchMotivationQuote();
    setState({ quoteStatus: 'success', quote });
  } catch (err) {
    console.warn(err);
    setState({ quoteStatus: 'error', quoteError: err.message });
  }

  // High scores
  try {
    setState({ highScoresStatus: 'loading' });
    // Merge local and remote
    const remote = await fetchHighScores();
    const local = JSON.parse(localStorage.getItem('minesweeper-local-highscores') || '[]');
    const merged = [...remote, ...local]
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .slice(0, 20);
    setState({ highScoresStatus: 'success', highScores: merged });
  } catch (err) {
    console.warn(err);
    const local = JSON.parse(localStorage.getItem('minesweeper-local-highscores') || '[]');
    setState({ highScoresStatus: 'error', highScoresError: err.message, highScores: local });
  }
}

function persistOnChange(state) {
  // Persist key parts of state
  savePersistedState({
    settings: state.settings,
    game: state.game
  });
}

function main() {
  bootFromLocal();
  initRouter();
  subscribe((state) => {
    renderApp(root);
    persistOnChange(state);
  });
  renderApp(root);
  bootNetworking();
}

main();
