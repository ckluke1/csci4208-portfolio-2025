import { getState } from '../state/store.js';
import { renderHome } from './HomeView.js';
import { renderGame } from './GameView.js';
import { renderSettings } from './SettingsView.js';
import { renderHighScores } from './HighScoresView.js';

export function renderApp(root) {
  const state = getState();
  if (state.view === 'home') {
    renderHome(root);
  } else if (state.view === 'game') {
    renderGame(root);
  } else if (state.view === 'settings') {
    renderSettings(root);
  } else if (state.view === 'highscores') {
    renderHighScores(root);
  }
}
