import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Engine } from "./engine.js";
import { loadTheme } from "./theme.js";

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

const theme = loadTheme();
const canvas = document.getElementById("board");
const drawer = document.getElementById("drawer");
const movesTable = document.getElementById("movesTable");

const game = new Game();
const renderer = new Renderer(canvas, game, () => game.debugLine(), theme);

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

  renderMovesTableNow();
}


// --- Top buttons (app controls) ---
document.getElementById("undoBtn").addEventListener("click", () => {
  if (game.mode === "review") return;
  game.undo();
  renderMovesTableNow();
});
document.getElementById("redoBtn").addEventListener("click", () => {
  if (game.mode === "review") return;
  game.redo();
  renderMovesTableNow();
});
document.getElementById("resetBtn").addEventListener("click", () => {
  game.reset();
  setMode("play");
});

// --- Drawer controls ---

// --- Bottom PLAY controls ---
document.getElementById("movesBtn").addEventListener("click", () => {
  if (game.mode !== "play") return;
  const open = drawer.classList.contains("drawer-open");
  setDrawerOpen(!open);
  renderMovesTableNow();
});

document.getElementById("reviewBtn").addEventListener("click", () => {
  if (game.mode !== "play") return;
  game.enterReviewAtEnd();
  setMode("review");
});

// --- Bottom REVIEW controls ---
document.getElementById("revStartBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.gotoReviewPly(0);
  renderMovesTableNow();
});
document.getElementById("revBackBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.gotoReviewPly(game.reviewPly - 1);
  renderMovesTableNow();
});
document.getElementById("revFwdBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.gotoReviewPly(game.reviewPly + 1);
  renderMovesTableNow();
});
document.getElementById("revEndBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.enterReviewAtEnd();
  renderMovesTableNow();
});
document.getElementById("revCancelBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.exitReviewCancel();
  setMode("play");
});
document.getElementById("revPlayHereBtn").addEventListener("click", () => {
  if (game.mode !== "review") return;
  game.playFromHere();
  setMode("play");
});

// --- Move table rendering ---
let lastAutoScrollKey = "";

function renderMovesTable() {
  const rows = game.getMoveRows();
  const activePly = (game.mode === "review") ? game.reviewPly : game.getCurrentPly();

  // Rebuild table
  movesTable.innerHTML = "";

  let activeEl = null;
  const activeIsPly0 = (activePly === 0);
  
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
      activeEl = rowEl; // <-- row, not cell
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
      activeEl = rowEl; // <-- row, not cell
    }
    
    if (r.black && game.mode === "review") {
      bEl.addEventListener("click", () => {
        game.gotoReviewPly(r.black.ply);
      });
    }

    rowEl.appendChild(bEl);

    movesTable.appendChild(rowEl);
  }

  // Auto-scroll: keep the active ply fully visible (iOS-safe).
  // Only do this when (mode, ply) changes (prevents fighting the user's scroll).
  const autoKey = `${game.mode}|${activePly}`;
  if ((activeEl || activeIsPly0) && autoKey !== lastAutoScrollKey) {
    
    lastAutoScrollKey = autoKey;

    const scroller = movesTable;
    
    // Special-case ply 0 (start position): there is no move row, so scroll to top.
    if (activeIsPly0) {
      requestAnimationFrame(() => {
        scroller.scrollTop = 0;
        requestAnimationFrame(() => {
          scroller.scrollTop = 0;
        });
      });
      return;
    }
    
    // Ensure the active row is fully visible within the movesTable scroller.
    const ensureFullyVisible = () => {
      const pad = 12; // px inside the scroller (keeps row from kissing edges)
    
      // Measure in the same coordinate system (viewport), then convert to scrollTop space.
      const scRect = scroller.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
    
      const top = (elRect.top - scRect.top) + scroller.scrollTop;
      const bottom = top + elRect.height;
    
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;
    
      if (bottom + pad > viewBottom) {
        scroller.scrollTop = (bottom + pad) - scroller.clientHeight;
      } else if (top - pad < viewTop) {
        scroller.scrollTop = Math.max(0, top - pad);
      }
    };

    // iOS/transform drawers: layout settles after paint. Do it twice.
    requestAnimationFrame(() => {
      ensureFullyVisible();
      requestAnimationFrame(() => {
        ensureFullyVisible();
      });
    });
  }
}

let lastTableSig = "";

function currentTableSig() {
  return `${game.mode}|${game.reviewPly}|${game.getUIVersion()}|${game.getPositionVersion()}|${game.getCurrentPly()}`;
}

// Call this instead of renderMovesTable() anywhere you do it manually.
// It prevents maybeUpdateMovesTable() from immediately re-rendering and undoing scroll.
function renderMovesTableNow() {
  lastTableSig = currentTableSig();
  renderMovesTable();
}

function maybeUpdateMovesTable() {
  const drawerOpen = drawer.classList.contains("drawer-open");
  const shouldShow = drawerOpen || game.mode === "review";
  if (!shouldShow) return;

  const sig = currentTableSig();
  if (sig === lastTableSig) return;

  renderMovesTableNow();
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
renderMovesTableNow();

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
