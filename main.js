import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Engine } from "./engine.js";

const APP_VER = window.APP_VER || 0;
document.title = `Toy Chess v${APP_VER}`;

let debugText = "";
export function getDebug() {
  return debugText;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(`./sw.js?v=${APP_VER}`);
}

const canvas = document.getElementById("board");
const game = new Game();

const engine = new Engine(game, (evalData) => {
  // You can show eval later; debugText below overwrites each frame on purpose.
});

const renderer = new Renderer(canvas, game, () => debugText);
new Input(canvas, game);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function loop() {
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
