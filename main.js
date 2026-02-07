import { Board } from "./board.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Engine } from "./engine.js";

// Single source of truth for "force update" version.
// Set in index.html: window.APP_VER = 4;
const APP_VER = window.APP_VER || 0;

const APP_TITLE = `Toy Chess v${APP_VER}`;
document.title = APP_TITLE;

let debugText = "";

export function getDebug() {
  return debugText;
}

if ("serviceWorker" in navigator) {
  // Cache-bust SW fetch so Safari actually updates it
  navigator.serviceWorker.register(`./sw.js?v=${APP_VER}`);
}

const canvas = document.getElementById("board");
const board = new Board();

const engine = new Engine(board, (evalData) => {
  // If you later want eval shown, this keeps working,
  // but note we overwrite debugText every frame below.
  debugText = `cp: ${evalData.cp}`;
});

const renderer = new Renderer(canvas, board, () => debugText);
new Input(canvas, board);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function loop() {
  engine.analyzeIfNeeded();

  // Always-visible debug (independent of worker reply)
  debugText = `${APP_TITLE}  v:${board.getVersion()} gen:${engine.getCurrentGen?.() ?? "?"}`;

  renderer.draw();
  requestAnimationFrame(loop);
}
loop();
