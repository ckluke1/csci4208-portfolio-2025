import { h, clearChildren } from '../utils/dom.js';
import { getState, setState } from '../state/store.js';
import { savePersistedState } from '../services/localStorageService.js';


export function renderSettings(root) {
  const state = getState();
  clearChildren(root);

  const { rows, cols, mines, animateMines = true } = state.settings;

  function detectPreset(r, c, m) {
    if (r === 9 && c === 9 && m === 10) return 'easy';
    if (r === 16 && c === 16 && m === 40) return 'medium';
    if (r === 16 && c === 30 && m === 99) return 'hard';
    return 'custom';
  }

  let selectedPreset = detectPreset(rows, cols, mines);

  const onSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const preset = formData.get('preset');
    const animate = formData.get('animateMines') === 'on';
    // If a preset  was selected, use its values
    if (preset && preset !== 'custom') {
      if (preset === 'easy') {
        const settings = { rows: 9, cols: 9, mines: 10, animateMines: animate };
        setState({ settings });
        savePersistedState({ settings });
        import('../engine/Game.js').then(({ Game }) => {
          const game = new Game(settings.rows, settings.cols, settings.mines);
          setState({ game: game.toJSON(), view: 'game' });
        }).catch(() => setState({ view: 'game' }));
        return;
      }
      if (preset === 'medium') {
        const settings = { rows: 16, cols: 16, mines: 40, animateMines: animate };
        setState({ settings });
        savePersistedState({ settings });
        import('../engine/Game.js').then(({ Game }) => {
          const game = new Game(settings.rows, settings.cols, settings.mines);
          setState({ game: game.toJSON(), view: 'game' });
        }).catch(() => setState({ view: 'game' }));
        return;
      }
      if (preset === 'hard') {
        const settings = { rows: 16, cols: 30, mines: 99, animateMines: animate };
        setState({ settings });
        savePersistedState({ settings });
        import('../engine/Game.js').then(({ Game }) => {
          const game = new Game(settings.rows, settings.cols, settings.mines);
          setState({ game: game.toJSON(), view: 'game' });
        }).catch(() => setState({ view: 'game' }));
        return;
      }
    }
    const newRows = Number(formData.get('rows'));
    const newCols = Number(formData.get('cols'));
    const newMines = Number(formData.get('mines'));
    const safeMines = Math.max(1, Math.min(newMines, newRows * newCols - 1));
    const settings = {
      rows: Math.max(4, Math.min(newRows, 30)),
      cols: Math.max(4, Math.min(newCols, 30)),
      mines: safeMines,
      animateMines: animate
    };
    // Save settings
    setState({ settings });
    savePersistedState({ settings });
    // Create new game and update state
    try {
      import('../engine/Game.js').then(({ Game }) => {
        const game = new Game(settings.rows, settings.cols, settings.mines);
        setState({ game: game.toJSON(), view: 'game' });
      });
    } catch (err) {
      setState({ view: 'game' });
    }
  };

  // Preset controls
  const presetFieldset = h('fieldset', { className: 'presets' },
    h('legend', {}, 'Presets'),
    h('label', {},
      h('input', {
        type: 'radio', name: 'preset', value: 'easy', checked: selectedPreset === 'easy',
        onChange: (e) => {
          selectedPreset = 'easy';
          rowsInput.value = 9; colsInput.value = 9; minesInput.value = 10;
          rowsInput.disabled = true; colsInput.disabled = true; minesInput.disabled = true;
        }
      }),
      ' Easy'
    ),
    h('label', {},
      h('input', {
        type: 'radio', name: 'preset', value: 'medium', checked: selectedPreset === 'medium',
        onChange: (e) => {
          selectedPreset = 'medium';
          rowsInput.value = 16; colsInput.value = 16; minesInput.value = 40;
          rowsInput.disabled = true; colsInput.disabled = true; minesInput.disabled = true;
        }
      }),
      ' Medium'
    ),
    h('label', {},
      h('input', {
        type: 'radio', name: 'preset', value: 'hard', checked: selectedPreset === 'hard',
        onChange: (e) => {
          selectedPreset = 'hard';
          rowsInput.value = 16; colsInput.value = 30; minesInput.value = 99;
          rowsInput.disabled = true; colsInput.disabled = true; minesInput.disabled = true;
        }
      }),
      ' Hard'
    ),
    h('label', {},
      h('input', {
        type: 'radio', name: 'preset', value: 'custom', checked: selectedPreset === 'custom',
        onChange: (e) => {
          selectedPreset = 'custom';
          rowsInput.disabled = false; colsInput.disabled = false; minesInput.disabled = false;
        }
      }),
      ' Custom'
    )
  );

  const rowsInput = h('input', { type: 'number', name: 'rows', value: rows, min: 4, max: 30 });
  const colsInput = h('input', { type: 'number', name: 'cols', value: cols, min: 4, max: 30 });
  const minesInput = h('input', { type: 'number', name: 'mines', value: mines, min: 1 });

  // Disable inputs if a preset is selected
  if (selectedPreset !== 'custom') {
    rowsInput.disabled = true; colsInput.disabled = true; minesInput.disabled = true;
  }

  const form = h('form', { onSubmit, className: 'settings-view' },
    h('h2', {}, 'Settings'),
    presetFieldset,
    h('label', {}, 'Rows:', rowsInput),
    h('br'),
    h('label', {}, 'Columns:', colsInput),
    h('br'),
    h('label', {}, 'Mines:', minesInput),
    h('br'),
    h('label', {},
      h('input', { type: 'checkbox', name: 'animateMines', checked: animateMines }),
      ' Animate mine reveal'
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
