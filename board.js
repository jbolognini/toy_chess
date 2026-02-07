// board.js
export class Board {
  constructor() {
    this.size = 8;
    this._version = 0;

    // Map squares to piece codes: "wp","wn","wb","wr","wq","wk","bp",...
    // Coords: x=file 0..7 (a..h), y=rank 0..7 (top..bottom or your choice)
    this.pieces = new Map();

    // Toy starting position (a few pieces only)
    this.setPiece(1, 7, "wn"); // b1
    this.setPiece(2, 7, "wb"); // c1
    this.setPiece(4, 7, "wk"); // e1
    this.setPiece(3, 0, "bk"); // d8
    this.setPiece(1, 0, "bn"); // b8

    this.selected = null; // {x,y} or null
    this.legalTargets = []; // array of {x,y} for UI highlight
  }

  key(x, y) { return `${x},${y}`; }

  getVersion() { return this._version; }

  getPiece(x, y) {
    return this.pieces.get(this.key(x, y)) || null;
  }

  setPiece(x, y, code) {
    this.pieces.set(this.key(x, y), code);
    this._version++;
  }

  clearSquare(x, y) {
    const k = this.key(x, y);
    if (this.pieces.has(k)) {
      this.pieces.delete(k);
      this._version++;
    }
  }

  movePiece(fromX, fromY, toX, toY) {
    const p = this.getPiece(fromX, fromY);
    if (!p) return;
    this.clearSquare(toX, toY); // capture
    this.clearSquare(fromX, fromY);
    this.setPiece(toX, toY, p);
  }

  // Toy: compute “legal” moves for UI only (start with knight)
  computeLegalTargets(x, y) {
    const p = this.getPiece(x, y);
    if (!p) return [];

    // only implement knight for now
    if (p.endsWith("n")) {
      const deltas = [
        [1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]
      ];
      const out = [];
      for (const [dx, dy] of deltas) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
        out.push({x:nx, y:ny});
      }
      return out;
    }
    return [];
  }

  selectSquare(x, y) {
    const p = this.getPiece(x, y);
    if (!p) {
      this.selected = null;
      this.legalTargets = [];
      this._version++;
      return;
    }
    this.selected = {x, y};
    this.legalTargets = this.computeLegalTargets(x, y);
    this._version++;
  }

  tryMoveSelected(toX, toY) {
    if (!this.selected) return false;
    const ok = this.legalTargets.some(t => t.x === toX && t.y === toY);
    if (!ok) return false;
    this.movePiece(this.selected.x, this.selected.y, toX, toY);
    this.selected = null;
    this.legalTargets = [];
    this._version++;
    return true;
  }
}
