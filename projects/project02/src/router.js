import { setState, getState } from './state/store.js';

// Simple hash-based router
const routes = new Set(['home', 'game', 'settings', 'highscores']);

export function initRouter() {
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
}

function handleHashChange() {
  const hash = window.location.hash.replace('#', '') || 'home';
  if (!routes.has(hash)) return;
  const current = getState().view;
  if (current !== hash) {
    setState({ view: hash });
  }
}

export function navigate(view) {
  if (!routes.has(view)) return;
  window.location.hash = view === 'home' ? '' : `#${view}`;
}
