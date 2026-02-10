const CACHE = "toy_chess_43ff1f8f"; // set by CI during deploy (short SHA)

const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./theme.js",
  "./board.js",
  "./render.js",
  "./input.js",
  "./engine.js",
  "./engine.worker.js",
  "./game.js",
  "./lib/chess.mjs",
  "./manifest.json",

  // White pieces
  "./assets/wp.png",
  "./assets/wn.png",
  "./assets/wb.png",
  "./assets/wr.png",
  "./assets/wq.png",
  "./assets/wk.png",

  // Black pieces
  "./assets/bp.png",
  "./assets/bn.png",
  "./assets/bb.png",
  "./assets/br.png",
  "./assets/bq.png",
  "./assets/bk.png",

  // White pieces
  "./assets/wp_halo.png",
  "./assets/wn_halo.png",
  "./assets/wb_halo.png",
  "./assets/wr_halo.png",
  "./assets/wq_halo.png",
  "./assets/wk_halo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Network-first for navigations so updates show up while online
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }

  // Cache-first for everything else (fast + offline)
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
