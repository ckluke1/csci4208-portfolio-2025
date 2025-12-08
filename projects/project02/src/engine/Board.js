import { Tile } from './Tile.js';

export class Board {
  constructor(rows, cols, mines) {
    this.rows = rows;
    this.cols = cols;
    this.mines = mines;
    this.tiles = [];
    this._initEmpty();
  }

  _initEmpty() {
    this.tiles = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(new Tile(r, c));
      }
      this.tiles.push(row);
    }
  }

  generate(firstClickRow, firstClickCol) {
    // Place mines but avoid the first clicked tile
    const allPositions = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (r === firstClickRow && c === firstClickCol) continue;
        allPositions.push([r, c]);
      }
    }
    shuffleArray(allPositions);
    const minePositions = allPositions.slice(0, this.mines);
    for (const [r, c] of minePositions) {
      this.tiles[r][c].isMine = true;
    }
    // Compute adjacency
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.tiles[r][c].adjacentMines = this.countAdjacentMines(r, c);
      }
    }
  }

  countAdjacentMines(row, col) {
    let count = 0;
    this.forEachNeighbor(row, col, (t) => {
      if (t.isMine) count++;
    });
    return count;
  }

  forEachNeighbor(row, col, fn) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
        fn(this.tiles[nr][nc]);
      }
    }
  }

  revealTile(row, col) {
    const tile = this.tiles[row][col];
    if (!tile.reveal()) return { exploded: false, autoRevealed: 0 };
    let exploded = tile.isMine;
    let autoRevealed = 1;
    if (!exploded && tile.adjacentMines === 0) {
      // flood fill
      const queue = [[row, col]];
      const visited = new Set([`${row},${col}`]);
      while (queue.length) {
        const [r, c] = queue.shift();
        this.forEachNeighbor(r, c, (n) => {
          const key = `${n.row},${n.col}`;
          if (visited.has(key)) return;
          visited.add(key);
          if (!n.isRevealed && !n.isFlagged) {
            n.isRevealed = true;
            autoRevealed++;
            if (!n.isMine && n.adjacentMines === 0) {
              queue.push([n.row, n.col]);
            }
          }
        });
      }
    }
    return { exploded, autoRevealed };
  }

  toggleFlag(row, col) {
    this.tiles[row][col].toggleFlag();
  }

  allSafeTilesRevealed() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.tiles[r][c];
        if (!t.isMine && !t.isRevealed) return false;
      }
    }
    return true;
  }

  toJSON() {
    return {
      rows: this.rows,
      cols: this.cols,
      mines: this.mines,
      tiles: this.tiles.map((row) => row.map((t) => t.toJSON()))
    };
  }

  static fromJSON(data) {
    const b = new Board(data.rows, data.cols, data.mines);
    b.tiles = data.tiles.map((row) => row.map(Tile.fromJSON));
    return b;
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
