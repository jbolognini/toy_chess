import { Board } from "./board.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Engine } from "./engine.js";

let debugText = "";

export function getDebug() {
  return debugText;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

const canvas = document.getElementById("board");
const board = new Board();

const engine = new Engine(board, (evalData) => {
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
  renderer.draw();
  requestAnimationFrame(loop);
}
loop();
