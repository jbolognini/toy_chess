// engine.js
export class Engine {
  constructor(board, onEval) {
    this.board = board;
    this.onEval = onEval;

    this.worker = new Worker("./engine.worker.js", { type: "module" });

    this.lastAnalyzedVersion = -1;
    this.currentGen = 0;

    this.worker.onmessage = (e) => {
      const { type, gen, eval: evalData } = e.data;
      if (type !== "analysis") return;

      // Ignore stale replies
      if (gen !== this.currentGen) return;

      this.onEval(evalData);
    };
  }

  analyzeIfNeeded() {
    const v = this.board.getVersion();
    if (v === this.lastAnalyzedVersion) return;

    this.lastAnalyzedVersion = v;
    this.currentGen++;

    this.worker.postMessage({
      type: "analyze",
      gen: this.currentGen,
      board: {
        piece: this.board.piece
      }
    });
  }
  
  getCurrentGen() {
    return this.currentGen;
  }
}
