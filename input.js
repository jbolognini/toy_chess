// input.js
export class Input {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;

    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
  }

  onDown(e) {
    const pos = this.posToSquare(e);
    if (!pos) return;

    const { x, y } = pos;

    // If something is selected, try to move it first
    if (this.game.selected) {
      if (this.game.tryMoveSelected(x, y)) return;
    }

    // Otherwise select (or clear selection if not selectable)
    this.game.selectSquare(x, y);
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
