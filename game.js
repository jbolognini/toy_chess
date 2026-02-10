// game.js

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
    this.lastMove = null; // { from:{x,y}, to:{x,y} } or null
    
    // Captured material (derived from history up to displayed ply)
    // Stored as piece codes like "bp", "wn" etc. (captured piece, not capturer)
    this.capturedByWhite = []; // white captured black pieces (e.g., "bp","bq")
    this.capturedByBlack = []; // black captured white pieces (e.g., "wp","wn")

    // Material advantage text: only one side shows +V, other shows "", equal shows ""
    this.materialPlusWhite = ""; // e.g. "+3" or ""
    this.materialPlusBlack = ""; // e.g. "+2" or ""

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

    // Async opening suggestion mailbox/state.
    this._openingMailbox = [];
    this._openingByFen = new Map();
    this.openingSuggestion = null;
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
    this.updateDerivedAfterViewChange();
  }

  updateDerivedAfterViewChange() {
    // Determine displayed ply
    const ply = (this.mode === "review") ? this.reviewPly : this.history.length;

    // lastMove should be the move that led to this ply
    if (ply <= 0) {
      this.lastMove = null;
    } else {
      const m = this.moveAtPly(ply - 1);
      this.lastMove = m ? { from: { x: m.fromX, y: m.fromY }, to: { x: m.toX, y: m.toY } } : null;
    }

    // Captures/material are derived from history slice [0..ply)
    this._rebuildCapturedFromHistory(ply);

    // Any other derived UI state can be refreshed here later
    const forFen = this._openingByFen.get(this.viewFen()) || null;
    if (forFen !== this.openingSuggestion) {
      this.openingSuggestion = forFen;
      this._uiVersion++;
    }
  }
  
  // ----- status / pieces read from VIEW -----
  turn() { return this.chessView.turn(); }

  fen() { return this.chessLive.fen(); }

  viewFen() {
    return this.chessView.fen();
  }

  pieceCodeAt(x, y) {
    const sq = this.squareFromXY(x, y);
    const p = this.chessView.get(sq);
    if (!p) return null;
    return p.color + p.type;
  }
  
  getCurrentPly() {
    return this.history.length;
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
    const opening = this.openingDebugLine();
    return `mode:${this.mode} ui:${this._uiVersion} pos:${this._posVersion} ply:${this.history.length} rev:${this.reviewPly} ${opening}`;
  }

  openingDebugLine() {
    const o = this.openingSuggestion;
    if (!o) return "openings:pending";

    if (o.status === "rate_limited") {
      const sec = Math.max(0, Math.ceil((o.retryAtMs - Date.now()) / 1000));
      return `openings:rate-limit (${sec}s)`;
    }
    if (o.status !== "ok") {
      return `openings:${o.status}`;
    }

    if (!o.suggestions || o.suggestions.length === 0) {
      return "openings:none";
    }

    const top = o.suggestions
      .slice(0, 3)
      .map((m) => m.san || m.uci || "?")
      .join(",");
    return `openings:${top}${o.cached ? " (cached)" : ""}`;
  }

  enqueueOpeningUpdate(update) {
    if (!update || !update.fen) return;
    this._openingMailbox.push(update);
  }

  processAsyncUpdates() {
    if (this._openingMailbox.length === 0) return false;

    let touched = false;
    while (this._openingMailbox.length > 0) {
      const update = this._openingMailbox.shift();
      this._openingByFen.set(update.fen, update);
      touched = true;
    }

    const visible = this.viewFen();
    const next = this._openingByFen.get(visible) || null;
    if (next !== this.openingSuggestion) {
      this.openingSuggestion = next;
      touched = true;
    }

    if (touched) this._uiVersion++;
    return touched;
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
    this.updateDerivedAfterViewChange();
    
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
    
    this.updateDerivedAfterViewChange()

    return true;
  }

  moveAtPly(plyIndex) {
    if (plyIndex < 0 || plyIndex >= this.history.length) return null;

    const m = this.history[plyIndex];
    if (!m || !m.from || !m.to) return null;

    const f = this.xyFromSquare(m.from);
    const t = this.xyFromSquare(m.to);

    return {
      fromX: f.x,
      fromY: f.y,
      toX: t.x,
      toY: t.y,
      promotion: m.promotion || null
    };
  }

  // ============================================================
  // Captured material + material advantage (derived)
  // ============================================================

  _rebuildCapturedFromHistory(ply) {
    const p = Math.max(0, Math.min(ply, this.history.length));

    this.capturedByWhite = [];
    this.capturedByBlack = [];

    // Rebuild captures from move list up to ply
    for (let i = 0; i < p; i++) {
      const m = this.history[i];
      if (!m) continue;

      // chess.js verbose moves usually include:
      // - m.color: "w"|"b" (side that moved)
      // - m.captured: "p"|"n"|"b"|"r"|"q" when capture occurred
      const mover = m.color;          // capturer
      const capType = m.captured;     // captured piece type (lowercase)

      if (!capType || (capType !== "p" && capType !== "n" && capType !== "b" && capType !== "r" && capType !== "q")) {
        continue;
      }

      // Captured piece color is the opponent of mover
      if (mover === "w") {
        this.capturedByWhite.push("b" + capType);
      } else if (mover === "b") {
        this.capturedByBlack.push("w" + capType);
      }
    }

    // Material advantage text (single-side, positive only)
    const adv = this._computeMaterialAdvantage(this.capturedByWhite, this.capturedByBlack);
    if (adv > 0) {
      this.materialPlusWhite = `+${adv}`;
      this.materialPlusBlack = "";
    } else if (adv < 0) {
      this.materialPlusWhite = "";
      this.materialPlusBlack = `+${Math.abs(adv)}`;
    } else {
      this.materialPlusWhite = "";
      this.materialPlusBlack = "";
    }
  }

  _computeMaterialAdvantage(capturedByWhite, capturedByBlack) {
    // capturedByWhite are black pieces white took
    // capturedByBlack are white pieces black took
    // Advantage is remaining material (ignoring kings), computed via net capture differential.
    const values = { q: 9, r: 5, b: 3, n: 3, p: 1 };

    const wCounts = this._countCapturedTypes(capturedByWhite); // by type of captured piece (q,r,b,n,p)
    const bCounts = this._countCapturedTypes(capturedByBlack);

    // Net = whiteCaptured - blackCaptured per type
    let whiteAdv = 0;
    for (const t of ["q", "r", "b", "n", "p"]) {
      const net = (wCounts[t] || 0) - (bCounts[t] || 0);
      whiteAdv += net * values[t];
    }
    // Positive => White is up material, negative => Black up
    return whiteAdv;
  }

  _countCapturedTypes(capturedList) {
    const out = { q: 0, r: 0, b: 0, n: 0, p: 0 };
    for (const code of capturedList || []) {
      // code looks like "bq" or "wp"
      const t = code[1];
      if (t in out) out[t]++;
    }
    return out;
  }

  getCapturedByWhite() { return this.capturedByWhite; }
  getCapturedByBlack() { return this.capturedByBlack; }

  // Grouped list for display: value-desc, pawns last (Q R B N P)
  // Returns array of codes like ["bq","br","br","bp",...]
  getCapturedGrouped(capturerColor /* "w"|"b" */) {
    const list = (capturerColor === "w") ? this.capturedByWhite
               : (capturerColor === "b") ? this.capturedByBlack
               : [];

    const counts = this._countCapturedTypes(list);
    const victimColor = (capturerColor === "w") ? "b" : "w";

    const order = ["q", "r", "b", "n", "p"];
    const out = [];
    for (const t of order) {
      const n = counts[t] || 0;
      for (let i = 0; i < n; i++) out.push(victimColor + t);
    }
    return out;
  }

  // Differential grouped list (fallback mode):
  // Cancels equal types and returns only the remainder for each side.
  // Returns { white: [codes...], black: [codes...] } where arrays are grouped Q R B N P.
  getCapturedDifferentialGrouped() {
    const wCounts = this._countCapturedTypes(this.capturedByWhite);
    const bCounts = this._countCapturedTypes(this.capturedByBlack);

    const order = ["q", "r", "b", "n", "p"];
    const wOut = [];
    const bOut = [];

    for (const t of order) {
      const net = (wCounts[t] || 0) - (bCounts[t] || 0);
      if (net > 0) {
        for (let i = 0; i < net; i++) wOut.push("b" + t); // white is ahead: show black pieces captured extra
      } else if (net < 0) {
        for (let i = 0; i < -net; i++) bOut.push("w" + t); // black is ahead: show white pieces captured extra
      }
    }

    return { white: wOut, black: bOut };
  }

  // Convenience: which capturer is "bottom" given flipped?
  // flipped=false => bottom is White, flipped=true => bottom is Black
  getBottomCapturerColor() {
    return (this.flipped === true) ? "b" : "w";
  }

  getTopCapturerColor() {
    return (this.flipped === true) ? "w" : "b";
  }

  // Material plus string for capturer ("w"|"b") — only one side returns "+V", other returns "".
  getMaterialPlusForColor(color /* "w"|"b" */) {
    return (color === "w") ? (this.materialPlusWhite || "")
         : (color === "b") ? (this.materialPlusBlack || "")
         : "";
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

    this.updateDerivedAfterViewChange();
    
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
    
    this.updateDerivedAfterViewChange();
    
    return true;
  }

  reset() {
    this.chessLive.reset();
    this._syncViewToLive();

    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;
    this.lastMove = null;

    this.history = [];
    this.redoStack = [];

    this.snapshots = [{ ply: 0, san: null, fen: this.chessLive.fen() }];
    this.reviewPly = 0;

    this._openingMailbox = [];
    this._openingByFen.clear();
    this.openingSuggestion = null;

    this._posVersion++;
    this._uiVersion++;
    this.updateDerivedAfterViewChange();
  }

  // ----- review mode API -----
  enterReviewAtEnd() {
    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;

    this.mode = "review";
    this._loadViewPly(this.history.length);
    this.updateDerivedAfterViewChange();
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
    this.updateDerivedAfterViewChange();
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
    
    this.updateDerivedAfterViewChange();
    
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
