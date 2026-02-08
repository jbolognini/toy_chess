import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Engine } from "./engine.js";

const APP_VER = window.APP_VER || 0;
const APP_TITLE = `Toy Chess v${APP_VER}`;

document.title = APP_TITLE;
const titleEl = document.getElementById("titleText");
if (titleEl) titleEl.textContent = APP_TITLE;

// Clean up any stale fatal overlay
document.getElementById("fatalError")?.remove();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(`./sw.js?v=${APP_VER}`);
}

const canvas = document.getElementById("board");
const drawer = document.getElementById("drawer");
const movesTable = document.getElementById("movesTable");

const game = new Game();
const renderer = new Renderer(canvas, game, () => game.debugLine());

new Input(canvas, game);

// Engine disabled in review mode (but we still keep the worker plumbing)
const engine = new Engine(game, (_evalData) => {});
renderer.engine = engine;

function setDrawerOpen(open) {
  drawer.classList.toggle("drawer-open", !!open);

  // Shrink canvas by drawer height when open
  if (open) {
    document.documentElement.style.setProperty("--canvas-bottom", `calc(var(--bottombar-h) + var(--drawer-h))`);
  } else {
    document.documentElement.style.setProperty("--canvas-bottom", `var(--bottombar-h)`);
  }
}


function setMode(mode) {
  // mode: "play" | "review"
  game.setMode(mode);

  document.body.classList.toggle("mode-review", mode === "review");

  const playBar = document.getElementById("bottomPlay");
  const reviewBar = document.getElementById("bottomReview");

  if (mode === "review") {
    playBar.classList.add("hidden");
    reviewBar.classList.remove("hidden");
    setDrawerOpen(true);
  } else {
    reviewBar.classList.add("hidden");
    playBar.classList.remove("hidden");
    setDrawerOpen(false);
  }

  renderMovesTable();
}


// --- Top buttons (app controls) ---
document.getElementById("undoBtn").addEventListener("click", () => {
  if (game.mode === "review") return;
  game.undo();
  renderMovesTable();
});
document.getElementById("redoBtn").addEventListener("click", () => {
  if (game.mode === "review") return;
  game.redo();
  renderMovesTable();
});
document.getElementById("resetBtn").addEventListener("click", () => {
  game.reset();
  setMode("play");
  renderMovesTable();
});

// --- Drawer controls ---

// --- Bottom PLAY controls ---
document.getElementById("movesBtn").addEventListener("click", () => {
  if (game.mode !== "play") return;
  const open = drawer.classList.contains("drawer-open");
  setDrawerOpen(!open);
  renderMovesTable();
});

document.getElementById("reviewBtn").addEventListener("click", () => {
  if (game.mode !== "play") return;
  game.enterReviewAtEnd();
  setMode("review");
  renderMovesTable();
});

// --- Bottom REVIEW controls ---
document.getElementById("revStartBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.gotoReviewPly(0);
  renderMovesTable();
});
document.getElementById("revBackBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.gotoReviewPly(game.reviewPly - 1);
  renderMovesTable();
});
document.getElementById("revFwdBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.gotoReviewPly(game.reviewPly + 1);
  renderMovesTable();
});
document.getElementById("revEndBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.enterReviewAtEnd();
  renderMovesTable();
});
document.getElementById("revCancelBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.exitReviewCancel();
  setMode("play");
  renderMovesTable();
});
document.getElementById("revPlayHereBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.playFromHere();
  setMode("play");
  renderMovesTable();
});

// --- Move table rendering ---
let lastAutoScrollPly = null;

function renderMovesTable() {
  const rows = game.getMoveRows();
  const activePly = (game.mode === "review") ? game.reviewPly : game.getCurrentPly();

  // Rebuild table
  movesTable.innerHTML = "";

  let activeEl = null;

  for (const r of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "moveRow";

    // Move number
    const numEl = document.createElement("div");
    numEl.className = "moveNum";
    numEl.textContent = String(r.moveNo);
    rowEl.appendChild(numEl);

    // White cell
    const wEl = document.createElement("div");
    wEl.className = "moveCell" + (r.white ? "" : " empty");
    wEl.textContent = r.white ? r.white.san : "";

    if (r.white && activePly === r.white.ply) {
      wEl.classList.add("active");
      activeEl = wEl;
    }

    if (r.white && game.mode === "review") {
      wEl.addEventListener("click", () => {
        game.gotoReviewPly(r.white.ply);
      });
    }

    rowEl.appendChild(wEl);

    // Black cell
    const bEl = document.createElement("div");
    bEl.className = "moveCell" + (r.black ? "" : " empty");
    bEl.textContent = r.black ? r.black.san : "";

    if (r.black && activePly === r.black.ply) {
      bEl.classList.add("active");
      activeEl = bEl;
    }

    if (r.black && game.mode === "review") {
      bEl.addEventListener("click", () => {
        game.gotoReviewPly(r.black.ply);
      });
    }

    rowEl.appendChild(bEl);

    movesTable.appendChild(rowEl);
  }

  // Auto-scroll: keep the active ply visible
  // Only do this when the active ply changes (prevents fighting the user's scroll).
  if (activeEl && activePly !== lastAutoScrollPly) {
    lastAutoScrollPly = activePly;

    // Use "nearest" so it doesn't jump too aggressively.
    activeEl.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto"
    });
  }
}

let lastTableSig = "";

function maybeUpdateMovesTable() {
  const drawerOpen = drawer.classList.contains("drawer-open");
  const shouldShow = drawerOpen || game.mode === "review";
  if (!shouldShow) return;

  const sig = `${game.mode}|${game.reviewPly}|${game.getUIVersion()}|${game.getPositionVersion()}|${game.getCurrentPly()}`;
  if (sig === lastTableSig) return;

  lastTableSig = sig;
  renderMovesTable();
}

// --- Canvas sizing ---
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

// Init
setMode("play");
renderMovesTable();

// Main loop
function loop() {
  resizeCanvasToCSSSize();
  
  // Engine only in play mode
  if (game.mode === "play") {
    engine.analyzeIfNeeded();
  }
  
  maybeUpdateMovesTable();
  renderer.draw();
  requestAnimationFrame(loop);
}
loop();
