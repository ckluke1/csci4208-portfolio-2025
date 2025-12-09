import { subscribe, setState } from './state/store.js';
import { renderApp } from './ui/AppView.js';
import { initRouter } from './router.js';
import { loadPersistedState, savePersistedState } from './services/localStorageService.js';
import { fetchFoxImage } from './services/publicApi.js';
import { fetchHighScores } from './services/jsonbinService.js';

const root = document.getElementById('app-root');

function bootFromLocal() {
  const persisted = loadPersistedState();
  if (!persisted) return;
  const patch = {};
  if (persisted.settings) {
    const settings = { ...persisted.settings };
    if (settings.animateMines === undefined) settings.animateMines = true;
    patch.settings = settings;
  }
  if (persisted.game) patch.game = persisted.game;
  setState(patch);
}

async function bootNetworking() {
  // Fox image
  try {
    setState({ foxImageStatus: 'loading' });
    const { foxImage } = await fetchFoxImage();
    setState({ foxImageStatus: 'success', foxImage });
  } catch (err) {
    console.warn(err);
    setState({ foxImageStatus: 'error', foxImageError: err.message });
  }

  // High scores
  try {
    setState({ highScoresStatus: 'loading' });
    // Merge local and remote, but only include standard categories
    function getCategory(rows, cols, mines) {
      if (rows === 9 && cols === 9 && mines === 10) return 'easy';
      if (rows === 16 && cols === 16 && mines === 40) return 'medium';
      if (rows === 16 && cols === 30 && mines === 99) return 'hard';
      return 'custom';
    }

    const remote = await fetchHighScores();
    const local = JSON.parse(localStorage.getItem('minesweeper-local-highscores') || '[]');

    const normalize = (entry) => {
      if (!entry) return null;
      const e = { ...entry };
      if (!e.category) e.category = getCategory(e.rows, e.cols, e.mines);
      return e;
    };

    const merged = [...(remote || []), ...(local || [])]
      .map(normalize)
      .filter(Boolean)
      .filter((e) => ['easy', 'medium', 'hard'].includes(e.category))
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .slice(0, 20);

    setState({ highScoresStatus: 'success', highScores: merged });
  } catch (err) {
    console.warn(err);
    const local = JSON.parse(localStorage.getItem('minesweeper-local-highscores') || '[]');
    // Filter local to standard categories
    function getCategory(rows, cols, mines) {
      if (rows === 9 && cols === 9 && mines === 10) return 'easy';
      if (rows === 16 && cols === 16 && mines === 40) return 'medium';
      if (rows === 16 && cols === 30 && mines === 99) return 'hard';
      return 'custom';
    }
    const normalizedLocal = (local || [])
      .map((e) => ({ ...e, category: e.category || getCategory(e.rows, e.cols, e.mines) }))
      .filter((e) => ['easy', 'medium', 'hard'].includes(e.category))
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .slice(0, 20);

    setState({ highScoresStatus: 'error', highScoresError: err.message, highScores: normalizedLocal });
  }
}

function persistOnChange(state) {
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
