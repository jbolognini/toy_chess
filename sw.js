const CACHE = "toy_chess_v6"; // bump when you want to force-update

const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./board.js",
  "./render.js",
  "./input.js",
  "./engine.js",
  "./engine.worker.js",
  "./manifest.json",
  "./assets/wn.png",
  "./assets/wb.png"
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
