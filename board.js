// board.js
export class Board {
  constructor() {
    this.size = 8;

    // Versions
    this._uiVersion = 0;      // selection / highlights
    this._posVersion = 0;     // actual position changes

    // Piece map: "x,y" -> code (e.g. "wn")
    this.pieces = new Map();

    // Initial toy position
    this.setPiece(1, 7, "wn"); // b1
    this.setPiece(2, 7, "wb"); // c1
    this.setPiece(4, 7, "wk"); // e1
    this.setPiece(1, 0, "bn"); // b8
    this.setPiece(3, 0, "bk"); // d8

    this.selected = null;        // {x,y} or null
    this.legalTargets = [];     // [{x,y}, ...]
  }

  key(x, y) {
    return `${x},${y}`;
  }

  // --- Version accessors ---
  getUIVersion() {
    return this._uiVersion;
  }

  getPositionVersion() {
    return this._posVersion;
  }

  // --- Piece helpers ---
  getPiece(x, y) {
    return this.pieces.get(this.key(x, y)) || null;
  }

  setPiece(x, y, code) {
    this.pieces.set(this.key(x, y), code);
    this._posVersion++;
    this._uiVersion++;
  }

  clearSquare(x, y) {
    const k = this.key(x, y);
    if (this.pieces.has(k)) {
      this.pieces.delete(k);
      this._posVersion++;
      this._uiVersion++;
    }
  }

  movePiece(fromX, fromY, toX, toY) {
    const p = this.getPiece(fromX, fromY);
    if (!p) return;

    this.clearSquare(toX, toY);        // capture
    this.pieces.delete(this.key(fromX, fromY));
    this.pieces.set(this.key(toX, toY), p);

    this._posVersion++;
    this._uiVersion++;
  }

  // --- Toy legal moves (knight only for now) ---
  computeLegalTargets(x, y) {
    const p = this.getPiece(x, y);
    if (!p) return [];

    if (p.endsWith("n")) {
      const deltas = [
        [1, 2], [2, 1], [-1, 2], [-2, 1],
        [1, -2], [2, -1], [-1, -2], [-2, -1]
      ];
      const out = [];
      for (const [dx, dy] of deltas) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
        out.push({ x: nx, y: ny });
      }
      return out;
    }
    return [];
  }

  // --- UI interactions ---
  selectSquare(x, y) {
    const p = this.getPiece(x, y);
    if (!p) {
      this.selected = null;
      this.legalTargets = [];
      this._uiVersion++;
      return;
    }

    this.selected = { x, y };
    this.legalTargets = this.computeLegalTargets(x, y);
    this._uiVersion++;
  }

  tryMoveSelected(toX, toY) {
    if (!this.selected) return false;

    const ok = this.legalTargets.some(
      (t) => t.x === toX && t.y === toY
    );
    if (!ok) return false;

    this.movePiece(this.selected.x, this.selected.y, toX, toY);
    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;
    return true;
  }
}
