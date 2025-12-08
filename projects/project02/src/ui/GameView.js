import { h, clearChildren, formatSeconds } from '../utils/dom.js';
import { getState, setState } from '../state/store.js';
import { Game } from '../engine/Game.js';
import { savePersistedState } from '../services/localStorageService.js';
import { pushHighScore } from '../services/jsonbinService.js';

export function ensureGame() {
  const state = getState();
  if (state.game) return Game.fromJSON(state.game);
  const { rows, cols, mines } = state.settings;
  const game = new Game(rows, cols, mines);
  setState({ game: game.toJSON() });
  return game;
}

function onRestart(root) {
  const state = getState();
  const { rows, cols, mines } = state.settings;
  const game = new Game(rows, cols, mines);
  setState({ game: game.toJSON() });
  renderGame(root);
}

export function renderGame(root) {
  clearChildren(root);
  let game = ensureGame();

  const onBack = () => {
    setState({ view: 'home' });
  };

  const header = h('div', { className: 'game-header' },
    h('button', { onClick: onBack }, 'Back'),
    h('button', { onClick: () => onRestart(root) }, 'Restart'),
    h('div', { className: 'game-stats' },
      h('span', {}, `Size: ${game.rows}x${game.cols}`),
      h('span', {}, `Mines: ${game.mines}`),
      h('span', { id: 'timer' }, `Time: ${formatSeconds(game.getElapsedSeconds())}`)
    )
  );

  const grid = h('div', {
    className: 'game-grid',
    style: `grid-template-columns: repeat(${game.cols}, 1fr);`
  });

  const updateTimer = () => {
    const timerEl = root.querySelector('#timer');
    if (!timerEl) return;
    timerEl.textContent = `Time: ${formatSeconds(game.getElapsedSeconds())}`;
  };

  const renderCell = (tile) => {
    let text = '';
    let classes = ['cell'];
    if (tile.isRevealed) {
      classes.push('revealed');
      if (tile.isMine) {
        text = '💣';
        classes.push('mine');
      } else if (tile.adjacentMines > 0) {
        text = String(tile.adjacentMines);
        classes.push(`n${tile.adjacentMines}`);
      }
    } else if (tile.isFlagged) {
      text = '🚩';
      classes.push('flagged');
    }

    const onClick = (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        game.handleFlag(tile.row, tile.col);
      } else {
        game.handleReveal(tile.row, tile.col);
      }
      persistGame(game);
      afterMove(game);
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      game.handleFlag(tile.row, tile.col);
      persistGame(game);
      afterMove(game);
    };

    return h('button', {
      className: classes.join(' '),
      onClick,
      onContextMenu,
      dataset: { row: tile.row, col: tile.col }
    }, text);
  };

  const afterMove = (g) => {
    setState({ game: g.toJSON() });
    renderGame(root);
    if (g.ended && g.won) {
      maybeRecordHighScore(g);
    }
  };

  game.board.tiles.forEach((row) => {
    row.forEach((tile) => {
      grid.appendChild(renderCell(tile));
    });
  });

  const footer = h('p', {}, 'Left click to reveal, right click to flag.');

  const container = h('div', { className: 'game-view' }, header, grid, footer);
  root.appendChild(container);

  // Timer update loop
  if (!game.ended && game.started) {
    const timerId = setInterval(() => {
      const currentState = getState();
      if (!currentState.game) {
        clearInterval(timerId);
        return;
      }
      const g = Game.fromJSON(currentState.game);
      if (g.ended) {
        clearInterval(timerId);
      } else {
        updateTimer();
      }
    }, 500);
  } else {
    updateTimer();
  }
}

function persistGame(game) {
  savePersistedState({ game: game.toJSON() });
}

async function maybeRecordHighScore(game) {
  const timeSeconds = game.getElapsedSeconds();
  const name = window.prompt('You won! Enter your name for the high score board:', 'Anonymous');
  const highScore = {
    name: name || 'Anonymous',
    timeSeconds,
    rows: game.rows,
    cols: game.cols,
    mines: game.mines,
    timestamp: Date.now()
  };
  // Save locally
  try {
    const existing = JSON.parse(localStorage.getItem('minesweeper-local-highscores') || '[]');
    existing.push(highScore);
    existing.sort((a, b) => a.timeSeconds - b.timeSeconds);
    localStorage.setItem('minesweeper-local-highscores', JSON.stringify(existing.slice(0, 20)));
  } catch (err) {
    console.warn('Failed to persist local highscores', err);
  }
  // Try JSONBin (ignore errors to keep UX smooth)
  try {
    await pushHighScore(highScore);
  } catch (err) {
    console.warn('Failed to push high score to JSONBin', err);
  }
}
