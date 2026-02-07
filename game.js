import { Chess } from "./lib/chess.mjs";

const FILES = "abcdefgh";

export class Game {
  constructor() {
    this.mode = "play"; // "play" | "review"

    this.chessLive = new Chess();
    this.chessView = new Chess(); // what renderer reads
    this._syncViewToLive();

    // UI state (play mode only)
    this.selected = null;
    this.legalTargets = [];

    // Promotion state (play mode only)
    this.pendingPromotion = null; // {from,to,color}

    // Move history (applied)
    this.history = [];    // verbose move objects returned by chess.move(...)
    this.redoStack = [];  // move objects undone

    // Snapshots (ply-indexed)
    // snapshots[0] = start position fen (before any move)
    this.snapshots = [{ ply: 0, san: null, fen: this.chessLive.fen() }];

    // Review cursor: ply index into snapshots (0..history.length)
    this.reviewPly = 0;

    // Versions
    this._uiVersion = 0;
    this._posVersion = 0;
  }

  // ----- versions -----
  getUIVersion() { return this._uiVersion; }
  getPositionVersion() { return this._posVersion; }

  // ----- mode -----
  setMode(mode) {
    this.mode = mode;
    if (mode === "play") {
      this._syncViewToLive();
    }
    this._uiVersion++;
  }

  // ----- mapping -----
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

  // ----- view helpers -----
  _syncViewToLive() {
    this.chessView.load(this.chessLive.fen());
  }

  _loadViewPly(ply) {
    const p = Math.max(0, Math.min(ply, this.history.length));
    this.reviewPly = p;
    const fen = this.snapshots[p].fen;
    this.chessView.load(fen);
    this._uiVersion++;
  }

  // ----- status / pieces read from VIEW -----
  turn() { return this.chessView.turn(); }

  fen() { return this.chessLive.fen(); }

  pieceCodeAt(x, y) {
    const sq = this.squareFromXY(x, y);
    const p = this.chessView.get(sq);
    if (!p) return null;
    return p.color + p.type;
  }

  // ----- game over (LIVE) -----
  isGameOver() {
    const c = this.chessLive;
    if (typeof c.isGameOver === "function") return c.isGameOver();
    const isMate = typeof c.isCheckmate === "function" ? c.isCheckmate() : false;
    const isStale = typeof c.isStalemate === "function" ? c.isStalemate() : false;
    const isDraw = typeof c.isDraw === "function" ? c.isDraw() : false;
    return isMate || isStale || isDraw;
  }

  // ----- status text from VIEW (so review shows correct turn/check etc) -----
  statusText() {
    const c = this.chessView;
    const t = c.turn() === "w" ? "White" : "Black";

    const inCheck = typeof c.inCheck === "function" ? c.inCheck()
                  : typeof c.isCheck === "function" ? c.isCheck()
                  : false;

    const isMate = typeof c.isCheckmate === "function" ? c.isCheckmate() : false;
    const isStalemate = typeof c.isStalemate === "function" ? c.isStalemate() : false;
    const isDraw = typeof c.isDraw === "function" ? c.isDraw() : false;

    if (this.mode === "review") {
      const tag = `Review ${this.reviewPly}/${this.history.length}`;
      if (isMate) return `Checkmate — ${tag}`;
      if (isStalemate) return `Stalemate — ${tag}`;
      if (isDraw) return `Draw — ${tag}`;
      if (inCheck) return `${t} to move — Check — ${tag}`;
      return `${t} to move — ${tag}`;
    }

    if (isMate) return "Checkmate";
    if (isStalemate) return "Stalemate";
    if (isDraw) return "Draw";
    if (inCheck) return `${t} to move — Check`;
    return `${t} to move`;
  }

  debugLine() {
    return `mode:${this.mode} ui:${this._uiVersion} pos:${this._posVersion} ply:${this.history.length} rev:${this.reviewPly}`;
  }

  // ----- selection / moves (PLAY ONLY) -----
  canSelect(x, y) {
    if (this.mode !== "play") return false;
    if (this.pendingPromotion) return false;
    if (this.isGameOver()) return false;

    const sq = this.squareFromXY(x, y);
    const p = this.chessLive.get(sq);
    if (!p) return false;
    return p.color === this.chessLive.turn();
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
    if (this.mode !== "play") return;
    if (this.pendingPromotion) return;
    if (this.isGameOver()) return;

    if (!this.canSelect(x, y)) {
      this.clearSelection();
      return;
    }

    this.selected = { x, y };

    const from = this.squareFromXY(x, y);
    const moves = this.chessLive.moves({ square: from, verbose: true });
    this.legalTargets = moves.map((m) => this.xyFromSquare(m.to));

    this._uiVersion++;
  }

  isPromotionMove(fromSq, toSq) {
    const p = this.chessLive.get(fromSq);
    if (!p) return false;
    if (p.type !== "p") return false;

    const toRank = Number(toSq[1]);
    if (p.color === "w" && toRank === 8) return true;
    if (p.color === "b" && toRank === 1) return true;
    return false;
  }

  beginPromotion(fromSq, toSq) {
    const p = this.chessLive.get(fromSq);
    if (!p) return false;
    this.pendingPromotion = { from: fromSq, to: toSq, color: p.color };
    this._uiVersion++;
    return true;
  }

  _pushSnapshot(moveObj) {
    const ply = this.history.length;
    this.snapshots.push({
      ply,
      san: moveObj?.san ?? null,
      fen: this.chessLive.fen()
    });
  }

  finishPromotion(pieceChar) {
    if (this.mode !== "play") return false;
    if (this.isGameOver()) return false;
    if (!this.pendingPromotion) return false;

    const { from, to } = this.pendingPromotion;

    const move = this.chessLive.move({ from, to, promotion: pieceChar });
    if (!move) {
      this.pendingPromotion = null;
      this._uiVersion++;
      return false;
    }

    this.history.push(move);
    this.redoStack = [];
    this._pushSnapshot(move);

    this.pendingPromotion = null;

    this._syncViewToLive();
    this._posVersion++;
    this._uiVersion++;

    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;

    return true;
  }

  tryMoveSelected(toX, toY) {
    if (this.mode !== "play") return false;
    if (this.pendingPromotion) return false;
    if (this.isGameOver()) return false;
    if (!this.selected) return false;

    const from = this.squareFromXY(this.selected.x, this.selected.y);
    const to = this.squareFromXY(toX, toY);

    if (this.isPromotionMove(from, to)) {
      this.beginPromotion(from, to);
      return true;
    }

    const move = this.chessLive.move({ from, to });
    if (!move) return false;

    this.history.push(move);
    this.redoStack = [];
    this._pushSnapshot(move);

    this._syncViewToLive();
    this._posVersion++;
    this._uiVersion++;

    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;

    return true;
  }

  // ----- undo/redo/reset (PLAY ONLY) -----
  undo() {
    if (this.mode !== "play") return false;

    if (this.pendingPromotion) this.pendingPromotion = null;
    this.selected = null;
    this.legalTargets = [];

    const m = this.chessLive.undo();
    if (!m) return false;

    // Pop history snapshot
    this.history.pop();
    this.snapshots.pop();

    this.redoStack.push(m);

    this._syncViewToLive();
    this._posVersion++;
    this._uiVersion++;

    return true;
  }

  redo() {
    if (this.mode !== "play") return false;

    if (this.pendingPromotion) this.pendingPromotion = null;
    this.selected = null;
    this.legalTargets = [];

    const m = this.redoStack.pop();
    if (!m) return false;

    const move = this.chessLive.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (!move) {
      this._uiVersion++;
      return false;
    }

    this.history.push(move);
    this._pushSnapshot(move);

    this._syncViewToLive();
    this._posVersion++;
    this._uiVersion++;

    return true;
  }

  reset() {
    this.chessLive.reset();
    this._syncViewToLive();

    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;

    this.history = [];
    this.redoStack = [];

    this.snapshots = [{ ply: 0, san: null, fen: this.chessLive.fen() }];
    this.reviewPly = 0;

    this._posVersion++;
    this._uiVersion++;
  }

  // ----- review mode API -----
  enterReviewAtEnd() {
    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;

    this.mode = "review";
    this._loadViewPly(this.history.length);
  }

  gotoReviewPly(ply) {
    if (this.mode !== "review") return;
    this._loadViewPly(ply);
  }

  exitReviewCancel() {
    this.mode = "play";
    this._syncViewToLive();
    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;
    this._uiVersion++;
  }

  playFromHere() {
    if (this.mode !== "review") return false;

    const targetPly = Math.max(0, Math.min(this.reviewPly, this.history.length));

    // Rebuild live game up to targetPly
    const keptMoves = this.history.slice(0, targetPly);

    this.chessLive.reset();
    for (const m of keptMoves) {
      this.chessLive.move({ from: m.from, to: m.to, promotion: m.promotion });
    }

    this.history = keptMoves;
    this.redoStack = [];

    // Rebuild snapshots
    this.snapshots = [{ ply: 0, san: null, fen: this.chessLive.fen() }];
    // snapshots need to reflect each move applied
    // easiest: replay from start again, capturing fen + san each ply
    const tmp = new Chess();
    tmp.reset();
    this.snapshots = [{ ply: 0, san: null, fen: tmp.fen() }];
    let ply = 0;
    for (const m of keptMoves) {
      const mm = tmp.move({ from: m.from, to: m.to, promotion: m.promotion });
      ply++;
      this.snapshots.push({ ply, san: mm?.san ?? null, fen: tmp.fen() });
    }

    this.mode = "play";
    this.reviewPly = ply;

    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;

    this._syncViewToLive();
    this._posVersion++;
    this._uiVersion++;

    return true;
  }

  // ----- move table rows for drawer -----
  getMoveRows() {
    // history is ply-indexed (1..N). snapshots[ply] corresponds to fen after ply.
    // Build rows: moveNo 1..ceil(N/2) with white ply=2n-1, black ply=2n
    const N = this.history.length;
    const rows = [];

    let moveNo = 1;
    for (let i = 1; i <= N; i += 2) {
      const w = this.history[i - 1];
      const b = (i + 1 <= N) ? this.history[i] : null;

      rows.push({
        moveNo,
        white: w ? { san: w.san, ply: i } : null,
        black: b ? { san: b.san, ply: i + 1 } : null
      });

      moveNo++;
    }

    return rows;
  }
}
