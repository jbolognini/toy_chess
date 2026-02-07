// input.js
export class Input {
  constructor(canvas, board) {
    this.board = board;

    canvas.addEventListener("pointerdown", e => this.down(e, canvas));
  }

  down(e, canvas) {
    const pos = this.pos(e, canvas);
    if (!pos) return;

    const {x, y} = pos;

    // If a piece is selected, try to move it
    if (this.board.selected) {
      if (this.board.tryMoveSelected(x, y)) return;
    }

    // Otherwise select whatever is on this square
    this.board.selectSquare(x, y);
  }

  pos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const w = canvas.width, h = canvas.height;

    // If you already have a title area, keep it simple: no offset here for now
    const size = Math.min(w, h) * 0.9;
    const sq = size / 8;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;

    const x = Math.floor((px - ox) / sq);
    const y = Math.floor((py - oy) / sq);

    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return {x, y};
  }
}
