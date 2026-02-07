export class Renderer {
  constructor(canvas, board, getDebug) {
    this.ctx = canvas.getContext("2d");
    this.canvas = canvas;
    this.board = board;
    this.getDebug = getDebug;

    this.sprite = new Image();
    this.sprite.src = "./assets/wb.png";
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "magenta";
    ctx.fillRect(0, 0, w, h);
    
    ctx.fillStyle = "white";
    ctx.font = "14px monospace";
    ctx.fillText("Toy Chess v0.0.3", 10, 20);

    const size = Math.min(w, h) * 0.9;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#ddd" : "#666";
        ctx.fillRect(ox + c * sq, oy + r * sq, sq, sq);
      }
    }

    const p = this.board.piece;
    ctx.drawImage(
      this.sprite,
      ox + p.x * sq,
      oy + p.y * sq,
      sq,
      sq
    );

    const dbg = this.getDebug();
    if (dbg) {
      ctx.fillStyle = "white";
      ctx.font = "14px monospace";
      ctx.fillText(dbg, 10, 40);
    }
  }
}
