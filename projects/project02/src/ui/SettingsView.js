import { h, clearChildren } from '../utils/dom.js';
import { getState, setState } from '../state/store.js';
import { savePersistedState } from '../services/localStorageService.js';


export function renderSettings(root) {
  const state = getState();
  clearChildren(root);

  const { rows, cols, mines } = state.settings;

  const onSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newRows = Number(formData.get('rows'));
    const newCols = Number(formData.get('cols'));
    const newMines = Number(formData.get('mines'));
    const safeMines = Math.max(1, Math.min(newMines, newRows * newCols - 1));
    const settings = {
      rows: Math.max(4, Math.min(newRows, 30)),
      cols: Math.max(4, Math.min(newCols, 30)),
      mines: safeMines
    };
    // Save settings
    setState({ settings });
    savePersistedState({ settings });
    // Create new game and update state
    try {
      // Dynamically import Game to avoid circular dependency
      import('../engine/Game.js').then(({ Game }) => {
        const game = new Game(settings.rows, settings.cols, settings.mines);
        setState({ game: game.toJSON(), view: 'game' });
      });
    } catch (err) {
      setState({ view: 'game' });
    }
  };

  const form = h('form', { onSubmit, className: 'settings-view' },
    h('h2', {}, 'Settings'),
    h('label', {}, 'Rows:',
      h('input', { type: 'number', name: 'rows', value: rows, min: 4, max: 30 })
    ),
    h('br'),
    h('label', {}, 'Columns:',
      h('input', { type: 'number', name: 'cols', value: cols, min: 4, max: 30 })
    ),
    h('br'),
    h('label', {}, 'Mines:',
      h('input', { type: 'number', name: 'mines', value: mines, min: 1 })
    ),
    h('br'),
    h('button', { type: 'submit' }, 'Save'),
    h('button', {
      type: 'button',
      onClick: () => setState({ view: 'home' })
    }, 'Back')
  );

  root.appendChild(form);
}
