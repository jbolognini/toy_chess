// theme.js

const TOKENS = [
  // App surfaces
  "app-bg", "bar-bg", "drawer-bg",
  // Text
  "text", "text-muted",
  // Board
  "board-light", "board-dark",
  // Overlays
  "ov-last-from", "ov-last-to", "ov-selected", "ov-legal", "ov-capture", "ov-check",
  // Eval
  "eval-track", "eval-white", "eval-black",
  // Captured halos
  "captured-halo-white",
  "captured-halo-black",
];

function readCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

export function loadTheme() {
  const raw = {};
  for (const k of TOKENS) raw[k] = readCssVar(k);

  // Provide a nicer JS shape so canvas code stays clean
  return {
    appBg: raw["app-bg"],
    barBg: raw["bar-bg"],
    drawerBg: raw["drawer-bg"],
  
    text: raw["text"],
    textMuted: raw["text-muted"],
  
    boardLight: raw["board-light"],
    boardDark: raw["board-dark"],
  
    overlay: {
      lastFrom: raw["ov-last-from"],
      lastTo: raw["ov-last-to"],
      selected: raw["ov-selected"],
      legal: raw["ov-legal"],
      capture: raw["ov-capture"],
      check: raw["ov-check"],
    },
  
    eval: {
      track: raw["eval-track"],
      white: raw["eval-white"],
      black: raw["eval-black"],
    },
  
    captured: {
      haloTintWhite: raw["captured-halo-white"],
      haloTintWhiteKey: "white",
      haloTintBlack: raw["captured-halo-black"],
      haloTintBlackKey: "black",
    },
  };
}
