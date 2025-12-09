export class Tile {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.isMine = false;
    this.isRevealed = false;
    this.isFlagged = false;
    this.adjacentMines = 0;
    this.isExploded = false;
  }

  reveal() {
    if (this.isFlagged) return false;
    if (this.isRevealed) return false;
    this.isRevealed = true;
    return true;
  }

  toggleFlag() {
    if (this.isRevealed) return;
    this.isFlagged = !this.isFlagged;
  }

  toJSON() {
    return {
      row: this.row,
      col: this.col,
      isMine: this.isMine,
      isRevealed: this.isRevealed,
      isFlagged: this.isFlagged,
      adjacentMines: this.adjacentMines,
      isExploded: this.isExploded
    };
  }

  static fromJSON(data) {
    const t = new Tile(data.row, data.col);
    t.isMine = data.isMine;
    t.isRevealed = data.isRevealed;
    t.isFlagged = data.isFlagged;
    t.adjacentMines = data.adjacentMines;
    t.isExploded = data.isExploded || false;
    return t;
  }
}
