export class Renderer {
  constructor(canvas, game, getDebug) {
    this.ctx = canvas.getContext("2d");
    this.canvas = canvas;
    this.game = game;
    this.getDebug = getDebug;

    this.sprites = new Map(); // code -> Image
  }

  getSprite(code) {
    if (this.sprites.has(code)) return this.sprites.get(code);
    const img = new Image();
    img.src = `./assets/${code}.png`;
    this.sprites.set(code, img);
    return img;
  }

  computeGeom() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Small HUD inside canvas (status + debug). Title is above in HTML.
    const hudH = 46 * dpr;

    const availH = Math.max(1, h - hudH);
    const size = Math.min(w, availH) * 0.94;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = hudH + (availH - size) / 2;

    return { dpr, w, h, hudH, size, sq, ox, oy };
  }

  draw() {
    const ctx = this.ctx;
    const { dpr, w, h, hudH, size, sq, ox, oy } = this.computeGeom();

    ctx.clearRect(0, 0, w, h);

    // Status line
    ctx.fillStyle = "#ddd";
    ctx.font = `${Math.floor(14 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(this.game.statusText(), 10 * dpr, 18 * dpr);

    // Debug line (optional)
    const dbg = this.getDebug?.() || "";
    if (dbg) {
      ctx.fillStyle = "#888";
      ctx.fillText(dbg, 10 * dpr, 38 * dpr);
    }

    // Board squares
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#ddd" : "#666";
        ctx.fillRect(ox + c * sq, oy + r * sq, sq, sq);
      }
    }

    // Selection highlight
    if (this.game.selected) {
      ctx.fillStyle = "rgba(255,255,0,0.25)";
      ctx.fillRect(
        ox + this.game.selected.x * sq,
        oy + this.game.selected.y * sq,
        sq,
        sq
      );
    }

    // Legal targets highlight
    for (const t of this.game.legalTargets) {
      ctx.fillStyle = "rgba(0,255,0,0.20)";
      ctx.fillRect(ox + t.x * sq, oy + t.y * sq, sq, sq);
    }

    // Pieces
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const code = this.game.pieceCodeAt(x, y);
        if (!code) continue;
        const img = this.getSprite(code);
        ctx.drawImage(img, ox + x * sq, oy + y * sq, sq, sq);
      }
    }

    // Promotion chooser (outside board, clamped)
    if (this.game.pendingPromotion) {
      this.drawPromotionChooser(ctx, { dpr, w, h, sq, ox, oy, size, hudH });
    }
  }

  drawPromotionChooser(ctx, geom) {
    const { dpr, sq, ox, oy, size } = geom;
    const { color, to } = this.game.pendingPromotion;

    // promotion is always to last rank => y is 0 (rank 8) or 7 (rank 1)
    const { x: toX, y: toY } = this.game.xyFromSquare(to);

    const box = Math.floor(sq * 0.78);
    const gap = Math.floor(sq * 0.08);
    const margin = Math.floor(sq * 0.12);

    const popupW = box * 4 + gap * 3;
    const popupH = box;

    // Center the chooser on the promoting file, then clamp to board bounds
    const centerX = ox + (toX + 0.5) * sq;
    let startX = Math.floor(centerX - popupW / 2);

    const minX = Math.floor(ox);
    const maxX = Math.floor(ox + size - popupW);
    if (startX < minX) startX = minX;
    if (startX > maxX) startX = maxX;

    // Place outside the board: above if promoting on top rank, below if bottom rank
    let y;
    if (toY === 0) {
      // above board (into HUD area), but never below 0
      y = Math.floor(oy - popupH - margin);
      if (y < 0) y = 0;
    } else {
      // below board
      y = Math.floor(oy + 8 * sq + margin);
    }

    // Slight backdrop behind the chooser (only around chooser, not full-screen)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(startX - margin, y - margin, popupW + margin * 2, popupH + margin * 2);

    const pieces = ["q", "r", "b", "n"];
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (box + gap);

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, box, box);

      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
      ctx.strokeRect(x, y, box, box);

      const code = `${color}${pieces[i]}`; // wq/wr/wb/wn or bq/...
      const img = this.getSprite(code);
      ctx.drawImage(img, x, y, box, box);
    }
  }
}
