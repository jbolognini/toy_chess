import { Chess } from "./lib/chess.mjs";

const FILES = "abcdefgh";

export class Game {
  constructor() {
    this.chess = new Chess();

    // UI state
    this.selected = null;       // {x,y} or null
    this.legalTargets = [];     // [{x,y}, ...]

    // Promotion UI state
    // { from:"e7", to:"e8", color:"w"|"b" } or null
    this.pendingPromotion = null;

    // History
    this.history = [];          // applied moves (verbose move objects)
    this.redoStack = [];        // moves undone (to be reapplied)

    // Versions
    this._uiVersion = 0;
    this._posVersion = 0;
  }

  // --- versions ---
  getUIVersion() { return this._uiVersion; }
  getPositionVersion() { return this._posVersion; }

  // --- coordinate mapping: x=0..7, y=0..7 with y=0 at top ---
  squareFromXY(x, y) {
    const file = FILES[x];
    const rank = String(8 - y);
    return file + rank;
  }

  xyFromSquare(sq) {
    const file = sq[0];
    const rank = Number(sq[1]);
    const x = FILES.indexOf(file);
    const y = 8 - rank;
    return { x, y };
  }

  // --- derived state for renderer ---
  turn() {
    return this.chess.turn(); // "w" or "b"
  }

  fen() {
    return this.chess.fen();
  }

  /**
   * Return sprite code like "wn", "bp", etc or null.
   */
  pieceCodeAt(x, y) {
    const sq = this.squareFromXY(x, y);
    const p = this.chess.get(sq);
    if (!p) return null;
    return p.color + p.type; // e.g. "wp"
  }

  canSelect(x, y) {
    if (this.pendingPromotion) return false;
    const sq = this.squareFromXY(x, y);
    const p = this.chess.get(sq);
    if (!p) return false;
    return p.color === this.turn();
  }

  clearSelection() {
    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;
  }

  clearPromotion() {
    this.pendingPromotion = null;
    this._uiVersion++;
  }

  // --- status line ---
  statusText() {
    // chess.js v1 has these methods; use defensive checks anyway
    const t = this.turn() === "w" ? "White" : "Black";

    const inCheck = typeof this.chess.inCheck === "function" ? this.chess.inCheck()
                  : typeof this.chess.isCheck === "function" ? this.chess.isCheck()
                  : false;

    const isMate = typeof this.chess.isCheckmate === "function" ? this.chess.isCheckmate()
                  : false;

    const isStalemate = typeof this.chess.isStalemate === "function" ? this.chess.isStalemate()
                     : false;

    const isDraw = typeof this.chess.isDraw === "function" ? this.chess.isDraw()
                 : false;

    if (isMate) return "Checkmate";
    if (isStalemate) return "Stalemate";
    if (isDraw) return "Draw";
    if (inCheck) return `${t} to move — Check`;
    return `${t} to move`;
  }

  // --- selection / move list ---
  selectSquare(x, y) {
    if (this.pendingPromotion) return;

    if (!this.canSelect(x, y)) {
      this.clearSelection();
      return;
    }

    this.selected = { x, y };

    const from = this.squareFromXY(x, y);
    const moves = this.chess.moves({ square: from, verbose: true });

    this.legalTargets = moves.map((m) => this.xyFromSquare(m.to));
    this._uiVersion++;
  }

  isPromotionMove(fromSq, toSq) {
    const p = this.chess.get(fromSq);
    if (!p) return false;
    if (p.type !== "p") return false;

    const toRank = Number(toSq[1]); // '8' or '1'
    if (p.color === "w" && toRank === 8) return true;
    if (p.color === "b" && toRank === 1) return true;
    return false;
  }

  beginPromotion(fromSq, toSq) {
    const p = this.chess.get(fromSq);
    if (!p) return false;
    this.pendingPromotion = { from: fromSq, to: toSq, color: p.color };
    this._uiVersion++;
    return true;
  }

  finishPromotion(pieceChar) {
    // pieceChar: "q"|"r"|"b"|"n"
    if (!this.pendingPromotion) return false;

    const { from, to } = this.pendingPromotion;

    const move = this.chess.move({ from, to, promotion: pieceChar });
    if (!move) {
      // If it fails, just cancel promotion UI (keeps app usable)
      this.pendingPromotion = null;
      this._uiVersion++;
      return false;
    }

    // record history + clear redo
    this.history.push(move);
    this.redoStack = [];

    this.pendingPromotion = null;

    // versions
    this._posVersion++;
    this._uiVersion++;

    // clear selection after move
    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;

    return true;
  }

  /**
   * Attempt to move currently-selected piece to (toX,toY).
   * Returns true if a move was made (or promotion UI was opened).
   */
  tryMoveSelected(toX, toY) {
    if (this.pendingPromotion) return false;
    if (!this.selected) return false;

    const from = this.squareFromXY(this.selected.x, this.selected.y);
    const to = this.squareFromXY(toX, toY);

    // If it's a promotion, open UI instead of forcing queen
    if (this.isPromotionMove(from, to)) {
      this.beginPromotion(from, to);
      return true; // consumed tap
    }

    const move = this.chess.move({ from, to });
    if (!move) return false;

    this.history.push(move);
    this.redoStack = [];

    this._posVersion++;
    this._uiVersion++;

    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;

    return true;
  }

  // --- undo/redo/reset ---
  undo() {
    if (this.pendingPromotion) this.clearPromotion();
    this.clearSelection();

    const m = this.chess.undo();
    if (!m) return false;

    // push onto redo stack
    this.redoStack.push(m);

    this._posVersion++;
    this._uiVersion++;

    return true;
  }

  redo() {
    if (this.pendingPromotion) this.clearPromotion();
    this.clearSelection();

    const m = this.redoStack.pop();
    if (!m) return false;

    // Re-apply using minimal move object
    // m has {from,to,promotion?, ...}
    const move = this.chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (!move) {
      // If redo fails (shouldn't), drop it
      this._uiVersion++;
      return false;
    }

    this.history.push(move);

    this._posVersion++;
    this._uiVersion++;

    return true;
  }

  reset() {
    this.chess.reset();

    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;

    this.history = [];
    this.redoStack = [];

    this._posVersion++;
    this._uiVersion++;
  }
}
