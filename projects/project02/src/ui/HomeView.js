import { h, clearChildren } from '../utils/dom.js';
import { setState, getState } from '../state/store.js';

export function renderHome(root) {
  const state = getState();
  clearChildren(root);

  const container = h('div', { className: 'home-view' },
    h('h1', {}, 'Minesweeper'),
    h('p', {}, ''),
    h('div', { className: 'home-actions' },
      h('button', {
        onClick: () => setState({ view: 'game' })
      }, 'Play'),
      h('button', {
        onClick: () => setState({ view: 'settings' })
      }, 'Settings'),
      h('button', {
        onClick: () => setState({ view: 'highscores' })
      }, 'High Scores')
    )
  );

  root.appendChild(container);
}
