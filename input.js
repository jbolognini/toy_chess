export class Input {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;

    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
  }

  onDown(e) {
    // If game over: do not allow selection/moves. Clear any leftover selection.
    if (this.game.isGameOver()) {
      if (this.game.selected || (this.game.legalTargets && this.game.legalTargets.length)) {
        this.game.clearSelection();
      }
      if (this.game.pendingPromotion) {
        this.game.clearPromotion();
      }
      return;
    }

    const hit = this.hitTest(e);

    // Tap outside board area:
    // - cancel promotion if open
    // - clear selection if any
    if (!hit) {
      if (this.game.pendingPromotion) {
        this.game.clearPromotion();
        this.game.clearSelection();
      } else if (this.game.selected) {
        this.game.clearSelection();
      }
      return;
    }

    // Promotion chooser active: allow choosing or canceling
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

  // Must match render.js geometry
  computeGeom() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const hudH = 46 * dpr;
    const availH = Math.max(1, h - hudH);
    const size = Math.min(w, availH) * 0.94;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = hudH + (availH - size) / 2;

    return { dpr, w, h, hudH, size, sq, ox, oy };
  }

  hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const pxCss = e.clientX - rect.left;
    const pyCss = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const px = pxCss * dpr;
    const py = pyCss * dpr;

    const geom = this.computeGeom();

    // If promotion chooser is open, allow clicking the chooser (outside board)
    if (this.game.pendingPromotion) {
      const promo = this.promoHit(px, py, geom);
      if (promo) return promo;
      // allow normal board click too
    }

    // Board square hit test
    const { sq, ox, oy } = geom;
    const x = Math.floor((px - ox) / sq);
    const y = Math.floor((py - oy) / sq);

    if (x < 0 || x > 7 || y < 0 || y > 7) {
      // Not on board; if promo is open we still want "something" so taps cancel,
      // but we already handle !hit as cancel/clear, so return null.
      return null;
    }

    return { type: "square", x, y };
  }

  promoHit(px, py, geom) {
    const { sq, ox, oy, size } = geom;
    const { color, to } = this.game.pendingPromotion;

    const { x: toX, y: toY } = this.game.xyFromSquare(to);

    const box = Math.floor(sq * 0.78);
    const gap = Math.floor(sq * 0.08);
    const margin = Math.floor(sq * 0.12);

    const popupW = box * 4 + gap * 3;
    const popupH = box;

    const centerX = ox + (toX + 0.5) * sq;
    let startX = Math.floor(centerX - popupW / 2);

    const minX = Math.floor(ox);
    const maxX = Math.floor(ox + size - popupW);
    if (startX < minX) startX = minX;
    if (startX > maxX) startX = maxX;

    let y;
    if (toY === 0) {
      y = Math.floor(oy - popupH - margin);
      if (y < 0) y = 0;
    } else {
      y = Math.floor(oy + 8 * sq + margin);
    }

    // Hit test each box
    const pieces = ["q", "r", "b", "n"];
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (box + gap);
      if (px >= x && px <= x + box && py >= y && py <= y + box) {
        return { type: "promo", piece: pieces[i] };
      }
    }

    // If click is inside the small backdrop area, treat as "promo area" (no cancel)
    const backX = startX - margin;
    const backY = y - margin;
    const backW = popupW + margin * 2;
    const backH = popupH + margin * 2;
    if (px >= backX && px <= backX + backW && py >= backY && py <= backY + backH) {
      return { type: "promo-area" };
    }

    return null;
  }
}
