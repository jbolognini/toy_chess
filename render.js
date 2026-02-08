// render.js

// Loud fallback so theme bugs are obvious.
// If you ever see these colors, CSS theme tokens are missing or not loaded.
const ERROR_THEME = {
  text: "#ff2bd6",
  textMuted: "#ff2bd6",

  boardLight: "#ff0000", // bright red
  boardDark: "#00ffff",  // cyan

  overlay: {
    lastFrom: "rgba(255,0,255,0.65)",
    lastTo: "rgba(0,255,255,0.65)",
    selected: "rgba(255,255,0,0.65)",
    legal: "rgba(0,255,0,0.65)",
    capture: "rgba(255,0,0,0.65)",
    check: "rgba(255,128,0,0.65)",
  },

  eval: {
    track: "rgba(255,0,255,0.35)",
    white: "rgba(255,255,255,0.95)",
    black: "rgba(0,0,0,0.95)",
  },

  coords: {
    light: "rgba(0,0,0,0.95)",
    dark: "rgba(255,255,255,0.95)",
  },

  promo: {
    scrim: "rgba(255,0,255,0.35)",
    tileWhite: "rgba(255,255,0,0.70)",
    tileBlack: "rgba(0,255,255,0.70)",
    strokeWhite: "rgba(255,0,0,0.90)",
    strokeBlack: "rgba(0,255,0,0.90)",
  },

  captured: {
    haloTintWhite: "rgba(255, 0, 255, 1.0)", // loud = missing
    haloTintWhiteKey: "white",
    haloTintBlack: "rgba(255, 0, 255, 1.0)", // loud = missing
    haloTintBlackKey: "black",
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
    
    // Asset existence + tinted halo caches
    this._assetState = new Map();     // assetCode -> "ok" | "bad" | "pending"
    this._haloTintCache = new Map();  // `${assetCode}|${tintKey}` -> offscreen canvas

    // Eval animation state
    this._eval = null;
  }

  setTheme(theme) {
    this.theme = mergeThemeStrict(ERROR_THEME, theme);
    this._themeOk = this.theme.boardLight !== ERROR_THEME.boardLight;
  }

  getSprite(code) {
    if (this.sprites.has(code)) return this.sprites.get(code);
    const img = new Image();
    img.src = `./assets/${code}.png`;
    this.sprites.set(code, img);
    return img;
  }

  _hasAsset(assetCode) {
    const st = this._assetState.get(assetCode);
    if (st === "ok") return true;
    if (st === "bad") return false;

    // Probe-load once
    const img = this.getSprite(assetCode);
    this._assetState.set(assetCode, "pending");

    if (!img.__assetProbeHooked) {
      img.__assetProbeHooked = true;
      img.onload = () => this._assetState.set(assetCode, "ok");
      img.onerror = () => this._assetState.set(assetCode, "bad");
    }
    
    // While pending, assume it will exist (prevents flicker logic branches)
    return true;
  }

  getHaloSpriteFor(code) {
    // Prefer exact match first, e.g. "bp_halo"
    const exact = `${code}_halo`;
    if (this._hasAsset(exact)) return exact;

    // Fallback: only white halos exist, so "bp" -> "wp_halo"
    const fallback = `w${code[1]}_halo`;
    if (this._hasAsset(fallback)) return fallback;

    return null;
  }

  _getTintedHaloCanvas(haloAssetCode, tintKey, tintCss) {
    const key = `${haloAssetCode}|${tintKey}`;
    const cached = this._haloTintCache.get(key);
    if (cached) return cached;

    const img = this.getSprite(haloAssetCode);
    if (!img || !img.complete || img.naturalWidth === 0) return null;

    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;

    const cctx = c.getContext("2d");
    cctx.clearRect(0, 0, c.width, c.height);

    // Draw alpha mask
    cctx.drawImage(img, 0, 0);

    // Tint while preserving alpha
    cctx.globalCompositeOperation = "source-in";
    cctx.fillStyle = tintCss;
    cctx.fillRect(0, 0, c.width, c.height);
    cctx.globalCompositeOperation = "source-over";

    this._haloTintCache.set(key, c);
    return c;
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
    const EDGE_PAD_PCT = 0.006;

    // Deterministic rule: eval-to-board gap is half of edge padding
    const GAP_IS_HALF_EDGE = true;

    // Optional: tiny safety pad (CSS px)
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

    // Tight edge padding from percentage, clamp to [min..max] in device px
    const edgePad = clamp(
      prelimSize * EDGE_PAD_PCT,
      px(EDGE_PAD_MIN_PX),
      px(EDGE_PAD_MAX_PX)
    );

    // Gap: half-edge or full edge
    const evalPad = GAP_IS_HALF_EDGE ? (edgePad * 0.5) : edgePad;

    const evalW = px(EVAL_BAR_W_PX);
    const leftInset = edgePad + evalW + evalPad;

    // Final available width for board after reserving eval gutter
    const availW = Math.max(1, w - leftInset - safePad * 2);
    const availH = availH0;

    // Board size
    const size = Math.max(1, Math.min(availW, availH) * BOARD_SCALE);
    const sq = size / 8;

    // Center board
    const ox = leftInset + safePad + (availW - size) / 2;
    const oy = hudH + safePad + (availH - size) / 2;

    const evalX = edgePad;
    const evalY = oy;
    const evalH = size;

    return {
      dpr, w, h,
      hudH,
      size, sq,
      ox, oy,
      evalRect: { x: evalX, y: evalY, w: evalW, h: evalH }
    };
  }

  draw() {
    const ctx = this.ctx;
    const geom = this.computeGeom();
    const { dpr, w, h, sq, ox, oy, evalRect, hudH, size } = geom;

    ctx.clearRect(0, 0, w, h);

    // --- HUD ---
    ctx.fillStyle = this.theme.text;
    ctx.font = `${Math.floor(14 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(this.game.statusText(), 10 * dpr, 18 * dpr);

    // Theme failure warning
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

    // --- Captured pieces strips (top + bottom, no wrap) ---
    this.drawCapturedStrips(ctx, { dpr, hudH, ox, oy, size, sq, w, h });

    // --- Precompute overlays (under coords/pieces) ---
    const lm = this.game.lastMove;
    const lmFrom = lm?.from || null;
    const lmTo = lm?.to || null;

    const turnColor = this.game.chessView?.turn?.() || "w";
    const inCheck =
      typeof this.game.chessView?.inCheck === "function" ? this.game.chessView.inCheck()
      : typeof this.game.chessView?.isCheck === "function" ? this.game.chessView.isCheck()
      : false;

    const checkKing = inCheck ? this.findKingSquare(turnColor) : null;

    const sel = this.game.selected || null;
    const legal = this.game.legalTargets || [];
    const captureTargets = sel ? this.getSelectedCaptureTargets() : [];

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

        ctx.fillStyle = isLight ? this.theme.boardLight : this.theme.boardDark;
        ctx.fillRect(x, y, sq, sq);

        // Last move overlays
        if (lmFrom && lmFrom.x === c && lmFrom.y === r) {
          ctx.fillStyle = this.theme.overlay.lastFrom;
          ctx.fillRect(x, y, sq, sq);
        }
        if (lmTo && lmTo.x === c && lmTo.y === r) {
          ctx.fillStyle = this.theme.overlay.lastTo;
          ctx.fillRect(x, y, sq, sq);
        }

        // Check overlay
        if (checkKing && checkKing.x === c && checkKing.y === r) {
          ctx.fillStyle = this.theme.overlay.check;
          ctx.fillRect(x, y, sq, sq);
        }

        // Selection overlays
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

        // Coords on top
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

  // ============================================================
  // Captured pieces strips
  // ============================================================

  drawCapturedStrips(ctx, g) {
    const { dpr, hudH, ox, oy, size, sq, w, h } = g;

    // Tunables
    const STRIP_MARGIN_PX = 6;      // gap from board
    const ICON_PCT = 0.42;          // icon size relative to square
    const ICON_GAP_PX = 3;          // spacing between icons
    const HALO_SCALE = 1.05;        // halo size relative to icon
    const TEXT_GAP_PX = 6;          // gap between last icon and +V text
    const STRIP_PAD_PX = 4;         // left/right padding inside strip rect
    const FONT_PX = 12;             // material text size (CSS px)

    const px = (cssPx) => cssPx * dpr;
    const stripMargin = px(STRIP_MARGIN_PX);
    const icon = Math.floor(sq * ICON_PCT);
    const iconGap = px(ICON_GAP_PX);
    const stripPad = px(STRIP_PAD_PX);
    const textGap = px(TEXT_GAP_PX);
    const fontPx = px(FONT_PX);

    // Determine which capturer belongs to top/bottom based on flip
    const topCapturer = (typeof this.game.getTopCapturerColor === "function")
      ? this.game.getTopCapturerColor()
      : "w";

    const botCapturer = (typeof this.game.getBottomCapturerColor === "function")
      ? this.game.getBottomCapturerColor()
      : "b";

    // Primary grouped lists
    let topList = (typeof this.game.getCapturedGrouped === "function") ? this.game.getCapturedGrouped(topCapturer) : [];
    let botList = (typeof this.game.getCapturedGrouped === "function") ? this.game.getCapturedGrouped(botCapturer) : [];

    // Material +V text (only for advantaged side; other returns "")
    const topPlus = (typeof this.game.getMaterialPlusForColor === "function") ? this.game.getMaterialPlusForColor(topCapturer) : "";
    const botPlus = (typeof this.game.getMaterialPlusForColor === "function") ? this.game.getMaterialPlusForColor(botCapturer) : "";

    // Strip layout rects: above board and below board (clamped)
    const stripH = Math.max(icon, Math.floor(fontPx * 1.2));
    const stripW = size;

    // y positions (we allow overlapping HUD; we only avoid going off-canvas)
    let topY = Math.floor(oy - stripMargin - stripH);
    let botY = Math.floor(oy + size + stripMargin);

    topY = Math.max(0, topY);
    botY = Math.min(h - stripH, botY);

    const topRect = { x: Math.floor(ox), y: topY, w: Math.floor(stripW), h: Math.floor(stripH) };
    const botRect = { x: Math.floor(ox), y: botY, w: Math.floor(stripW), h: Math.floor(stripH) };

    // Fit check: if either row doesn't fit, fall back to differential mode (no wrapping)
    const fitsTop = this._capturedRowFits(ctx, topRect, topList, topPlus, { icon, iconGap, stripPad, textGap, fontPx });
    const fitsBot = this._capturedRowFits(ctx, botRect, botList, botPlus, { icon, iconGap, stripPad, textGap, fontPx });

    if (!(fitsTop && fitsBot) && typeof this.game.getCapturedDifferentialGrouped === "function") {
      const diff = this.game.getCapturedDifferentialGrouped();
      // diff.white are pieces showing WHITE's advantage (extra captured by white),
      // diff.black are pieces showing BLACK's advantage.
      const topIsWhite = topCapturer === "w";
      const botIsWhite = botCapturer === "w";

      topList = topIsWhite ? (diff.white || []) : (diff.black || []);
      botList = botIsWhite ? (diff.white || []) : (diff.black || []);
    }

    // Draw rows (left-aligned within board width)
    this._drawCapturedRow(ctx, topRect, topList, topPlus, { icon, iconGap, stripPad, textGap, fontPx, haloScale: HALO_SCALE });
    this._drawCapturedRow(ctx, botRect, botList, botPlus, { icon, iconGap, stripPad, textGap, fontPx, haloScale: HALO_SCALE });
  }

  _capturedRowFits(ctx, rect, list, plusText, k) {
    const { icon, iconGap, stripPad, textGap, fontPx } = k;
    const n = (list && list.length) ? list.length : 0;

    const iconsW = (n <= 0) ? 0 : (n * icon + (n - 1) * iconGap);

    let textW = 0;
    if (plusText) {
      ctx.save();
      ctx.font = `${Math.floor(fontPx)}px ui-monospace, Menlo, monospace`;
      textW = Math.ceil(ctx.measureText(plusText).width);
      ctx.restore();
    }

    const total = stripPad + iconsW + (plusText ? (textGap + textW) : 0) + stripPad;
    return total <= rect.w;
  }

  _drawCapturedRow(ctx, rect, list, plusText, k) {
    const { icon, iconGap, stripPad, textGap, fontPx, haloScale } = k;
  
    ctx.save();
    try {
      let x = rect.x + stripPad;
      const cy = rect.y + rect.h / 2;
  
      // Icons
      for (const code of (list || [])) {
        const haloAsset = this.getHaloSpriteFor(code);
        if (haloAsset) {
          const haloSize = icon * haloScale;
          const isBlackPiece = code[0] === "b";
  
          let haloImg = null;
  
          if (haloAsset.startsWith("w")) {
            // White halo asset — tint based on piece color
            if (isBlackPiece) {
              haloImg = this._getTintedHaloCanvas(
                haloAsset,
                this.theme.captured.haloTintBlackKey,
                this.theme.captured.haloTintBlack
              );
            } else {
              haloImg = this._getTintedHaloCanvas(
                haloAsset,
                this.theme.captured.haloTintWhiteKey,
                this.theme.captured.haloTintWhite
              );
            }
          } else {
            // Exact halo asset (bp_halo, etc)
            haloImg = this.getSprite(haloAsset);
          }
  
          // Safety: image may still be loading
          if (!haloImg) {
            haloImg = this.getSprite(haloAsset);
          }
  
          ctx.drawImage(
            haloImg,
            x + (icon - haloSize) / 2,
            cy - haloSize / 2,
            haloSize,
            haloSize
          );
        }
  
        // Piece on top
        const img = this.getSprite(code);
        ctx.drawImage(img, x, cy - icon / 2, icon, icon);
  
        x += icon + iconGap;
      }
  
      // +V text
      if (plusText) {
        x += textGap;
        ctx.fillStyle = this.theme.text;
        ctx.font = `${Math.floor(fontPx)}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(plusText, x, cy);
      }
    } finally {
      ctx.restore();
    }
  }

  // ============================================================
  // Eval bar
  // ============================================================

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

      // Split position
      const split = r.y + (1 - (this._eval.norm + 1) / 2) * r.h;

      // White (top)
      ctx.fillStyle = this.theme.eval.white;
      ctx.fillRect(r.x, r.y, r.w, Math.max(0, split - r.y));

      // Black (bottom)
      ctx.fillStyle = this.theme.eval.black;
      ctx.fillRect(r.x, split, r.w, Math.max(0, r.y + r.h - split));

      // Center line — strong near equal, aggressive fade after ~±2
      const midY = r.y + r.h / 2;
      const midIsInBlack = split < midY;

      const n = this._eval.norm;
      const cpAbs = Math.abs(n) * CLAMP_CP;

      const FADE_START_CP = 200;
      const FADE_END_CP = 400;

      let t = 1 - (cpAbs - FADE_START_CP) / (FADE_END_CP - FADE_START_CP);
      t = Math.max(0, Math.min(1, t));
      const nearEqual = t * t;

      const aLine = 0.06 + 0.70 * nearEqual;

      ctx.strokeStyle = midIsInBlack
        ? `rgba(255,255,255,${aLine})`
        : `rgba(0,0,0,${aLine})`;

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
        const t2 = now / 1000;

        const pulse = 0.10 + 0.06 * (0.5 + 0.5 * Math.sin(t2 * 4.0));
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);

        const scanY = r.y + ((t2 * 0.35) % 1.0) * r.h;
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(r.x, scanY, r.w, Math.max(1, Math.floor(2 * dpr)));
      }
    } finally {
      ctx.restore();
    }
  }

  // ============================================================
  // Promotion chooser
  // ============================================================

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

  // ============================================================
  // Coords / helpers
  // ============================================================

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
