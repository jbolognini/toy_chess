// engine.worker.js
self.onmessage = (e) => {
  const { type, gen, fen } = e.data;
  if (type !== "analyze") return;

  // Stub response
  const fakeEval = { cp: 0, depth: 0, fenSeen: fen };

  setTimeout(() => {
    self.postMessage({
      type: "analysis",
      gen,
      eval: fakeEval
    });
  }, 20);
};
