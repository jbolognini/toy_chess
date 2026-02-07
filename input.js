export class Input {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;

    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
  }

  onDown(e) {
    const hit = this.hitTest(e);

    // Tap outside canvas board area (or any non-square area):
    // - if promotion is up: cancel it
    // - otherwise: clear selection
    if (!hit) {
      if (this.game.pendingPromotion) {
        this.game.clearPromotion();
        this.game.clearSelection();
      } else if (this.game.selected) {
        this.game.clearSelection();
      }
      return;
    }

    // Promotion overlay active: handle promotion taps anywhere on canvas
    if (this.game.pendingPromotion) {
      if (hit.type === "promo") {
        this.game.finishPromotion(hit.piece);
      } else {
        // tap elsewhere cancels promotion + selection
        this.game.clearPromotion();
        this.game.clearSelection();
      }
      return;
    }

    // Normal board taps
    const { x, y } = hit;

    // Nothing selected: select or clear
    if (!this.game.selected) {
      this.game.selectSquare(x, y);
      return;
    }

    // Something selected already
    const sel = this.game.selected;

    // Tap selected square again => unselect
    if (x === sel.x && y === sel.y) {
      this.game.clearSelection();
      return;
    }

    const isLegalTarget = this.game.legalTargets.some((t) => t.x === x && t.y === y);
    const code = this.game.pieceCodeAt(x, y);
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

    // Empty square: if legal => move, else unselect
    if (isLegalTarget) {
      this.game.tryMoveSelected(x, y);
      return;
    }

    this.game.clearSelection();
  }

  hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const pxCss = e.clientX - rect.left;
    const pyCss = e.clientY - rect.top;

    // Convert CSS pixels to canvas pixels
    const dpr = window.devicePixelRatio || 1;
    const px = pxCss * dpr;
    const py = pyCss * dpr;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // If promotion overlay is up, allow hit-testing promo buttons anywhere
    if (this.game.pendingPromotion) {
      const promo = this.promoHit(px, py, w, h, dpr);
      if (promo) return promo;
      return { type: "none" };
    }

    // Board geometry must match render.js
    const topHudPx = 70 * dpr;
    const availH = Math.max(1, h - topHudPx);
    const size = Math.min(w, availH) * 0.92;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = topHudPx + (availH - size) / 2;

    const x = Math.floor((px - ox) / sq);
    const y = Math.floor((py - oy) / sq);

    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return { type: "square", x, y };
  }

  promoHit(px, py, w, h, dpr) {
    const box = Math.floor(Math.min(w, h) * 0.14);
    const gap = Math.floor(12 * dpr);
    const totalW = box * 4 + gap * 3;
    const startX = Math.floor((w - totalW) / 2);
    const y = Math.floor(h * 0.42);

    const pieces = ["q", "r", "b", "n"];
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (box + gap);
      if (px >= x && px <= x + box && py >= y && py <= y + box) {
        return { type: "promo", piece: pieces[i] };
      }
    }
    return null;
  }
}
