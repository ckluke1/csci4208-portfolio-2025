import { h, clearChildren, formatSeconds } from '../utils/dom.js';
import { getState, setState } from '../state/store.js';

export function renderHighScores(root) {
  const state = getState();
  clearChildren(root);

  const container = h('div', { className: 'highscores-view' },
    h('h2', {}, 'High Scores'),
    h('button', { onClick: () => setState({ view: 'home' }) }, 'Back to Home')
  );

  if (state.highScoresStatus === 'loading') {
    container.appendChild(h('p', {}, 'Loading global high scores...'));
  } else if (state.highScoresStatus === 'error') {
    container.appendChild(h('p', {}, 'Could not load global high scores. Showing local scores if available.'));
  }

  const list = h('ol', {});
  (state.highScores || []).forEach((hs) => {
    const label = `${hs.name || 'Anonymous'} — ${formatSeconds(hs.timeSeconds)} (${hs.rows}x${hs.cols}, ${hs.mines} mines)`;
    list.appendChild(h('li', {}, label));
  });

  if (!state.highScores || state.highScores.length === 0) {
    container.appendChild(h('p', {}, 'No high scores yet. Play a game to create one!'));
  } else {
    container.appendChild(list);
  }

  root.appendChild(container);
}
