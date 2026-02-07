const CACHE = "toy_chess_v2";
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
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
