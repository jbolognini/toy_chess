// board.js
export class Board {
  constructor() {
    this.size = 8;
    this.piece = { x: 3, y: 3 };
    this._version = 0;
  }

  movePiece(x, y) {
    const nx = Math.max(0, Math.min(7, x));
    const ny = Math.max(0, Math.min(7, y));

    if (nx === this.piece.x && ny === this.piece.y) return;

    this.piece.x = nx;
    this.piece.y = ny;
    this._version++;
  }

  getVersion() {
    return this._version;
  }
}
