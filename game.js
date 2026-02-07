// game.js
import { Chess } from "./lib/chess.mjs";

const FILES = "abcdefgh";

/**
 * Game = the single source of truth for rules + legality.
 * UI reads derived state from here (piece codes, selection, targets).
 */
export class Game {
  constructor() {
    this.chess = new Chess();

    // UI state
    this.selected = null;       // {x,y} or null
    this.legalTargets = [];     // [{x,y}, ...]

    // Versioning
    this._uiVersion = 0;        // selection/highlights changed
    this._posVersion = 0;       // actual chess position changed
  }

  // --- versions ---
  getUIVersion() { return this._uiVersion; }
  getPositionVersion() { return this._posVersion; }

  // --- coordinate mapping (x=0..7, y=0..7 with y=0 at top) ---
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

  /**
   * Return sprite code like "wn", "bp", etc. or null.
   */
  pieceCodeAt(x, y) {
    const sq = this.squareFromXY(x, y);
    const p = this.chess.get(sq); // {type:'p', color:'w'} or null
    if (!p) return null;
    return p.color + p.type; // "wp","wn","wb","wr","wq","wk" etc.
  }

  /**
   * True if there is a piece at square and it belongs to side-to-move.
   */
  canSelect(x, y) {
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

  selectSquare(x, y) {
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

  /**
   * Attempt to move currently-selected piece to (toX,toY).
   * Returns true if a move was made.
   */
  tryMoveSelected(toX, toY) {
    if (!this.selected) return false;

    const from = this.squareFromXY(this.selected.x, this.selected.y);
    const to = this.squareFromXY(toX, toY);

    // Choose a promotion default if needed (later: UI overlay)
    const move = this.chess.move({ from, to, promotion: "q" });
    if (!move) return false;

    // Position changed
    this._posVersion++;

    // Clear UI selection/highlights
    this.selected = null;
    this.legalTargets = [];
    this._uiVersion++;

    return true;
  }
}
