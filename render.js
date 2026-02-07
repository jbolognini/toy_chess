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
    img.src = `./assets/${code}.png`; // wp.png, bn.png, etc
    this.sprites.set(code, img);
    return img;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const dpr = window.devicePixelRatio || 1;

    // HUD: title + status + debug
    const ver = window.APP_VER ?? "?";

    ctx.fillStyle = "white";
    ctx.font = `${Math.floor(14 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(`Toy Chess v${ver}`, 10 * dpr, 18 * dpr);

    ctx.font = `${Math.floor(14 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = "#ddd";
    ctx.fillText(this.game.statusText(), 10 * dpr, 38 * dpr);

    const dbg = this.getDebug?.() || "";
    if (dbg) {
      ctx.fillStyle = "#aaa";
      ctx.fillText(dbg, 10 * dpr, 58 * dpr);
    }

    // Board geometry
    const topHudPx = 70 * dpr;
    const availH = Math.max(1, h - topHudPx);
    const size = Math.min(w, availH) * 0.92;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = topHudPx + (availH - size) / 2;

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

    // Promotion overlay
    if (this.game.pendingPromotion) {
      this.drawPromotionOverlay(ctx, w, h, dpr);
    }
  }

  drawPromotionOverlay(ctx, w, h, dpr) {
    // Backdrop
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, w, h);

    const { color } = this.game.pendingPromotion;

    // Layout
    const box = Math.floor(Math.min(w, h) * 0.14);
    const gap = Math.floor(12 * dpr);
    const totalW = box * 4 + gap * 3;
    const startX = Math.floor((w - totalW) / 2);
    const y = Math.floor(h * 0.42);

    const pieces = ["q", "r", "b", "n"];
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (box + gap);

      // Box
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, box, box);

      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
      ctx.strokeRect(x, y, box, box);

      // Sprite
      const code = `${color}${pieces[i]}`; // wq/wr/wb/wn or bq/...
      const img = this.getSprite(code);
      ctx.drawImage(img, x, y, box, box);
    }

    // Hint text
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.floor(16 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.fillText("Choose promotion", Math.floor(w * 0.5) - Math.floor(90 * dpr), y - Math.floor(18 * dpr));
  }
}
