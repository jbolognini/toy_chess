export class Input {
  constructor(canvas, board) {
    this.board = board;
    this.dragging = false;

    canvas.addEventListener("pointerdown", e => this.down(e, canvas));
    canvas.addEventListener("pointermove", e => this.move(e, canvas));
    canvas.addEventListener("pointerup", () => this.dragging = false);
  }

  down(e, canvas) {
    const pos = this.pos(e, canvas);
    if (pos.x === this.board.piece.x && pos.y === this.board.piece.y) {
      this.dragging = true;
    }
  }

  move(e, canvas) {
    if (!this.dragging) return;
    const pos = this.pos(e, canvas);
    this.board.movePiece(pos.x, pos.y);
  }

  pos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const size = Math.min(canvas.width, canvas.height) * 0.9;
    const sq = size / 8;
    const ox = (canvas.width - size) / 2;
    const oy = (canvas.height - size) / 2;
    return {
      x: Math.floor((px - ox) / sq),
      y: Math.floor((py - oy) / sq)
    };
  }
}
