// render.js
export class Renderer {
  constructor(canvas, board, getDebug) {
    this.ctx = canvas.getContext("2d");
    this.canvas = canvas;
    this.board = board;
    this.getDebug = getDebug;

    // sprite cache: code -> Image
    this.sprites = new Map();
  }

  getSprite(code) {
    if (this.sprites.has(code)) return this.sprites.get(code);

    const img = new Image();
    img.src = `./assets/${code}.png`; // e.g. wn.png, wb.png
    this.sprites.set(code, img);
    return img;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Title line (keep your bumping approach)
    ctx.fillStyle = "white";
    ctx.font = "14px monospace";
    const ver = window.APP_VER ?? "?";
    ctx.fillText(`Toy Chess v${ver}`, 10, 20);

    const size = Math.min(w, h) * 0.9;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;

    // Board
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#ddd" : "#666";
        ctx.fillRect(ox + c * sq, oy + r * sq, sq, sq);
      }
    }

    // Highlights
    if (this.board.selected) {
      const {x, y} = this.board.selected;
      ctx.fillStyle = "rgba(255,255,0,0.25)";
      ctx.fillRect(ox + x * sq, oy + y * sq, sq, sq);
    }
    for (const t of this.board.legalTargets) {
      ctx.fillStyle = "rgba(0,255,0,0.20)";
      ctx.fillRect(ox + t.x * sq, oy + t.y * sq, sq, sq);
    }

    // Pieces
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const code = this.board.getPiece(x, y);
        if (!code) continue;
        const img = this.getSprite(code);
        ctx.drawImage(img, ox + x * sq, oy + y * sq, sq, sq);
      }
    }

    // Debug line (optional)
    const dbg = this.getDebug?.() || "";
    if (dbg) {
      ctx.fillStyle = "white";
      ctx.font = "14px monospace";
      ctx.fillText(dbg, 10, 40);
    }
  }
}
