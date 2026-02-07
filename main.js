import { Board } from "./board.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Engine } from "./engine.js";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

const canvas = document.getElementById("board");
const board = new Board();
const renderer = new Renderer(canvas, board);
const engine = new Engine(board);
new Input(canvas, board);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function loop() {
  engine.tick();
  renderer.draw();
  requestAnimationFrame(loop);
}
loop();
