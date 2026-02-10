// engine.js

export class Engine {
  constructor(game, onEval) {
    this.game = game;
    this.onEval = onEval;

    this.worker = new Worker("./engine.worker.js", { type: "module" });

    this.lastAnalyzedVersion = -1;
    this.currentGen = 0;

    this.pending = false;
    this.latestCp = 0;

    this.worker.onmessage = (e) => {
      const { type, gen, evalData } = e.data || {};
      if (type !== "analysis") return;

      // Ignore stale replies
      if (gen !== this.currentGen) return;

      this.pending = false;

      if (evalData && typeof evalData.cp === "number") {
        this.latestCp = evalData.cp;
        if (this.onEval) this.onEval(evalData);
      }
    };
  }

  getCurrentGen() {
    return this.currentGen;
  }

  isPending() {
    return this.pending;
  }

  getLatestCp() {
    return this.latestCp;
  }

  analyzeIfNeeded() {
    // Use your existing version counter for “position changed”
    const v = this.game.getPositionVersion?.() ?? 0;
    if (v === this.lastAnalyzedVersion) return;

    this.lastAnalyzedVersion = v;
    this.currentGen++;
    this.pending = true;

    this.worker.postMessage({
      type: "analyze",
      gen: this.currentGen,
      // include whatever minimal board state you want later
      board: { fen: this.game.chessView?.fen?.() }
    });
  }
}
