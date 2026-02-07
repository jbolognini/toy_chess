import { Chess } from "./lib/chess.mjs";

const FILES = "abcdefgh";

export class Game {
  constructor() {
    this.chess = new Chess();

    // UI state
    this.selected = null;       // {x,y} or null
    this.legalTargets = [];     // [{x,y}, ...]

    // Promotion UI state: { from:"e7", to:"e8", color:"w"|"b" } or null
    this.pendingPromotion = null;

    // History
    this.history = [];
    this.redoStack = [];

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
    return this.chess.turn();
  }

  fen() {
    return this.chess.fen();
  }

  pieceCodeAt(x, y) {
    const sq = this.squareFromXY(x, y);
    const p = this.chess.get(sq);
    if (!p) return null;
    return p.color + p.type;
  }

  // --- game over detection ---
  isGameOver() {
    if (typeof this.chess.isGameOver === "function") return this.chess.isGameOver();

    // Fallback if older build
    const isMate = typeof this.chess.isCheckmate === "function" ? this.chess.isCheckmate() : false;
    const isStale = typeof this.chess.isStalemate === "function" ? this.chess.isStalemate() : false;
    const isDraw = typeof this.chess.isDraw === "function" ? this.chess.isDraw() : false;
    return isMate || isStale || isDraw;
  }

  _enforceGameOverUI() {
    if (!this.isGameOver()) return;
    let changed = false;

    if (this.pendingPromotion) {
      this.pendingPromotion = null;
      changed = true;
    }
    if (this.selected || (this.legalTargets && this.legalTargets.length)) {
      this.selected = null;
      this.legalTargets = [];
      changed = true;
    }
    if (changed) this._uiVersion++;
  }

  // --- status line ---
  statusText() {
    const t = this.turn() === "w" ? "White" : "Black";

    const inCheck = typeof this.chess.inCheck === "function" ? this.chess.inCheck()
                  : typeof this.chess.isCheck === "function" ? this.chess.isCheck()
                  : false;

    const isMate = typeof this.chess.isCheckmate === "function" ? this.chess.isCheckmate() : false;
    const isStalemate = typeof this.chess.isStalemate === "function" ? this.chess.isStalemate() : false;
    const isDraw = typeof this.chess.isDraw === "function" ? this.chess.isDraw() : false;

    if (isMate) return "Checkmate";
    if (isStalemate) return "Stalemate";
    if (isDraw) return "Draw";
    if (inCheck) return `${t} to move — Check`;
    return `${t} to move`;
  }

  // --- selection / move list ---
  canSelect(x, y) {
    if (this.pendingPromotion) return false;
    if (this.isGameOver()) return false;

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

  selectSquare(x, y) {
    if (this.pendingPromotion) return;
    if (this.isGameOver()) {
      this._enforceGameOverUI();
      return;
    }

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

  // --- promotion helpers ---
  isPromotionMove(fromSq, toSq) {
    const p = this.chess.get(fromSq);
    if (!p) return false;
    if (p.type !== "p") return false;

    const toRank = Number(toSq[1]);
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
    if (this.isGameOver()) {
      this._enforceGameOverUI();
      return false;
    }
    if (!this.pendingPromotion) return false;

    const { from, to } = this.pendingPromotion;

    const move = this.chess.move({ from, to, promotion: pieceChar });
    if (!move) {
      this.pendingPromotion = null;
      this._uiVersion++;
      return false;
    }

    this.history.push(move);
    this.redoStack = [];

    this.pendingPromotion = null;

    this._posVersion++;
    this._uiVersion++;

    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;

    this._enforceGameOverUI();
    return true;
  }

  // --- move ---
  tryMoveSelected(toX, toY) {
    if (this.pendingPromotion) return false;
    if (this.isGameOver()) {
      this._enforceGameOverUI();
      return false;
    }
    if (!this.selected) return false;

    const from = this.squareFromXY(this.selected.x, this.selected.y);
    const to = this.squareFromXY(toX, toY);

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

    this._enforceGameOverUI();
    return true;
  }

  // --- undo/redo/reset ---
  undo() {
    if (this.pendingPromotion) this.pendingPromotion = null;
    this.selected = null;
    this.legalTargets = [];

    const m = this.chess.undo();
    if (!m) return false;

    this.redoStack.push(m);

    this._posVersion++;
    this._uiVersion++;

    this._enforceGameOverUI();
    return true;
  }

  redo() {
    if (this.pendingPromotion) this.pendingPromotion = null;
    this.selected = null;
    this.legalTargets = [];

    const m = this.redoStack.pop();
    if (!m) return false;

    const move = this.chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (!move) {
      this._uiVersion++;
      return false;
    }

    this.history.push(move);

    this._posVersion++;
    this._uiVersion++;

    this._enforceGameOverUI();
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
