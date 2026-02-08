export class Renderer {
  constructor(canvas, game, getDebug) {
    this.ctx = canvas.getContext("2d");
    this.canvas = canvas;
    this.game = game;
    this.getDebug = getDebug;

    this.sprites = new Map(); // code -> Image
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
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const hudH = 46 * dpr;

    // Left eval gutter (placeholder)
    const evalOuterMargin = 8 * dpr;
    const evalW = 16 * dpr;
    const evalPad = 10 * dpr;
    const leftInset = evalOuterMargin + evalW + evalPad;

    const availW = Math.max(1, w - leftInset);
    const availH = Math.max(1, h - hudH);

    const size = Math.min(availW, availH) * 0.94;
    const sq = size / 8;

    const boardX0 = leftInset + (availW - size) / 2;
    const boardY0 = hudH + (availH - size) / 2;

    const evalX = evalOuterMargin;
    const evalY = boardY0;
    const evalH = size;

    return {
      dpr, w, h,
      hudH,
      size, sq,
      ox: boardX0,
      oy: boardY0,
      evalRect: { x: evalX, y: evalY, w: evalW, h: evalH }
    };
  }

  draw() {
    const ctx = this.ctx;
    const geom = this.computeGeom();
    const { dpr, w, h, sq, ox, oy, evalRect } = geom;
  
    ctx.clearRect(0, 0, w, h);
  
    // --- HUD ---
    ctx.fillStyle = "#ddd";
    ctx.font = `${Math.floor(14 * dpr)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(this.game.statusText(), 10 * dpr, 18 * dpr);
  
    const dbg = this.getDebug?.();
    if (dbg) {
      ctx.fillStyle = "#888";
      ctx.font = `${Math.floor(12 * dpr)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(dbg, 10 * dpr, 38 * dpr);
    }
  
    // --- Eval placeholder ---
    this.drawEvalPlaceholder(ctx, evalRect, dpr);
  
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
  
    // Build quick lookup sets for target overlays (avoid O(64*N) scans)
    const legalSet = new Set();
    for (const t of legal) legalSet.add(`${t.x},${t.y}`);
  
    const capSet = new Set();
    for (const t of captureTargets) capSet.add(`${t.x},${t.y}`);
  
    // --- Board ---
    const files = "abcdefgh";
    const flipped = this.game.flipped === true; // future flip button can set game.flipped
  
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const x = ox + c * sq;
        const y = oy + r * sq;
  
        // Base square
        ctx.fillStyle = isLight ? "#ddd" : "#666";
        ctx.fillRect(x, y, sq, sq);
  
        // --- Overlays (under coords, above square color) ---
  
        // Last move: from/to
        if (lmFrom && lmFrom.x === c && lmFrom.y === r) {
          ctx.fillStyle = "rgba(255, 215, 0, 0.28)"; // FROM
          ctx.fillRect(x, y, sq, sq);
        }
        if (lmTo && lmTo.x === c && lmTo.y === r) {
          ctx.fillStyle = "rgba(255, 235, 90, 0.40)"; // TO
          ctx.fillRect(x, y, sq, sq);
        }
  
        // King in check (side to move in view)
        if (checkKing && checkKing.x === c && checkKing.y === r) {
          ctx.fillStyle = "rgba(255, 0, 0, 0.22)";
          ctx.fillRect(x, y, sq, sq);
        }
  
        // Selection + targets (play only)
        if (sel) {
          if (sel.x === c && sel.y === r) {
            ctx.fillStyle = "rgba(255,255,0,0.22)";
            ctx.fillRect(x, y, sq, sq);
          } else {
            const key = `${c},${r}`;
            if (capSet.has(key)) {
              ctx.fillStyle = "rgba(255,0,0,0.18)"; // capture threats
              ctx.fillRect(x, y, sq, sq);
            } else if (legalSet.has(key)) {
              ctx.fillStyle = "rgba(0,255,0,0.16)"; // quiet/legal targets
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
  
    // --- Pieces (from view) ---
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const code = this.game.pieceCodeAt(x, y);
        if (!code) continue;
        const img = this.getSprite(code);
        ctx.drawImage(img, ox + x * sq, oy + y * sq, sq, sq);
      }
    }
  
    // --- Promotion chooser (only in play mode) ---
    if (this.game.pendingPromotion) {
      this.drawPromotionChooser(ctx, geom);
    }
  }

  drawEvalPlaceholder(ctx, r, dpr) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h / 2);
    ctx.lineTo(r.x + r.w, r.y + r.h / 2);
    ctx.stroke();
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

    // Always prefer ABOVE the board so the drawer never hides it.
    // (We don't care if it overlaps the HUD.)
    const aboveY = Math.floor(oy - popupH - margin);
    const belowY = Math.floor(oy + 8 * sq + margin);
    
    // If above would start above the canvas, fall back to below.
    let y = (aboveY >= 0) ? aboveY : belowY;
    
    // Clamp within canvas so it is always visible
    const minY = 0;
    const maxY = Math.max(0, Math.floor(geom.h - popupH));
    if (y < minY) y = minY;
    if (y > maxY) y = maxY;
    
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(startX - margin, y - margin, popupW + margin * 2, popupH + margin * 2);

    const isBlack = color === "b";
    const pieces = ["q", "r", "b", "n"];
    
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (box + gap);
    
      // Light gray panels for black pieces (better contrast than translucent white)
      ctx.fillStyle = isBlack
        ? "rgba(220,220,220,0.55)"
        : "rgba(255,255,255,0.12)";
    
      ctx.fillRect(x, y, box, box);
    
      ctx.strokeStyle = isBlack
        ? "rgba(255,255,255,0.55)"
        : "rgba(255,255,255,0.35)";
    
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
      ctx.fillStyle = isLight
        ? "rgba(0,0,0,0.35)"
        : "rgba(255,255,255,0.45)";
    
      const pad = Math.max(2 * dpr, Math.floor(sq * 0.045));
  
      if (corner === "bl") {
        // bottom-left: anchor on alphabetic baseline near bottom
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, x + pad, y + sq - pad);
      } else {
        // top-right: anchor on top baseline near top
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
    // color: "w" or "b"
    // Uses your existing pieceCodeAt(x,y) which returns like "wk", "bk", etc.
    const target = color === "w" ? "wk" : "bk";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (this.game.pieceCodeAt(x, y) === target) return { x, y };
      }
    }
    return null;
  }

}
