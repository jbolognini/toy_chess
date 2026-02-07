// input.js
export class Input {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;

    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
  }

  onDown(e) {
    const pos = this.posToSquare(e);

    // Tap outside board => clear selection
    if (!pos) {
      if (this.game.selected) this.game.clearSelection();
      return;
    }

    const { x, y } = pos;

    // Nothing selected: try selecting (or clears internally if not selectable)
    if (!this.game.selected) {
      this.game.selectSquare(x, y);
      return;
    }

    // Something is selected already
    const sel = this.game.selected;

    // Tap selected square again => unselect
    if (x === sel.x && y === sel.y) {
      this.game.clearSelection();
      return;
    }

    const isLegalTarget = this.game.legalTargets.some((t) => t.x === x && t.y === y);
    const code = this.game.pieceCodeAt(x, y); // "wn"/"bp"/etc or null
    const hasPiece = !!code;

    // Tap a non-legal empty square => unselect
    if (!isLegalTarget && !hasPiece) {
      this.game.clearSelection();
      return;
    }

    // Tap any other piece
    if (hasPiece) {
      // If legal => capture/move
      if (isLegalTarget) {
        this.game.tryMoveSelected(x, y);
        return;
      }

      // Not legal: if it's your piece, switch selection
      if (this.game.canSelect(x, y)) {
        this.game.selectSquare(x, y);
        return;
      }

      // Opponent piece not capturable => unselect
      this.game.clearSelection();
      return;
    }

    // Empty square: if legal => move, else unselect (shouldn't reach here often)
    if (isLegalTarget) {
      this.game.tryMoveSelected(x, y);
      return;
    }

    this.game.clearSelection();
  }

  posToSquare(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const w = this.canvas.width;
    const h = this.canvas.height;

    const size = Math.min(w, h) * 0.9;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;

    const x = Math.floor((px - ox) / sq);
    const y = Math.floor((py - oy) / sq);

    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return { x, y };
  }
}
