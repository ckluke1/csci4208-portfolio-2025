import { h, clearChildren, formatSeconds } from '../utils/dom.js';
import { getState, setState } from '../state/store.js';
import { Game } from '../engine/Game.js';
import { savePersistedState } from '../services/localStorageService.js';
import { pushHighScore } from '../services/jsonbinService.js';

let mineAnimTimer = null;
let mineAnimActive = false;
let mineAnimListener = null;

export function ensureGame() {
  const state = getState();
  if (state.game) return Game.fromJSON(state.game);
  const { rows, cols, mines } = state.settings;
  const game = new Game(rows, cols, mines);
  setState({ game: game.toJSON() });
  return game;
}

function onRestart(root) {
  cleanupMineAnimation();
  const state = getState();
  const { rows, cols, mines } = state.settings;
  const game = new Game(rows, cols, mines);
  setState({ game: game.toJSON() });
  renderGame(root);
}

export function renderGame(root) {
  clearChildren(root);
  let game = ensureGame();
  const settings = getState().settings || {};
  const animateEnabled = settings.animateMines !== false;

  const onBack = () => {
    cleanupMineAnimation();
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
    const isLight = (tile.row + tile.col) % 2 === 0;
    let classes = ['cell', isLight ? 'light' : 'dark'];
    if (tile.isRevealed) {
      classes.push('revealed');
      if (tile.isMine) {
        text = '💣';
        classes.push('mine');
        if (tile.isExploded) classes.push('exploded');
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
        game.handleReveal(tile.row, tile.col, { revealMinesImmediately: !animateEnabled });
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

  // If we lost and animation is enabled, play reveal animation; otherwise ensure mines are revealed immediately
  if (game.ended && !game.won && animateEnabled && !mineAnimActive) {
    startMineRevealAnimation(game);
  }

  // Timer loop
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

function revealAllMinesImmediate(game) {
  game.board.tiles.forEach((row) => {
    row.forEach((t) => {
      if (t.isMine) t.isRevealed = true;
    });
  });
}

function startMineRevealAnimation(game) {
  if (mineAnimActive) return;
  cleanupMineAnimation();
  const hiddenMines = [];
  for (const row of game.board.tiles) {
    for (const t of row) {
      if (t.isMine && !t.isRevealed) hiddenMines.push(t);
    }
  }
  if (hiddenMines.length === 0) return;

  const origin = game.explosionOrigin || { row: 0, col: 0 };
  hiddenMines.sort((a, b) => {
    const da = Math.abs(a.row - origin.row) + Math.abs(a.col - origin.col);
    const db = Math.abs(b.row - origin.row) + Math.abs(b.col - origin.col);
    return da - db;
  });

  mineAnimActive = true;

  const finish = () => {
    if (!mineAnimActive) return;
    if (mineAnimTimer) {
      clearTimeout(mineAnimTimer);
      mineAnimTimer = null;
    }
    hiddenMines.forEach((t) => { t.isRevealed = true; });
    setState({ game: game.toJSON() });
    cleanupMineAnimation();
  };

  const step = (index) => {
    if (!mineAnimActive) return;
    if (index >= hiddenMines.length) {
      finish();
      return;
    }
    hiddenMines[index].isRevealed = true;
    setState({ game: game.toJSON() });
    mineAnimTimer = setTimeout(() => step(index + 1), 80);
  };

  // Finish animation if user interacts during the reveal
  mineAnimListener = () => finish();
  document.addEventListener('pointerdown', mineAnimListener, true);

  step(0);
}

function cleanupMineAnimation() {
  mineAnimActive = false;
  if (mineAnimTimer) {
    clearTimeout(mineAnimTimer);
    mineAnimTimer = null;
  }
  if (mineAnimListener) {
    document.removeEventListener('pointerdown', mineAnimListener, true);
    mineAnimListener = null;
  }
}

async function maybeRecordHighScore(game) {
  const timeSeconds = game.getElapsedSeconds();
  const name = window.prompt('You won! Enter your name for the high score board:', 'Anonymous');
  // Determine category (only standard boards qualify)
  function getCategory(rows, cols, mines) {
    if (rows === 9 && cols === 9 && mines === 10) return 'easy';
    if (rows === 16 && cols === 16 && mines === 40) return 'medium';
    if (rows === 16 && cols === 30 && mines === 99) return 'hard';
    return 'custom';
  }

  const category = getCategory(game.rows, game.cols, game.mines);

  const highScore = {
    name: name || 'Anonymous',
    timeSeconds,
    rows: game.rows,
    cols: game.cols,
    mines: game.mines,
    category,
    timestamp: Date.now()
  };

  if (category === 'custom') {
    // Do not record custom boards to highscores
    window.alert('Custom board detected — high scores are only tracked for Easy/Medium/Hard.');
    return;
  }
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
