import { Board } from './Board.js';

export class Game {
  constructor(rows, cols, mines) {
    this.rows = rows;
    this.cols = cols;
    this.mines = mines;
    this.board = new Board(rows, cols, mines);
    this.started = false;
    this.ended = false;
    this.won = false;
    this.startTime = null;
    this.endTime = null;
  }

  handleReveal(row, col) {
    if (this.ended) return;
    if (!this.started) {
      this.board.generate(row, col);
      this.started = true;
      this.startTime = Date.now();
    }
    const { exploded } = this.board.revealTile(row, col);
    if (exploded) {
      this.ended = true;
      this.won = false;
      this.endTime = Date.now();
      this._revealAllMines();
    } else if (this.board.allSafeTilesRevealed()) {
      this.ended = true;
      this.won = true;
      this.endTime = Date.now();
    }
  }

  handleFlag(row, col) {
    if (this.ended) return;
    this.board.toggleFlag(row, col);
  }

  getElapsedSeconds() {
    const end = this.endTime ?? Date.now();
    if (!this.startTime) return 0;
    return (end - this.startTime) / 1000;
  }

  _revealAllMines() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.board.tiles[r][c];
        if (t.isMine) t.isRevealed = true;
      }
    }
  }

  toJSON() {
    return {
      rows: this.rows,
      cols: this.cols,
      mines: this.mines,
      board: this.board.toJSON(),
      started: this.started,
      ended: this.ended,
      won: this.won,
      startTime: this.startTime,
      endTime: this.endTime
    };
  }

  static fromJSON(data) {
    const g = new Game(data.rows, data.cols, data.mines);
    g.board = Board.fromJSON(data.board);
    g.started = data.started;
    g.ended = data.ended;
    g.won = data.won;
    g.startTime = data.startTime;
    g.endTime = data.endTime;
    return g;
  }
}
