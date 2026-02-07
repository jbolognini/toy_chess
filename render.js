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

    const hudH = 46 * dpr;

    // Left eval gutter (placeholder)
    const evalOuterMargin = 8 * dpr;
    const evalW = 16 * dpr;
    const evalPad = 10 * dpr;
    const leftInset = evalOuterMargin + evalW + evalPad;

    const availW = Math.max(1, w - leftInset);
    const availH = Math.max(1, h - hudH);

    const size = Math.min(availW, availH) * 0.94;
    const sq = size / 8;

    const boardX0 = leftInset + (availW - size) / 2;
    const boardY0 = hudH + (availH - size) / 2;

    const evalX = evalOuterMargin;
    const evalY = boardY0;
    const evalH = size;

    return {
      dpr, w, h,
      hudH,
      size, sq,
      ox: boardX0,
      oy: boardY0,
      evalRect: { x: evalX, y: evalY, w: evalW, h: evalH }
    };
  }

  draw() {
    const ctx = this.ctx;
    const geom = this.computeGeom();
    const { dpr, w, h, sq, ox, oy, evalRect } = geom;

    ctx.clearRect(0, 0, w, h);

    // Status
    ctx.fillStyle = "#ddd";
    ctx.font = `${Math.floor(14 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(this.game.statusText(), 10 * dpr, 18 * dpr);

    // Debug (optional)
    const dbg = this.getDebug?.() || "";
    if (dbg) {
      ctx.fillStyle = "#888";
      ctx.fillText(dbg, 10 * dpr, 38 * dpr);
    }

    // Eval placeholder
    this.drawEvalPlaceholder(ctx, evalRect, dpr);

    // Board
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#ddd" : "#666";
        ctx.fillRect(ox + c * sq, oy + r * sq, sq, sq);
      }
    }

    // Selection highlights (only meaningful in play)
    if (this.game.selected) {
      ctx.fillStyle = "rgba(255,255,0,0.25)";
      ctx.fillRect(ox + this.game.selected.x * sq, oy + this.game.selected.y * sq, sq, sq);
    }
    for (const t of this.game.legalTargets) {
      ctx.fillStyle = "rgba(0,255,0,0.20)";
      ctx.fillRect(ox + t.x * sq, oy + t.y * sq, sq, sq);
    }

    // Pieces (from view)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const code = this.game.pieceCodeAt(x, y);
        if (!code) continue;
        const img = this.getSprite(code);
        ctx.drawImage(img, ox + x * sq, oy + y * sq, sq, sq);
      }
    }

    // Promotion chooser (only in play mode)
    if (this.game.pendingPromotion) {
      this.drawPromotionChooser(ctx, geom);
    }
  }

  drawEvalPlaceholder(ctx, r, dpr) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h / 2);
    ctx.lineTo(r.x + r.w, r.y + r.h / 2);
    ctx.stroke();
  }

  drawPromotionChooser(ctx, geom) {
    const { dpr, sq, ox, oy, size } = geom;
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

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(startX - margin, y - margin, popupW + margin * 2, popupH + margin * 2);

    const isBlack = color === "b";
    const pieces = ["q", "r", "b", "n"];

    for (let i = 0; i < 4; i++) {
      const x = startX + i * (box + gap);

      ctx.fillStyle = isBlack ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, box, box);

      ctx.strokeStyle = isBlack ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
      ctx.strokeRect(x, y, box, box);

      const code = `${color}${pieces[i]}`;
      const img = this.getSprite(code);
      ctx.drawImage(img, x, y, box, box);
    }
  }
}
