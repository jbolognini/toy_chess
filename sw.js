const CACHE = "toy_chess_v3"; // bump when you want to force-update

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
  "./assets/knight.png"
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
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
