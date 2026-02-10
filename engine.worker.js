// engine.worker.js

function randInt(lo, hi) {
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.type !== "analyze") return;

  const { gen } = msg;

  // Fake compute time (ms)
  const delay = randInt(120, 420);

  setTimeout(() => {
    // Random centipawn eval from White perspective (+ = White better)
    const cp = randInt(-350, 350);

    self.postMessage({
      type: "analysis",
      gen,
      evalData: { cp }
    });
  }, delay);
};
