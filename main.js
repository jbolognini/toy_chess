import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Engine } from "./engine.js";

const APP_VER = window.APP_VER || 0;
const APP_TITLE = `Toy Chess v${APP_VER}`;

document.title = APP_TITLE;

const titleEl = document.getElementById("titleText");
if (titleEl) titleEl.textContent = APP_TITLE;

let debugText = "";
export function getDebug() {
  return debugText;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(`./sw.js?v=${APP_VER}`);
}

const canvas = document.getElementById("board");
const game = new Game();

const engine = new Engine(game, (_evalData) => {
  // still stubbed
});

const renderer = new Renderer(canvas, game, () => debugText);
new Input(canvas, game);

// Controls
document.getElementById("undoBtn").addEventListener("click", () => game.undo());
document.getElementById("redoBtn").addEventListener("click", () => game.redo());
document.getElementById("resetBtn").addEventListener("click", () => game.reset());

function resizeCanvasToCSSSize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

window.addEventListener("resize", resizeCanvasToCSSSize);
resizeCanvasToCSSSize();

function loop() {
  resizeCanvasToCSSSize();

  engine.analyzeIfNeeded();

  debugText =
    `turn:${game.turn()} ` +
    `ui:${game.getUIVersion()} ` +
    `pos:${game.getPositionVersion()} ` +
    `gen:${engine.getCurrentGen()}`;

  renderer.draw();
  requestAnimationFrame(loop);
}
loop();
