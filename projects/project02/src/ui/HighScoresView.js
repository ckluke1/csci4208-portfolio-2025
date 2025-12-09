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

  // Group by category: easy, medium, hard
  const groups = {
    easy: (state.highScores || []).filter((s) => s.category === 'easy'),
    medium: (state.highScores || []).filter((s) => s.category === 'medium'),
    hard: (state.highScores || []).filter((s) => s.category === 'hard')
  };

  const maybeRenderGroup = (title, items) => {
    container.appendChild(h('h3', {}, title));
    if (!items || items.length === 0) {
      container.appendChild(h('p', {}, 'No scores yet for this difficulty.'));
      return;
    }
    const ol = h('ol', {});
    items.forEach((hs) => {
      const label = `${hs.name || 'Anonymous'} — ${formatSeconds(hs.timeSeconds)} (${hs.rows}x${hs.cols}, ${hs.mines} mines)`;
      ol.appendChild(h('li', {}, label));
    });
    container.appendChild(ol);
  };

  maybeRenderGroup('Easy', groups.easy);
  maybeRenderGroup('Medium', groups.medium);
  maybeRenderGroup('Hard', groups.hard);

  container.appendChild(h('p', { className: 'note' }, 'Custom boards are not eligible for high scores.'));

  root.appendChild(container);
}
