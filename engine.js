// engine.js
export class Engine {
  constructor(board, onEval) {
    this.board = board;
    this.onEval = onEval;

    this.worker = new Worker("./engine.worker.js", { type: "module" });

    this.lastAnalyzedPosVersion = -1;
    this.currentGen = 0;

    this.worker.onmessage = (e) => {
      const { type, gen, eval: evalData } = e.data;
      if (type !== "analysis") return;
      if (gen !== this.currentGen) return;
      this.onEval(evalData);
    };
  }

  analyzeIfNeeded() {
    const v = this.board.getPositionVersion();
    if (v === this.lastAnalyzedPosVersion) return;

    this.lastAnalyzedPosVersion = v;
    this.currentGen++;

    this.worker.postMessage({
      type: "analyze",
      gen: this.currentGen,
      board: {
        pieces: Array.from(this.board.pieces.entries())
      }
    });
  }

  getCurrentGen() {
    return this.currentGen;
  }
}
