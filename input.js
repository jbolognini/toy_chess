// input.js

export class Input {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;

    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
  }

  onDown(e) {
    // REVIEW MODE: no board interaction
    if (this.game.mode === "review") {
      // Clear any leftover selection if present
      if (this.game.selected || (this.game.legalTargets && this.game.legalTargets.length)) {
        this.game.clearSelection();
      }
      if (this.game.pendingPromotion) {
        this.game.clearPromotion();
      }
      return;
    }

    // PLAY MODE only
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

    // Tap outside board area: cancel promotion or clear selection
    if (!hit) {
      if (this.game.pendingPromotion) {
        this.game.clearPromotion();
        this.game.clearSelection();
      } else if (this.game.selected) {
        this.game.clearSelection();
      }
      return;
    }

    // Promotion chooser active
    if (this.game.pendingPromotion) {
      if (hit.type === "promo") {
        this.game.finishPromotion(hit.piece);
      } else {
        this.game.clearPromotion();
        this.game.clearSelection();
      }
      return;
    }

    // Normal board taps
    const { x, y } = hit;

    if (!this.game.selected) {
      this.game.selectSquare(x, y);
      return;
    }

    const sel = this.game.selected;

    if (x === sel.x && y === sel.y) {
      this.game.clearSelection();
      return;
    }

    const isLegalTarget = this.game.legalTargets.some((t) => t.x === x && t.y === y);
    const code = this.game.pieceCodeAt(x, y);
    const hasPiece = !!code;

    if (!isLegalTarget && !hasPiece) {
      this.game.clearSelection();
      return;
    }

    if (hasPiece) {
      if (isLegalTarget) {
        this.game.tryMoveSelected(x, y);
        return;
      }
      if (this.game.canSelect(x, y)) {
        this.game.selectSquare(x, y);
        return;
      }
      this.game.clearSelection();
      return;
    }

    if (isLegalTarget) {
      this.game.tryMoveSelected(x, y);
      return;
    }

    this.game.clearSelection();
  }

  // Must match render.js geometry
  computeGeom() {
    // HUD height (CSS px)
    const HUD_H_PX = 46;

    // Board scale inside the usable area (1.0 = maximum fit)
    const BOARD_SCALE = 0.985;

    // Eval bar thickness (CSS px)
    const EVAL_BAR_W_PX = 14;

    // Edge padding: screen edge -> eval bar (CSS px), clamped
    const EDGE_PAD_MIN_PX = 0;
    const EDGE_PAD_MAX_PX = 6;

    // Default edge pad target as a fraction of board size (tight by default)
    const EDGE_PAD_PCT = 0.006;

    // Deterministic rule: eval-to-board gap is half of edge padding
    const GAP_IS_HALF_EDGE = true;

    // Optional: tiny safety pad (CSS px)
    const BOARD_SAFE_PAD_PX = 0;

    // ============================================================
    // Helpers
    // ============================================================
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const DPR_FLOOR = 1;
    const dpr = Math.max(DPR_FLOOR, window.devicePixelRatio || 1);
    const w = this.canvas.width;
    const h = this.canvas.height;

    const px = (cssPx) => cssPx * dpr;

    const hudH = px(HUD_H_PX);
    const safePad = px(BOARD_SAFE_PAD_PX);

    // Available height below HUD
    const availH0 = Math.max(1, h - hudH - safePad * 2);
    const availW0 = Math.max(1, w - safePad * 2);

    // First estimate for board size to choose edge padding
    const prelimSize = Math.max(1, Math.min(availW0, availH0) * BOARD_SCALE);

    // Tight edge padding from percentage, clamp to [min..max] in device px
    const edgePad = clamp(
      prelimSize * EDGE_PAD_PCT,
      px(EDGE_PAD_MIN_PX),
      px(EDGE_PAD_MAX_PX)
    );

    // Gap: half-edge or full edge
    const evalPad = GAP_IS_HALF_EDGE ? (edgePad * 0.5) : edgePad;

    const evalW = px(EVAL_BAR_W_PX);
    const leftInset = edgePad + evalW + evalPad;

    // Final available width for board after reserving eval gutter
    const availW = Math.max(1, w - leftInset - safePad * 2);
    const availH = availH0;

    // Board size
    const size = Math.max(1, Math.min(availW, availH) * BOARD_SCALE);
    const sq = size / 8;

    // Center board
    const ox = leftInset + safePad + (availW - size) / 2;
    const oy = hudH + safePad + (availH - size) / 2;

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

    // Promo chooser hit (outside board)
    if (this.game.pendingPromotion) {
      const promo = this.promoHit(px, py, geom);
      if (promo) return promo;
      // allow normal board click too
    }

    const { sq, ox, oy } = geom;
    const x = Math.floor((px - ox) / sq);
    const y = Math.floor((py - oy) / sq);

    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return { type: "square", x, y };
  }

  promoHit(px, py, geom) {
    const { sq, ox, oy, size } = geom;
    const { to } = this.game.pendingPromotion;

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

    // Must match render.js exactly
    const aboveY = Math.floor(oy - popupH - margin);
    const belowY = Math.floor(oy + 8 * sq + margin);
    
    let y = (aboveY >= 0) ? aboveY : belowY;
    
    const minY = 0;
    const maxY = Math.max(0, Math.floor(geom.h - popupH));
    if (y < minY) y = minY;
    if (y > maxY) y = maxY;

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
