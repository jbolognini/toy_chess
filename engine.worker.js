// engine.worker.js
self.onmessage = (e) => {
  const { type, board, gen } = e.data;

  if (type === "analyze") {
    // --- stub analysis ---
    const fakeEval = {
      cp: 12,
      bestMove: "g1f3",
      depth: 1
    };

    setTimeout(() => {
      self.postMessage({
        type: "analysis",
        gen,
        eval: fakeEval
      });
    }, 50);
  }
};
