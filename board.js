export class Board {
  constructor() {
    this.size = 8;
    this.piece = { x: 3, y: 3 }; // single test piece
  }

  movePiece(x, y) {
    this.piece.x = Math.max(0, Math.min(7, x));
    this.piece.y = Math.max(0, Math.min(7, y));
  }
}
