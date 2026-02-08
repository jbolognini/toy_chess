// render.js

// Loud fallback so theme bugs are obvious.
// If you ever see these colors, CSS theme tokens are missing or not loaded.
const ERROR_THEME = {
  text: "#ff2bd6",
  textMuted: "#ff2bd6",

  boardLight: "#ff0000",  // bright red
  boardDark:  "#00ffff",  // cyan

  overlay: {
    lastFrom: "rgba(255,0,255,0.65)",
    lastTo:   "rgba(0,255,255,0.65)",
    selected: "rgba(255,255,0,0.65)",
    legal:    "rgba(0,255,0,0.65)",
    capture:  "rgba(255,0,0,0.65)",
    check:    "rgba(255,128,0,0.65)",
  },

  eval: {
    track: "rgba(255,0,255,0.35)",
    white: "rgba(255,255,255,0.95)",
    black: "rgba(0,0,0,0.95)",
  },

  coords: {
    light: "rgba(0,0,0,0.95)",
    dark:  "rgba(255,255,255,0.95)",
  },

  promo: {
    scrim: "rgba(255,0,255,0.35)",
    tileWhite: "rgba(255,255,0,0.70)",
    tileBlack: "rgba(0,255,255,0.70)",
    strokeWhite: "rgba(255,0,0,0.90)",
    strokeBlack: "rgba(0,255,0,0.90)",
  }
};

function isNonEmptyString(s) {
  return typeof s === "string" && s.trim().length > 0;
}

// Merge theme over ERROR_THEME, but *only* accept non-empty strings/objects.
// Anything missing stays loud.
function mergeThemeStrict(base, theme) {
  if (!theme || typeof theme !== "object") return base;

  const out = Array.isArray(base) ? base.slice() : { ...base };

  for (const [k, v] of Object.entries(theme)) {
    const bv = base[k];

    if (v && typeof v === "object" && !Array.isArray(v) && bv && typeof bv === "object") {
      out[k] = mergeThemeStrict(bv, v);
      continue;
    }

    if (isNonEmptyString(v)) {
      out[k] = v;
    }
  }

  return out;
}

export class Renderer {
  constructor(canvas, game, getDebug, theme) {
    this.ctx = canvas.getContext("2d");
    this.canvas = canvas;
    this.game = game;
    this.getDebug = getDebug;

    // theme is required long-term; for safety we fall back to defaults
    this.theme = mergeThemeStrict(ERROR_THEME, theme);
    this._themeOk = this.theme.boardLight !== ERROR_THEME.boardLight;

    this.sprites = new Map(); // code -> Image
    this.engine = null;       // set from main: renderer.engine = engine

    // Eval animation state
    this._eval = null;
  }

  setTheme(theme) {
    this.theme = mergeThemeStrict(ERROR_THEME, theme);
    this._themeOk = theme && typeof theme === "object";
  }

  getSprite(code) {
    if (this.sprites.has(code)) return this.sprites.get(code);
    const img = new Image();
    img.src = `./assets/${code}.png`;
    this.sprites.set(code, img);
    return img;
  }

  getSelectedCaptureTargets() {
    const sel = this.game.selected;
    if (!sel) return [];

    const out = [];
    const mover = this.game.pieceCodeAt(sel.x, sel.y);
    if (!mover) return out;

    const moverColor = mover[0]; // "w" or "b"
    for (const t of this.game.legalTargets) {
      const victim = this.game.pieceCodeAt(t.x, t.y);
      if (victim && victim[0] !== moverColor) out.push(t);
    }
    return out;
  }

  computeGeom() {
    // ============================================================
    // Knobs (tune here)
    // ============================================================
    const DPR_FLOOR = 1;

    // HUD height (CSS px)
    const HUD_H_PX = 46;

    // Board scale inside the usable area (1.0 = maximum fit)
    const BOARD_SCALE = 0.985;

    // Eval bar thickness (CSS px)
    const EVAL_BAR_W_PX = 14;

    // Edge padding: screen edge -> eval bar (CSS px), clamped
    const EDGE_PAD_MIN_PX = 0;
    const EDGE_PAD_MAX_PX = 6;

    // Default edge pad target as a fraction of board size (tight by default)
    // Example: 0.006 * 360px ≈ 2.2px, 0.006 * 520px ≈ 3.1px
    const EDGE_PAD_PCT = 0.006;

    // Deterministic rule: eval-to-board gap is half of edge padding
    const GAP_IS_HALF_EDGE = true;

    // Optional: tiny safety pad to prevent kissing HUD/bottom bars (CSS px)
    const BOARD_SAFE_PAD_PX = 0;

    // ============================================================
    // Helpers
    // ============================================================
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const dpr = Math.max(DPR_FLOOR, window.devicePixelRatio || 1);
    const w = this.canvas.width;
    const h = this.canvas.height;

    const px = (cssPx) => cssPx * dpr;

    const hudH = px(HUD_H_PX);
    const safePad = px(BOARD_SAFE_PAD_PX);

    // Available height below HUD
    const availH0 = Math.max(1, h - hudH - safePad * 2);
    const availW0 = Math.max(1, w - safePad * 2);

    // First estimate for board size to choose edge padding
    const prelimSize = Math.max(1, Math.min(availW0, availH0) * BOARD_SCALE);

    // Tight edge padding from percentage, then clamp to [0..6] CSS px (converted to device px)
    const edgePad = clamp(
      prelimSize * EDGE_PAD_PCT,
      px(EDGE_PAD_MIN_PX),
      px(EDGE_PAD_MAX_PX)
    );

    // Gap is deterministic: half of chosen edge padding
    const evalPad = GAP_IS_HALF_EDGE ? (edgePad * 0.5) : edgePad;

    const evalW = px(EVAL_BAR_W_PX);
    const leftInset = edgePad + evalW + evalPad;

    // Final available width for board after reserving eval gutter
    const availW = Math.max(1, w - leftInset - safePad * 2);
    const availH = availH0;

    // Final board size (apply BOARD_SCALE exactly once)
    const size = Math.max(1, Math.min(availW, availH) * BOARD_SCALE);
    const sq = size / 8;

    // Center board in remaining area
    const ox = leftInset + safePad + (availW - size) / 2;
    const oy = hudH + safePad + (availH - size) / 2;

    const evalX = edgePad;
    const evalY = oy;
    const evalH = size;

    return {
      dpr, w, h,
      hudH,
      size, sq,
      ox,
      oy,
      evalRect: { x: evalX, y: evalY, w: evalW, h: evalH }
    };
  }

  draw() {
    const ctx = this.ctx;
    const geom = this.computeGeom();
    const { dpr, w, h, sq, ox, oy, evalRect } = geom;

    ctx.clearRect(0, 0, w, h);

    // --- HUD ---
    ctx.fillStyle = this.theme.text;
    ctx.font = `${Math.floor(14 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(this.game.statusText(), 10 * dpr, 18 * dpr);
  
    // Theme failure warning (only if CSS vars missing)
    if (!this._themeOk) {
      ctx.save();
      ctx.fillStyle = "#ff2bd6";
      ctx.font = `${Math.floor(12 * dpr)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("THEME ERROR: CSS vars missing", 10 * dpr, 54 * dpr);
      ctx.restore();
    }

    const dbg = this.getDebug?.();
    if (dbg) {
      ctx.fillStyle = this.theme.textMuted;
      ctx.font = `${Math.floor(12 * dpr)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(dbg, 10 * dpr, 38 * dpr);
    }

    // --- Eval bar ---
    this.drawEvalBar(ctx, evalRect, dpr);

    // --- Precompute overlays (applied during square loop, under coords/pieces) ---
    const lm = this.game.lastMove;
    const lmFrom = lm?.from || null;
    const lmTo = lm?.to || null;

    const turnColor = this.game.chessView?.turn?.() || "w";
    const inCheck =
      typeof this.game.chessView?.inCheck === "function" ? this.game.chessView.inCheck() :
      typeof this.game.chessView?.isCheck === "function" ? this.game.chessView.isCheck() :
      false;

    const checkKing = inCheck ? this.findKingSquare(turnColor) : null;

    const sel = this.game.selected || null;
    const legal = this.game.legalTargets || [];
    const captureTargets = sel ? this.getSelectedCaptureTargets() : [];

    // Quick lookup sets
    const legalSet = new Set();
    for (const t of legal) legalSet.add(`${t.x},${t.y}`);

    const capSet = new Set();
    for (const t of captureTargets) capSet.add(`${t.x},${t.y}`);

    // --- Board ---
    const files = "abcdefgh";
    const flipped = this.game.flipped === true;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const x = ox + c * sq;
        const y = oy + r * sq;

        // Base square
        ctx.fillStyle = isLight ? this.theme.boardLight : this.theme.boardDark;
        ctx.fillRect(x, y, sq, sq);

        // --- Overlays (under coords, above square color) ---
        if (lmFrom && lmFrom.x === c && lmFrom.y === r) {
          ctx.fillStyle = this.theme.overlay.lastFrom; // FROM
          ctx.fillRect(x, y, sq, sq);
        }
        if (lmTo && lmTo.x === c && lmTo.y === r) {
          ctx.fillStyle = this.theme.overlay.lastTo; // TO
          ctx.fillRect(x, y, sq, sq);
        }

        if (checkKing && checkKing.x === c && checkKing.y === r) {
          ctx.fillStyle = this.theme.overlay.check;
          ctx.fillRect(x, y, sq, sq);
        }

        if (sel) {
          if (sel.x === c && sel.y === r) {
            ctx.fillStyle = this.theme.overlay.selected;
            ctx.fillRect(x, y, sq, sq);
          } else {
            const key = `${c},${r}`;
            if (capSet.has(key)) {
              ctx.fillStyle = this.theme.overlay.capture;
              ctx.fillRect(x, y, sq, sq);
            } else if (legalSet.has(key)) {
              ctx.fillStyle = this.theme.overlay.legal;
              ctx.fillRect(x, y, sq, sq);
            }
          }
        }

        // --- Coords (always on top of overlays) ---
        if (r === 7) {
          const fileChar = flipped ? files[7 - c] : files[c];
          this.drawCoords(ctx, x, y, sq, isLight, fileChar, "bl", dpr);
        }
        if (c === 7) {
          const rankNum = flipped ? String(r + 1) : String(8 - r);
          this.drawCoords(ctx, x, y, sq, isLight, rankNum, "tr", dpr);
        }
      }
    }

    // --- Pieces ---
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const code = this.game.pieceCodeAt(x, y);
        if (!code) continue;
        const img = this.getSprite(code);
        ctx.drawImage(img, ox + x * sq, oy + y * sq, sq, sq);
      }
    }

    // --- Promotion chooser ---
    if (this.game.pendingPromotion) {
      this.drawPromotionChooser(ctx, geom);
    }
  }

  drawEvalBar(ctx, r, dpr) {
    if (!this._eval) {
      this._eval = {
        norm: 0.0,
        target: 0.0,
        pending: false,
        lastT: performance.now()
      };
    }

    const engine = this.engine;
    const cp = engine ? engine.getLatestCp() : 0;
    const pending = engine ? engine.isPending() : false;

    const CLAMP_CP = 600;
    let target = Math.max(-CLAMP_CP, Math.min(CLAMP_CP, cp)) / CLAMP_CP;

    // Anchor to player side (invert when flipped)
    const flipped = this.game?.flipped === true;
    if (flipped) target = -target;

    const now = performance.now();
    const dt = Math.min(0.050, Math.max(0.001, (now - this._eval.lastT) / 1000));
    this._eval.lastT = now;

    this._eval.target = target;
    this._eval.pending = pending;

    // Smooth approach
    const smoothing = 14.0;
    const alpha = 1 - Math.exp(-smoothing * dt);
    this._eval.norm = this._eval.norm + (this._eval.target - this._eval.norm) * alpha;

    ctx.save();
    try {
      // Track
      ctx.fillStyle = this.theme.eval.track;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      
      // Split position: +1 => white wins => split high, -1 => split low
      const split = r.y + (1 - (this._eval.norm + 1) / 2) * r.h;
      
      // White region (top)
      ctx.fillStyle = this.theme.eval.white;
      ctx.fillRect(r.x, r.y, r.w, Math.max(0, split - r.y));
      
      // Black region (bottom)
      ctx.fillStyle = this.theme.eval.black;
      ctx.fillRect(r.x, split, r.w, Math.max(0, r.y + r.h - split));
      
      // Center line — contrast against the *actual* fill at midline
      const midY = r.y + r.h / 2;
      const midIsInBlack = split < midY;
      
      // Visibility: strongest near equal, never invisible
      const n = this._eval.norm; // [-1..+1]
      // Fade control: stark near equal, aggressive fade after ~±200cp (“±2 eval”)
      // n is [-1..+1] where 1 ~= CLAMP_CP, so map back to cp using your clamp.
      const CLAMP_CP = 600;                  // must match your cp->norm clamp
      const cpAbs = Math.abs(n) * CLAMP_CP;  // 0..CLAMP_CP
      
      const FADE_START_CP = 200;  // stay strong up to here
      const FADE_END_CP   = 400;  // mostly gone by here
      
      // 1.0 when <= start, 0.0 when >= end
      let t = 1 - (cpAbs - FADE_START_CP) / (FADE_END_CP - FADE_START_CP);
      t = Math.max(0, Math.min(1, t));
      
      // Make it drop *hard* after the start (aggressive fade)
      const nearEqual = t * t;   // square = more aggressive than linear
      
      // Alpha: strong when near equal, quickly fades out past ±2
      const alpha = 0.06 + 0.70 * nearEqual;
      
      // Opposite color of the background at midline
      ctx.strokeStyle = midIsInBlack
        ? `rgba(255,255,255,${alpha})`
        : `rgba(0,0,0,${alpha})`;
      
      // Two-pass stroke: soft + crisp
      ctx.beginPath();
      ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
      ctx.moveTo(r.x, midY);
      ctx.lineTo(r.x + r.w, midY);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.lineWidth = Math.max(1, Math.round(1 * dpr));
      ctx.moveTo(r.x, midY);
      ctx.lineTo(r.x + r.w, midY);
      ctx.stroke();
      
      // Thinking overlay
      if (this._eval.pending) {
        const t = now / 1000;
      
        const pulse = 0.10 + 0.06 * (0.5 + 0.5 * Math.sin(t * 4.0));
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      
        const scanY = r.y + ((t * 0.35) % 1.0) * r.h;
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(r.x, scanY, r.w, Math.max(1, Math.floor(2 * dpr)));
      }
    } finally {
      ctx.restore();
    }
  }

  drawPromotionChooser(ctx, geom) {
    const { dpr, sq, ox, oy, size } = geom;
    const { color, to } = this.game.pendingPromotion;

    const { x: toX, y: toY } = this.game.xyFromSquare(to);

    const box = Math.floor(sq * 0.78);
    const gap = Math.floor(sq * 0.08);
    const margin = Math.floor(sq * 0.12);

    const popupW = box * 4 + gap * 3;
    const popupH = box;

    const centerX = ox + (toX + 0.5) * sq;
    let startX = Math.floor(centerX - popupW / 2);

    const minX = Math.floor(ox);
    const maxX = Math.floor(ox + size - popupW);
    if (startX < minX) startX = minX;
    if (startX > maxX) startX = maxX;

    // Prefer ABOVE the board so the drawer never hides it (OK to overlap HUD)
    const aboveY = Math.floor(oy - popupH - margin);
    const belowY = Math.floor(oy + 8 * sq + margin);

    let y = (aboveY >= 0) ? aboveY : belowY;

    // Clamp within canvas
    const minY = 0;
    const maxY = Math.max(0, Math.floor(geom.h - popupH));
    if (y < minY) y = minY;
    if (y > maxY) y = maxY;

    // Backdrop
    ctx.fillStyle = this.theme.promo.scrim;
    ctx.fillRect(startX - margin, y - margin, popupW + margin * 2, popupH + margin * 2);

    const isBlack = color === "b";
    const pieces = ["q", "r", "b", "n"];

    for (let i = 0; i < 4; i++) {
      const x = startX + i * (box + gap);

      ctx.fillStyle = isBlack ? this.theme.promo.tileBlack : this.theme.promo.tileWhite;
      ctx.fillRect(x, y, box, box);

      ctx.strokeStyle = isBlack ? this.theme.promo.strokeBlack : this.theme.promo.strokeWhite;
      ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
      ctx.strokeRect(x, y, box, box);

      const code = `${color}${pieces[i]}`;
      const img = this.getSprite(code);
      ctx.drawImage(img, x, y, box, box);
    }
  }

  drawCoords(ctx, x, y, sq, isLight, text, corner, dpr) {
    ctx.save();
    try {
      const isDigit = text >= "0" && text <= "9";

      const basePx = Math.floor(sq * 0.18);
      const fontPx = Math.max(10 * dpr, Math.floor(basePx * (isDigit ? 0.88 : 1.0)));

      ctx.font = `${fontPx}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = isLight ? this.theme.coords.light : this.theme.coords.dark;

      const pad = Math.max(2 * dpr, Math.floor(sq * 0.045));

      if (corner === "bl") {
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, x + pad, y + sq - pad);
      } else {
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(text, x + sq - pad, y + pad);
      }
    } finally {
      ctx.restore();
    }
  }

  drawSquareOverlay(ctx, ox, oy, sq, x, y, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(ox + x * sq, oy + y * sq, sq, sq);
  }

  findKingSquare(color) {
    const target = color === "w" ? "wk" : "bk";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (this.game.pieceCodeAt(x, y) === target) return { x, y };
      }
    }
    return null;
  }
}
