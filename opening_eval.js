// opening_eval.js

export class OpeningEval {
  constructor(game, onSuggestion) {
    this.game = game;
    this.onSuggestion = onSuggestion;

    this.worker = new Worker("./opening.worker.js", { type: "module" });
    this.lastRequestedFen = "";
    this.reqSeq = 0;

    this.worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type !== "opening_result") return;
      if (this.onSuggestion) this.onSuggestion(msg.payload);
    };
  }

  requestIfNeeded() {
    const fen = this.game.viewFen?.();
    if (!fen) return;
    if (fen === this.lastRequestedFen) return;

    this.lastRequestedFen = fen;
    this.reqSeq += 1;

    this.worker.postMessage({
      type: "suggest_opening",
      reqId: this.reqSeq,
      fen
    });
  }
}
